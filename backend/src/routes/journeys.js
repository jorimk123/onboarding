const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

// GET /journeys
router.get('/', auth(), async (req, res) => {
  try {
    if (req.user.role === 'owner' || req.user.role === 'admin') {
      const { rows } = await pool.query(`
        SELECT j.*, u.name AS created_by_name,
          (SELECT COUNT(*) FROM sections WHERE journey_id=j.id) AS section_count,
          (SELECT COUNT(*) FROM tasks t JOIN sections s ON t.section_id=s.id WHERE s.journey_id=j.id) AS task_count,
          (SELECT COUNT(*) FROM client_journeys WHERE journey_id=j.id) AS client_count
        FROM journeys j LEFT JOIN users u ON j.created_by=u.id
        WHERE j.business_id=$1 ORDER BY j.created_at DESC`, [req.user.business_id]);
      return res.json(rows);
    }
    const { rows } = await pool.query(`
      SELECT j.*, cj.assigned_at, cj.completed_at,
        (SELECT COUNT(*) FROM tasks t JOIN sections s ON t.section_id=s.id WHERE s.journey_id=j.id) AS task_count,
        (SELECT COUNT(*) FROM task_completions tc JOIN tasks t ON tc.task_id=t.id JOIN sections s ON t.section_id=s.id WHERE s.journey_id=j.id AND tc.client_id=$1) AS completed_count
      FROM journeys j JOIN client_journeys cj ON cj.journey_id=j.id
      WHERE cj.client_id=$1 AND j.business_id=$2 ORDER BY cj.assigned_at DESC`,
      [req.user.id, req.user.business_id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /journeys/:id - full detail with sections, tasks, completions
router.get('/:id', auth(), async (req, res) => {
  try {
    const { rows: jRows } = await pool.query('SELECT * FROM journeys WHERE id=$1 AND business_id=$2', [req.params.id, req.user.business_id]);
    if (!jRows.length) return res.status(404).json({ error: 'Not found' });
    const journey = jRows[0];
    if (req.user.role === 'client') {
      const { rows: assigned } = await pool.query('SELECT 1 FROM client_journeys WHERE client_id=$1 AND journey_id=$2', [req.user.id, journey.id]);
      if (!assigned.length) return res.status(404).json({ error: 'Not found' });
    }
    const { rows: sections } = await pool.query('SELECT * FROM sections WHERE journey_id=$1 ORDER BY position', [journey.id]);
    const { rows: tasks } = await pool.query(
      `SELECT t.* FROM tasks t JOIN sections s ON t.section_id=s.id WHERE s.journey_id=$1 ORDER BY t.position`, [journey.id]);
    let completedTaskIds = [];
    let responsesByTask = {};
    if (req.user.role === 'client') {
      const { rows: c } = await pool.query('SELECT task_id FROM task_completions WHERE client_id=$1', [req.user.id]);
      completedTaskIds = c.map(x => x.task_id);
      const { rows: r } = await pool.query(
        `SELECT tr.task_id, tr.field_id, tr.value FROM task_responses tr
         JOIN tasks t ON t.id=tr.task_id JOIN sections s2 ON t.section_id=s2.id
         WHERE tr.client_id=$1 AND s2.journey_id=$2`, [req.user.id, journey.id]
      );
      for (const row of r) {
        (responsesByTask[row.task_id] ||= {})[row.field_id] = row.value;
      }
    }
    journey.sections = sections.map(s => ({
      ...s, tasks: tasks.filter(t => t.section_id === s.id).map(t => ({
        ...t, completed: completedTaskIds.includes(t.id), responses: responsesByTask[t.id] || {}
      }))
    }));
    res.json(journey);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /journeys
router.post('/', auth('admin'), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO journeys (business_id,name,description,created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.business_id, name, description || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', auth('admin'), async (req, res) => {
  const { name, description } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE journeys SET name=$1,description=$2,updated_at=NOW() WHERE id=$3 AND business_id=$4 RETURNING *`,
      [name, description || null, req.params.id, req.user.business_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', auth('admin'), async (req, res) => {
  const { rows } = await pool.query('DELETE FROM journeys WHERE id=$1 AND business_id=$2 RETURNING id', [req.params.id, req.user.business_id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

// Verify a journey belongs to the caller's business before touching its
// sections/tasks — prevents cross-tenant IDOR via guessed UUIDs.
async function assertOwnsJourney(req, res, next) {
  const { rows } = await pool.query('SELECT id FROM journeys WHERE id=$1 AND business_id=$2', [req.params.id, req.user.business_id]);
  if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
  next();
}

// ── Sections ──────────────────────────────────────────────────
router.post('/:id/sections', auth('admin'), assertOwnsJourney, async (req, res) => {
  const { title, position } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const { rows } = await pool.query(`INSERT INTO sections (journey_id,title,position) VALUES ($1,$2,$3) RETURNING *`, [req.params.id, title, position??0]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id/sections/:sid', auth('admin'), assertOwnsJourney, async (req, res) => {
  const { title, position } = req.body;
  const { rows } = await pool.query(`UPDATE sections SET title=$1,position=$2 WHERE id=$3 AND journey_id=$4 RETURNING *`, [title, position??0, req.params.sid, req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id/sections/:sid', auth('admin'), assertOwnsJourney, async (req, res) => {
  await pool.query('DELETE FROM sections WHERE id=$1 AND journey_id=$2', [req.params.sid, req.params.id]);
  res.status(204).end();
});

// ── Tasks ───────────────────────────────────────────────────────
// step_type: Form | Upload | Sign | Check | Learn | Book
// fields: [{ id, label, type, options?: string[], url?: string, required?: bool }]
const STEP_TYPES = ['Form', 'Upload', 'Sign', 'Check', 'Learn', 'Book'];

function normalizeFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.map((f, i) => ({
    id: f.id || `f${i}_${Date.now().toString(36)}`,
    label: String(f.label || 'Untitled question'),
    type: f.type || 'Short text',
    options: Array.isArray(f.options) ? f.options.filter(Boolean) : undefined,
    url: f.url || undefined,
    required: f.required !== false,
  }));
}

router.post('/:id/sections/:sid/tasks', auth('admin'), assertOwnsJourney, async (req, res) => {
  const {
    title, description, tag, assignee, position, docuseal_template_id, docuseal_trigger,
    step_type, fields, booking_url,
  } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  if (step_type && !STEP_TYPES.includes(step_type)) return res.status(400).json({ error: 'invalid step_type' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO tasks (section_id,title,description,tag,assignee,position,docuseal_template_id,docuseal_trigger,
                           step_type,fields,booking_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.params.sid, title, description||null, tag||null, assignee||null, position??0, docuseal_template_id||null, docuseal_trigger||'assignment',
       step_type || 'Form', JSON.stringify(normalizeFields(fields)), booking_url||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id/sections/:sid/tasks/:tid', auth('admin'), assertOwnsJourney, async (req, res) => {
  const {
    title, description, tag, assignee, position, docuseal_template_id, docuseal_trigger,
    step_type, fields, booking_url,
  } = req.body;
  if (step_type && !STEP_TYPES.includes(step_type)) return res.status(400).json({ error: 'invalid step_type' });
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET title=$1,description=$2,tag=$3,assignee=$4,position=$5,docuseal_template_id=$6,docuseal_trigger=$7,
                         step_type=$8,fields=$9,booking_url=$10
       WHERE id=$11 AND section_id=$12 RETURNING *`,
      [title, description||null, tag||null, assignee||null, position??0, docuseal_template_id||null, docuseal_trigger||'assignment',
       step_type || 'Form', JSON.stringify(normalizeFields(fields)), booking_url||null,
       req.params.tid, req.params.sid]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id/sections/:sid/tasks/:tid', auth('admin'), assertOwnsJourney, async (req, res) => {
  await pool.query('DELETE FROM tasks WHERE id=$1 AND section_id=$2', [req.params.tid, req.params.sid]);
  res.status(204).end();
});

module.exports = router;
