const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { dispatch } = require('../webhooks/dispatcher');
const { sendCompletionEmail } = require('../services/email');
const { sendDocument } = require('../services/docuseal');
const { createCandidateAndInvitation } = require('../services/checkr');
const { createCheckoutSession } = require('../services/stripe');

// Load a task + assert the caller (a client) is assigned to its journey.
async function loadOwnedTask(req, taskId) {
  const { rows } = await pool.query(
    `SELECT t.*, s.journey_id, j.business_id FROM tasks t
     JOIN sections s ON t.section_id=s.id JOIN journeys j ON s.journey_id=j.id WHERE t.id=$1`, [taskId]
  );
  if (!rows.length) return null;
  const task = rows[0];
  if (task.business_id !== req.user.business_id) return null;
  const { rows: assigned } = await pool.query('SELECT 1 FROM client_journeys WHERE client_id=$1 AND journey_id=$2', [req.user.id, task.journey_id]);
  if (!assigned.length) return null;
  return task;
}

// POST /progress/tasks/:taskId/fields/:fieldId — save a client's answer to
// one field on a Form/Quiz/Learn step. If the field is the consent checkbox
// on a background-check step, this is also what triggers the real Checkr
// request. Real persistence either way — no fake "saved" state.
router.post('/tasks/:taskId/fields/:fieldId', auth(), async (req, res) => {
  const { value } = req.body;
  try {
    const task = await loadOwnedTask(req, req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Not found' });
    const field = (task.fields || []).find(f => f.id === req.params.fieldId);
    if (!field) return res.status(404).json({ error: 'Field not found' });

    await pool.query(
      `INSERT INTO task_responses (client_id, task_id, field_id, value) VALUES ($1,$2,$3,$4)
       ON CONFLICT (client_id, task_id, field_id) DO UPDATE SET value=$4, updated_at=NOW()`,
      [req.user.id, task.id, field.id, JSON.stringify(value)]
    );

    // Background check: consent field on a Check step (non-quiz) with value truthy.
    const isQuiz = (task.fields || []).some(f => f.type === 'Multiple choice');
    if (task.step_type === 'Check' && !isQuiz && field.type === 'Checkbox' && value) {
      const { rows: [client] } = await pool.query('SELECT id,name,email FROM users WHERE id=$1', [req.user.id]);
      createCandidateAndInvitation({ client, task }).catch(console.error);
    }

    res.json({ saved: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /progress/tasks/:taskId/pay — create a real Stripe Checkout session.
// Returns 501 with a clear message if STRIPE_SECRET_KEY isn't configured,
// rather than pretending a payment happened.
router.post('/tasks/:taskId/pay', auth(), async (req, res) => {
  try {
    const task = await loadOwnedTask(req, req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Not found' });
    if (task.step_type !== 'Pay' || !task.payment_amount_cents) return res.status(400).json({ error: 'This step is not a payment step' });
    if (!process.env.STRIPE_SECRET_KEY) return res.status(501).json({ error: 'Payments are not configured yet. Ask your admin to add a Stripe key.' });

    const { rows: [client] } = await pool.query('SELECT id,name,email FROM users WHERE id=$1', [req.user.id]);
    const session = await createCheckoutSession({ client, task });
    await pool.query(
      `INSERT INTO payments (client_id, task_id, stripe_session_id, amount_cents, currency, status) VALUES ($1,$2,$3,$4,$5,'pending')`,
      [req.user.id, task.id, session.id, task.payment_amount_cents, task.payment_currency || 'usd']
    );
    res.json({ url: session.url });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message || 'Server error' }); }
});

router.post('/tasks/:taskId/complete', auth(), async (req, res) => {
  const clientId = req.user.id;
  const { taskId } = req.params;

  try {
    // Gather context
    const { rows: taskRows } = await pool.query(
      `SELECT t.*, s.journey_id, s.id AS section_id, s.title AS section_title, j.business_id, j.name AS journey_name
       FROM tasks t JOIN sections s ON t.section_id=s.id JOIN journeys j ON s.journey_id=j.id WHERE t.id=$1`, [taskId]
    );
    if (!taskRows.length) return res.status(404).json({ error: 'Not found' });
    const task = taskRows[0];
    if (task.business_id !== req.user.business_id) return res.status(404).json({ error: 'Not found' });

    const { rows: assigned } = await pool.query(
      'SELECT 1 FROM client_journeys WHERE client_id=$1 AND journey_id=$2', [clientId, task.journey_id]
    );
    if (!assigned.length) return res.status(403).json({ error: 'This journey is not assigned to you' });

    await pool.query(
      `INSERT INTO task_completions (client_id,task_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [clientId, taskId]
    );

    const { rows: clientRows } = await pool.query('SELECT id,email,name FROM users WHERE id=$1', [clientId]);
    const client = clientRows[0];
    const journey = { id: task.journey_id, name: task.journey_name };

    // Fire task.completed webhook
    dispatch('task.completed', {
      client: { id: client.id, email: client.email, name: client.name },
      task: { id: task.id, title: task.title, tag: task.tag },
      journey,
    }, task.business_id).catch(console.error);

    // If this task has a DocuSeal doc with trigger='completion', send it now
    if (task.docuseal_template_id && task.docuseal_trigger === 'completion') {
      sendDocument({ client, task, journeyId: task.journey_id }).catch(console.error);
    }

    // Check if the entire section is now complete
    const { rows: secTasks } = await pool.query(
      `SELECT t.id FROM tasks t WHERE t.section_id=$1`, [task.section_id]
    );
    const { rows: secDone } = await pool.query(
      `SELECT task_id FROM task_completions WHERE client_id=$1 AND task_id=ANY($2)`,
      [clientId, secTasks.map(t => t.id)]
    );
    if (secDone.length === secTasks.length && secTasks.length > 0) {
      dispatch('section.completed', {
        client: { id: client.id, email: client.email, name: client.name },
        section: { id: task.section_id, title: task.section_title },
        journey,
      }, task.business_id).catch(console.error);
    }

    // Check if the entire journey is complete
    const { rows: allTasks } = await pool.query(
      `SELECT t.id FROM tasks t JOIN sections s ON t.section_id=s.id WHERE s.journey_id=$1`, [task.journey_id]
    );
    const { rows: allDone } = await pool.query(
      `SELECT task_id FROM task_completions WHERE client_id=$1 AND task_id=ANY($2)`,
      [clientId, allTasks.map(t => t.id)]
    );
    if (allDone.length >= allTasks.length && allTasks.length > 0) {
      await pool.query(
        `UPDATE client_journeys SET completed_at=NOW() WHERE client_id=$1 AND journey_id=$2 AND completed_at IS NULL`,
        [clientId, task.journey_id]
      );
      dispatch('journey.completed', {
        client: { id: client.id, email: client.email, name: client.name },
        journey,
      }, task.business_id).catch(console.error);
      sendCompletionEmail({ to: client.email, name: client.name, journeyName: journey.name }).catch(console.error);
    }

    res.json({ completed: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/tasks/:taskId/complete', auth(), async (req, res) => {
  await pool.query('DELETE FROM task_completions WHERE client_id=$1 AND task_id=$2', [req.user.id, req.params.taskId]);
  const { rows } = await pool.query(
    `SELECT s.journey_id FROM tasks t JOIN sections s ON t.section_id=s.id WHERE t.id=$1`, [req.params.taskId]
  );
  if (rows.length) {
    await pool.query(`UPDATE client_journeys SET completed_at=NULL WHERE client_id=$1 AND journey_id=$2`, [req.user.id, rows[0].journey_id]);
  }
  res.json({ completed: false });
});

module.exports = router;
