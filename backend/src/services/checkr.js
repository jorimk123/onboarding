const fetch = require('node-fetch');
const pool = require('../db/pool');
const { dispatch } = require('../webhooks/dispatcher');

// Checkr API — https://docs.checkr.com
// Uses HTTP Basic auth with the secret API key as the username, no password.
const BASE = process.env.CHECKR_API_URL || 'https://api.checkr.com/v1';
const KEY = process.env.CHECKR_API_KEY;

function authHeader() {
  return { Authorization: 'Basic ' + Buffer.from(`${KEY}:`).toString('base64'), 'Content-Type': 'application/json' };
}

/**
 * Create a Checkr candidate + invitation once a client checks the consent
 * box on a Background check step. Real API call, gated on CHECKR_API_KEY —
 * no-ops (with a log) if it isn't configured yet.
 */
async function createCandidateAndInvitation({ client, task }) {
  if (!KEY) {
    console.warn('[checkr] CHECKR_API_KEY not set — skipping background check');
    return null;
  }
  try {
    const candRes = await fetch(`${BASE}/candidates`, {
      method: 'POST', headers: authHeader(),
      body: JSON.stringify({ email: client.email, first_name: (client.name || '').split(' ')[0], last_name: (client.name || '').split(' ').slice(1).join(' ') || '-' }),
    });
    if (!candRes.ok) { console.error('[checkr] candidate create failed:', await candRes.text()); return null; }
    const candidate = await candRes.json();

    const invRes = await fetch(`${BASE}/invitations`, {
      method: 'POST', headers: authHeader(),
      body: JSON.stringify({ candidate_id: candidate.id, package: task.checkr_package || 'basic_criminal' }),
    });
    if (!invRes.ok) { console.error('[checkr] invitation create failed:', await invRes.text()); return null; }
    const invitation = await invRes.json();

    await pool.query(
      `INSERT INTO background_checks (client_id, task_id, checkr_candidate_id, status) VALUES ($1,$2,$3,'pending')`,
      [client.id, task.id, candidate.id]
    );
    console.log(`[checkr] Invitation ${invitation.id} sent to ${client.email}`);
    return invitation;
  } catch (err) {
    console.error('[checkr] Error:', err.message);
    return null;
  }
}

/**
 * Handle inbound Checkr webhook (report.completed). Marks the background
 * check row + auto-completes the task when the report clears.
 */
async function handleInboundWebhook(req, res) {
  const event = req.body;
  const type = event?.type;
  if (!type || !type.startsWith('report.')) return res.json({ received: true });

  const report = event?.data?.object;
  const candidateId = report?.candidate_id;
  if (!candidateId) return res.json({ received: true });

  try {
    const { rows } = await pool.query(
      `SELECT bc.*, u.email, u.name, u.business_id FROM background_checks bc
       JOIN users u ON u.id = bc.client_id WHERE bc.checkr_candidate_id=$1 ORDER BY bc.created_at DESC LIMIT 1`,
      [candidateId]
    );
    if (!rows.length) return res.json({ received: true });
    const bc = rows[0];

    const status = report.status === 'clear' ? 'clear' : report.status === 'consider' ? 'consider' : report.status === 'suspended' ? 'suspended' : 'pending';
    await pool.query(
      `UPDATE background_checks SET status=$1, checkr_report_id=$2, completed_at=NOW() WHERE id=$3`,
      [status, report.id, bc.id]
    );

    if (status === 'clear' && bc.task_id) {
      await pool.query(`INSERT INTO task_completions (client_id, task_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [bc.client_id, bc.task_id]);
    }

    dispatch('background_check.updated', {
      client: { id: bc.client_id, email: bc.email, name: bc.name },
      status,
    }, bc.business_id).catch(console.error);

    res.json({ received: true });
  } catch (err) {
    console.error('[checkr] Webhook error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = { createCandidateAndInvitation, handleInboundWebhook };
