const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { dispatch } = require('../webhooks/dispatcher');

const ALL_EVENTS = [
  'client.registered',
  'client.journey_assigned',
  'task.completed',
  'section.completed',
  'journey.completed',
  'document.signed',
];

// GET /webhooks — list registered endpoints
router.get('/', auth('admin'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM webhook_endpoints WHERE business_id=$1 ORDER BY created_at DESC', [req.user.business_id]);
  res.json(rows);
});

// GET /webhooks/events — list all available event types
router.get('/events', auth('admin'), (_req, res) => {
  res.json(ALL_EVENTS);
});

// POST /webhooks — register a new endpoint
router.post('/', auth('admin'), async (req, res) => {
  const { url, label, secret, events } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO webhook_endpoints (business_id,url,label,secret,events) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.business_id, url, label||null, secret||null, events || ['*']]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /webhooks/:id — update endpoint
router.put('/:id', auth('admin'), async (req, res) => {
  const { url, label, secret, events, active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE webhook_endpoints SET url=$1,label=$2,secret=$3,events=$4,active=$5 WHERE id=$6 AND business_id=$7 RETURNING *`,
      [url, label||null, secret||null, events||['*'], active!==undefined?active:true, req.params.id, req.user.business_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /webhooks/:id
router.delete('/:id', auth('admin'), async (req, res) => {
  const { rows } = await pool.query('DELETE FROM webhook_endpoints WHERE id=$1 AND business_id=$2 RETURNING id', [req.params.id, req.user.business_id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

// POST /webhooks/:id/test — send a test ping to an endpoint
router.post('/:id/test', auth('admin'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM webhook_endpoints WHERE id=$1 AND business_id=$2', [req.params.id, req.user.business_id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  await dispatch('test.ping', { message: 'This is a test event from your CRM', endpoint_id: req.params.id }, req.user.business_id);
  res.json({ sent: true });
});

// GET /webhooks/:id/deliveries — recent delivery log
router.get('/:id/deliveries', auth('admin'), async (req, res) => {
  const { rows: epRows } = await pool.query('SELECT id FROM webhook_endpoints WHERE id=$1 AND business_id=$2', [req.params.id, req.user.business_id]);
  if (!epRows.length) return res.status(404).json({ error: 'Not found' });
  const { rows } = await pool.query(
    `SELECT * FROM webhook_deliveries WHERE endpoint_id=$1 ORDER BY delivered_at DESC LIMIT 50`,
    [req.params.id]
  );
  res.json(rows);
});

module.exports = router;
