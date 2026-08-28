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

// GET /clients/analytics/overview — real dashboard stats for the Overview page.
// No fabricated numbers: everything below is derived from assigned_at /
// completed_at / task_completions.completed_at timestamps already in the DB.
router.get('/analytics/overview', auth(['owner', 'admin']), async (req, res) => {
  try {
    const bizId = req.user.business_id;

    const countInProgress = async (asOf) => {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM client_journeys cj JOIN journeys j ON j.id=cj.journey_id
         WHERE j.business_id=$1 AND cj.assigned_at <= $2
           AND (cj.completed_at IS NULL OR cj.completed_at > $2)
           AND (cj.archived_at IS NULL OR cj.archived_at > $2)`, [bizId, asOf]
      );
      return Number(rows[0].count);
    };
    const countCompletedSince = async (start, end) => {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM client_journeys cj JOIN journeys j ON j.id=cj.journey_id
         WHERE j.business_id=$1 AND cj.completed_at >= $2 AND cj.completed_at < $3`, [bizId, start, end]
      );
      return Number(rows[0].count);
    };
    const countStalled = async (asOf) => {
      const sevenBefore = new Date(asOf.getTime() - 7 * 86400000);
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM client_journeys cj JOIN journeys j ON j.id=cj.journey_id
         WHERE j.business_id=$1 AND cj.assigned_at <= $3 AND cj.assigned_at < $2
           AND (cj.completed_at IS NULL OR cj.completed_at > $3)
           AND (cj.archived_at IS NULL OR cj.archived_at > $3)
           AND NOT EXISTS (
             SELECT 1 FROM task_completions tc
             JOIN tasks t ON t.id=tc.task_id JOIN sections s ON s.id=t.section_id
             WHERE s.journey_id=cj.journey_id AND tc.client_id=cj.client_id
               AND tc.completed_at >= $2 AND tc.completed_at <= $3
           )`, [bizId, sevenBefore, asOf]
      );
      return Number(rows[0].count);
    };

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const priorMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const priorMonthSamePoint = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const [inProgressNow, inProgressWeekAgo, completedThisMonth, completedPriorMonthToDate, stalledNow, stalledWeekAgo] = await Promise.all([
      countInProgress(now), countInProgress(weekAgo),
      countCompletedSince(monthStart, now), countCompletedSince(priorMonthStart, priorMonthSamePoint),
      countStalled(now), countStalled(weekAgo),
    ]);

    const { rows: totalClients } = await pool.query(
      `SELECT COUNT(*) FROM users WHERE business_id=$1 AND role='client'`, [bizId]
    );
    const totalCap = Math.max(1, Number(totalClients[0].count));

    const stats = [
      { label: 'In progress', value: String(inProgressNow), delta: fmtDelta(inProgressNow - inProgressWeekAgo), tone: inProgressNow >= inProgressWeekAgo ? '#177a66' : '#a8600d', pct: Math.min(100, Math.round((inProgressNow / totalCap) * 100)) },
      { label: 'Completed this month', value: String(completedThisMonth), delta: fmtDelta(completedThisMonth - completedPriorMonthToDate), tone: completedThisMonth >= completedPriorMonthToDate ? '#177a66' : '#a8600d', pct: Math.min(100, Math.round((completedThisMonth / totalCap) * 100)) },
      { label: 'Stalled 7+ days', value: String(stalledNow), delta: fmtDelta(stalledNow - stalledWeekAgo, true), tone: stalledNow <= stalledWeekAgo ? '#177a66' : '#a8600d', pct: Math.min(100, Math.round((stalledNow / totalCap) * 100)) },
    ];

    // 12-week starts/completions series, oldest to newest, each bucket = 7 days.
    const chart = [];
    for (let i = 11; i >= 0; i--) {
      const bucketEnd = new Date(now.getTime() - i * 7 * 86400000);
      const bucketStart = new Date(bucketEnd.getTime() - 7 * 86400000);
      const [{ rows: startedRows }, { rows: doneRows }] = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM client_journeys cj JOIN journeys j ON j.id=cj.journey_id WHERE j.business_id=$1 AND cj.assigned_at >= $2 AND cj.assigned_at < $3`, [bizId, bucketStart, bucketEnd]),
        pool.query(`SELECT COUNT(*) FROM client_journeys cj JOIN journeys j ON j.id=cj.journey_id WHERE j.business_id=$1 AND cj.completed_at >= $2 AND cj.completed_at < $3`, [bizId, bucketStart, bucketEnd]),
      ]);
      chart.push({ label: bucketEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), started: Number(startedRows[0].count), completed: Number(doneRows[0].count) });
    }

    // Stalled people list (for the "Onboarding health" widget / drill-down).
    const { rows: stalledList } = await pool.query(
      `SELECT u.id AS client_id, u.name, j.name AS journey_name, cj.assigned_at
       FROM client_journeys cj JOIN journeys j ON j.id=cj.journey_id JOIN users u ON u.id=cj.client_id
       WHERE j.business_id=$1 AND cj.completed_at IS NULL AND cj.archived_at IS NULL
         AND cj.assigned_at < $2
         AND NOT EXISTS (
           SELECT 1 FROM task_completions tc JOIN tasks t ON t.id=tc.task_id JOIN sections s ON s.id=t.section_id
           WHERE s.journey_id=cj.journey_id AND tc.client_id=cj.client_id AND tc.completed_at >= $2
         )
       ORDER BY cj.assigned_at ASC LIMIT 20`, [bizId, weekAgo]
    );

    res.json({ stats, chart, stalled: stalledList });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

function fmtDelta(n, invert) {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n)}`;
}

// GET /clients/:clientId/journeys/:journeyId — full step-by-step breakdown
// of one client's progress through one journey, for the admin Person page.
router.get('/:clientId/journeys/:journeyId', auth('admin'), async (req, res) => {
  try {
    const { clientId, journeyId } = req.params;
    const { rows: cRows } = await pool.query(
      'SELECT id, name, email, company FROM users WHERE id=$1 AND role=$2 AND business_id=$3',
      [clientId, 'client', req.user.business_id]
    );
    if (!cRows.length) return res.status(404).json({ error: 'Client not found' });

    const { rows: jRows } = await pool.query(
      'SELECT j.* FROM journeys j WHERE j.id=$1 AND j.business_id=$2', [journeyId, req.user.business_id]
    );
    if (!jRows.length) return res.status(404).json({ error: 'Journey not found' });
    const journey = jRows[0];

    const { rows: cjRows } = await pool.query(
      'SELECT * FROM client_journeys WHERE client_id=$1 AND journey_id=$2', [clientId, journeyId]
    );
    if (!cjRows.length) return res.status(404).json({ error: 'Journey not assigned to this client' });

    const { rows: sections } = await pool.query('SELECT * FROM sections WHERE journey_id=$1 ORDER BY position', [journeyId]);
    const { rows: tasks } = await pool.query(
      `SELECT t.* FROM tasks t JOIN sections s ON t.section_id=s.id WHERE s.journey_id=$1 ORDER BY t.position`, [journeyId]);
    const { rows: completions } = await pool.query(
      `SELECT tc.task_id, tc.completed_at FROM task_completions tc
       JOIN tasks t ON t.id=tc.task_id JOIN sections s ON t.section_id=s.id
       WHERE s.journey_id=$1 AND tc.client_id=$2`, [journeyId, clientId]
    );
    const completedByTask = Object.fromEntries(completions.map(c => [c.task_id, c.completed_at]));
    const { rows: responses } = await pool.query(
      `SELECT tr.task_id, tr.field_id, tr.value FROM task_responses tr
       JOIN tasks t ON t.id=tr.task_id JOIN sections s ON t.section_id=s.id
       WHERE s.journey_id=$1 AND tr.client_id=$2`, [journeyId, clientId]
    );
    const responsesByTask = {};
    for (const r of responses) (responsesByTask[r.task_id] ||= {})[r.field_id] = r.value;
    const { rows: bgChecks } = await pool.query(
      `SELECT bc.* FROM background_checks bc
       JOIN tasks t ON t.id=bc.task_id JOIN sections s ON t.section_id=s.id
       WHERE s.journey_id=$1 AND bc.client_id=$2`, [journeyId, clientId]
    );
    const bgByTask = Object.fromEntries(bgChecks.map(b => [b.task_id, b]));

    journey.sections = sections.map(s => ({
      ...s,
      tasks: tasks.filter(t => t.section_id === s.id).map(t => ({
        ...t,
        completed: Object.prototype.hasOwnProperty.call(completedByTask, t.id),
        completed_at: completedByTask[t.id] || null,
        responses: responsesByTask[t.id] || {},
        background_check: bgByTask[t.id] || null,
      })),
    }));

    res.json({ client: cRows[0], journey, assigned_at: cjRows[0].assigned_at, completed_at: cjRows[0].completed_at });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /clients/:clientId/tasks/:taskId/mark-cleared — admin manually marks
// a BGCheck step's background check as reviewed + cleared, which also
// completes the step for the client. Background checks are never
// auto-cleared — a human always makes this call.
router.post('/:clientId/tasks/:taskId/mark-cleared', auth('admin'), async (req, res) => {
  try {
    const { clientId, taskId } = req.params;
    const { rows: taskRows } = await pool.query(
      `SELECT t.*, s.journey_id, j.business_id FROM tasks t
       JOIN sections s ON t.section_id=s.id JOIN journeys j ON s.journey_id=j.id
       WHERE t.id=$1 AND j.business_id=$2`, [taskId, req.user.business_id]
    );
    if (!taskRows.length) return res.status(404).json({ error: 'Task not found' });
    const task = taskRows[0];
    if (task.step_type !== 'BGCheck') return res.status(400).json({ error: 'Not a background check step' });

    await pool.query(
      `UPDATE background_checks SET status='clear' WHERE client_id=$1 AND task_id=$2`, [clientId, taskId]
    );
    await pool.query(
      `INSERT INTO task_completions (client_id,task_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [clientId, taskId]
    );
    res.json({ cleared: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /clients/:clientId/profile — aggregated contact info + files across
// every journey the client has ever been assigned, for the "Everything on
// file" card on the admin Person page. Contact fields (phone/city/state/
// church) aren't dedicated DB columns — they're pulled from whatever intake
// form fields the client actually filled in, matched by label keyword.
router.get('/:clientId/profile', auth('admin'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const { rows: cRows } = await pool.query(
      'SELECT id, name, email, company FROM users WHERE id=$1 AND role=$2 AND business_id=$3',
      [clientId, 'client', req.user.business_id]
    );
    if (!cRows.length) return res.status(404).json({ error: 'Client not found' });

    const { rows: tasks } = await pool.query(
      `SELECT t.id, t.title, t.step_type, t.fields, t.docuseal_template_id, j.name AS journey_name
       FROM tasks t JOIN sections s ON t.section_id=s.id JOIN journeys j ON s.journey_id=j.id
       JOIN client_journeys cj ON cj.journey_id=j.id AND cj.client_id=$1
       WHERE j.business_id=$2`, [clientId, req.user.business_id]
    );
    const { rows: completions } = await pool.query(
      `SELECT tc.task_id, tc.completed_at FROM task_completions tc
       JOIN tasks t ON t.id=tc.task_id JOIN sections s ON t.section_id=s.id JOIN journeys j ON s.journey_id=j.id
       JOIN client_journeys cj ON cj.journey_id=j.id AND cj.client_id=$1
       WHERE tc.client_id=$1 AND j.business_id=$2`, [clientId, req.user.business_id]
    );
    const { rows: responses } = await pool.query(
      `SELECT tr.task_id, tr.field_id, tr.value FROM task_responses tr
       JOIN tasks t ON t.id=tr.task_id JOIN sections s ON t.section_id=s.id JOIN journeys j ON s.journey_id=j.id
       JOIN client_journeys cj ON cj.journey_id=j.id AND cj.client_id=$1
       WHERE tr.client_id=$1 AND j.business_id=$2`, [clientId, req.user.business_id]
    );
    const { rows: submissions } = await pool.query(
      `SELECT ds.task_id, ds.document_url, ds.status, ds.signed_at FROM docuseal_submissions ds
       WHERE ds.client_id=$1 ORDER BY ds.created_at DESC`, [clientId]
    );
    const completedByTask = Object.fromEntries(completions.map(c => [c.task_id, c.completed_at]));
    const responsesByTask = {};
    for (const r of responses) (responsesByTask[r.task_id] ||= {})[r.field_id] = r.value;
    // First row wins per task since submissions are ordered newest-first.
    const submissionByTask = {};
    for (const s of submissions) if (!submissionByTask[s.task_id]) submissionByTask[s.task_id] = s;

    // Match intake-form fields to the profile attributes we want to surface,
    // by keyword in the field label — first match wins.
    const KEYWORDS = { phone: 'phone', city: 'city', state: 'state', church: 'church' };
    const contact = { phone: null, city: null, state: null, church: null };
    const uploads = [];
    const signed = [];

    for (const task of tasks) {
      const fields = task.fields || [];
      const taskResponses = responsesByTask[task.id] || {};

      for (const field of fields) {
        const value = taskResponses[field.id];
        if (value === undefined || value === null || value === '') continue;
        const label = (field.label || '').toLowerCase();

        if (field.type === 'Upload' && value?.name) {
          uploads.push({
            journey_name: task.journey_name, task_title: task.title,
            field_label: field.label, name: value.name, size: value.size || null,
            data_url: value.dataUrl || null, completed_at: completedByTask[task.id] || null,
          });
          continue;
        }

        for (const [key, kw] of Object.entries(KEYWORDS)) {
          if (!contact[key] && label.includes(kw) && typeof value === 'string') contact[key] = value;
        }
      }

      if (task.step_type === 'Sign' && completedByTask[task.id]) {
        const sub = submissionByTask[task.id];
        signed.push({
          journey_name: task.journey_name, task_title: task.title, completed_at: completedByTask[task.id],
          document_url: sub?.document_url || null,
          docuseal_status: sub?.status || null,
          has_docuseal: !!task.docuseal_template_id,
        });
      }
    }

    res.json({ client: cRows[0], contact, uploads, signed });
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
