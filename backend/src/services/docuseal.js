const fetch = require('node-fetch');
const pool = require('../db/pool');
const { dispatch } = require('../webhooks/dispatcher');

const BASE = process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com';
const KEY  = process.env.DOCUSEAL_API_KEY;

function dsHeaders() {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': KEY };
}

/**
 * Send a DocuSeal document to a client for signing.
 * Called when a task with a docuseal_template_id is triggered.
 */
async function sendDocument({ client, task, journeyId }) {
  if (!KEY) {
    console.warn('[docuseal] DOCUSEAL_API_KEY not set — skipping document send');
    return null;
  }

  try {
    const res = await fetch(`${BASE}/submissions`, {
      method: 'POST',
      headers: dsHeaders(),
      body: JSON.stringify({
        template_id: task.docuseal_template_id,
        send_email: true,
        submitters: [
          {
            role: 'First Party',
            email: client.email,
            name: client.name,
            // Pass metadata so DocuSeal webhook can route back to us
            metadata: {
              crm_client_id: client.id,
              crm_task_id: task.id,
              crm_journey_id: journeyId,
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[docuseal] Failed to create submission:', err);
      return null;
    }

    const data = await res.json();
    const submissionId = data.id?.toString();

    // Store submission record
    await pool.query(
      `INSERT INTO docuseal_submissions
         (client_id, task_id, docuseal_submission_id, template_id, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [client.id, task.id, submissionId, task.docuseal_template_id]
    );

    console.log(`[docuseal] Submission ${submissionId} created for ${client.email}`);
    return data;
  } catch (err) {
    console.error('[docuseal] Error sending document:', err.message);
    return null;
  }
}

/**
 * Handle inbound webhook from DocuSeal when a document is signed.
 * POST /docuseal/webhook
 */
async function handleInboundWebhook(req, res) {
  const event = req.body;

  // DocuSeal sends event_type: 'form.completed' when all parties have signed
  if (event?.event_type !== 'form.completed') {
    return res.json({ received: true });
  }

  const submissionId = event?.data?.submission_id?.toString()
    || event?.data?.id?.toString();

  if (!submissionId) return res.status(400).json({ error: 'No submission_id' });

  try {
    // Look up the submission
    const { rows } = await pool.query(
      `SELECT ds.*, u.email, u.name, u.id AS user_id, u.business_id
       FROM docuseal_submissions ds
       JOIN users u ON ds.client_id = u.id
       WHERE ds.docuseal_submission_id = $1`,
      [submissionId]
    );

    if (!rows.length) {
      console.warn('[docuseal] Unknown submission_id:', submissionId);
      return res.json({ received: true });
    }

    const sub = rows[0];

    // Mark submission as completed
    const documentUrl = event?.data?.documents?.[0]?.url || null;
    await pool.query(
      `UPDATE docuseal_submissions SET status='completed', signed_at=NOW(), document_url=$1
       WHERE id=$2`,
      [documentUrl, sub.id]
    );

    // If this submission is linked to a task — auto-complete that task
    if (sub.task_id) {
      await pool.query(
        `INSERT INTO task_completions (client_id, task_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [sub.client_id, sub.task_id]
      );
    }

    // Fire document.signed webhook event
    const { rows: taskRows } = await pool.query(
      `SELECT t.*, s.journey_id FROM tasks t JOIN sections s ON t.section_id=s.id WHERE t.id=$1`,
      [sub.task_id]
    );

    dispatch('document.signed', {
      client: { id: sub.client_id, email: sub.email, name: sub.name },
      task: taskRows[0] || null,
      submission: {
        id: sub.id,
        docuseal_submission_id: submissionId,
        document_url: documentUrl,
        signed_at: new Date().toISOString(),
      },
    }, sub.business_id).catch(console.error);

    res.json({ received: true });
  } catch (err) {
    console.error('[docuseal] Webhook error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = { sendDocument, handleInboundWebhook };
