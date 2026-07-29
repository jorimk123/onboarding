const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { dispatch } = require('../webhooks/dispatcher');
const { sendWelcomeEmail } = require('../services/email');
const { sendDocument } = require('../services/docuseal');

router.get('/', auth('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.name, u.company, u.created_at,
        COALESCE(json_agg(
          json_build_object(
            'id', cj.id, 'journey_id', cj.journey_id, 'journey_name', j.name,
            'assigned_at', cj.assigned_at, 'completed_at', cj.completed_at,
            'task_count', (SELECT COUNT(*) FROM tasks t JOIN sections s ON t.section_id=s.id WHERE s.journey_id=j.id),
            'completed_count', (SELECT COUNT(*) FROM task_completions tc JOIN tasks t ON tc.task_id=t.id JOIN sections s ON t.section_id=s.id WHERE s.journey_id=j.id AND tc.client_id=u.id)
          ) ORDER BY cj.assigned_at DESC
        ) FILTER (WHERE cj.id IS NOT NULL), '[]') AS journeys
      FROM users u
      LEFT JOIN client_journeys cj ON cj.client_id=u.id
      LEFT JOIN journeys j ON cj.journey_id=j.id
      WHERE u.role='client' AND u.business_id=$1 GROUP BY u.id ORDER BY u.created_at DESC`, [req.user.business_id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/:clientId/assign', auth('admin'), async (req, res) => {
  const { journey_id } = req.body;
  if (!journey_id) return res.status(400).json({ error: 'journey_id required' });
  try {
    const { rows: uRows } = await pool.query('SELECT * FROM users WHERE id=$1 AND role=$2 AND business_id=$3', [req.params.clientId, 'client', req.user.business_id]);
    if (!uRows.length) return res.status(404).json({ error: 'Client not found' });
    const { rows: jRows } = await pool.query('SELECT * FROM journeys WHERE id=$1 AND business_id=$2', [journey_id, req.user.business_id]);
    if (!jRows.length) return res.status(404).json({ error: 'Journey not found' });

    const { rows } = await pool.query(
      `INSERT INTO client_journeys (client_id,journey_id,assigned_by) VALUES ($1,$2,$3) ON CONFLICT (client_id,journey_id) DO NOTHING RETURNING *`,
      [req.params.clientId, journey_id, req.user.id]
    );

    const client = uRows[0];
    const journey = jRows[0];

    // Fire webhook
    dispatch('client.journey_assigned', {
      client: { id: client.id, email: client.email, name: client.name, company: client.company },
      journey: { id: journey.id, name: journey.name },
    }, req.user.business_id).catch(console.error);

    // Send welcome email
    sendWelcomeEmail({ to: client.email, name: client.name, journeyName: journey.name }).catch(console.error);

    // Send any DocuSeal docs for tasks with trigger='assignment'
    const { rows: dsTaskRows } = await pool.query(
      `SELECT t.* FROM tasks t JOIN sections s ON t.section_id=s.id
       WHERE s.journey_id=$1 AND t.docuseal_template_id IS NOT NULL AND t.docuseal_trigger='assignment'`,
      [journey_id]
    );
    for (const task of dsTaskRows) {
      sendDocument({ client, task, journeyId: journey_id }).catch(console.error);
    }

    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:clientId/assign/:journeyId', auth('admin'), async (req, res) => {
  const { rows } = await pool.query(
    `DELETE FROM client_journeys cj USING users u
     WHERE cj.client_id=$1 AND cj.journey_id=$2 AND cj.client_id=u.id AND u.business_id=$3 RETURNING cj.id`,
    [req.params.clientId, req.params.journeyId, req.user.business_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

module.exports = router;
