// In-process scheduler for policy-driven background jobs (auto-archive,
// weekly digest emails). No external cron dependency — this runs as long
// as the backend process is alive (Railway keeps it running continuously).
//
// Both jobs are safe to run repeatedly: auto-archive only touches rows that
// meet its threshold and haven't been archived yet; the digest guards
// against re-sending within the same 6-day window via last_digest_sent_at.

const pool = require('../db/pool');
const { sendWeeklyDigestEmail } = require('./email');

async function runAutoArchive() {
  try {
    const { rows: businesses } = await pool.query(
      `SELECT id, auto_archive_days FROM businesses WHERE auto_archive_days IS NOT NULL`
    );
    for (const b of businesses) {
      await pool.query(
        `UPDATE client_journeys SET archived_at = NOW()
         WHERE journey_id IN (SELECT id FROM journeys WHERE business_id = $1)
           AND completed_at IS NOT NULL
           AND archived_at IS NULL
           AND completed_at < NOW() - ($2 || ' days')::interval`,
        [b.id, b.auto_archive_days]
      );
    }
  } catch (err) {
    console.error('[scheduler] auto-archive failed:', err.message);
  }
}

async function runWeeklyDigest() {
  try {
    const { rows: businesses } = await pool.query(
      `SELECT id, name FROM businesses
       WHERE weekly_digest_enabled = TRUE
         AND (last_digest_sent_at IS NULL OR last_digest_sent_at < NOW() - INTERVAL '6 days')`
    );
    for (const b of businesses) {
      const { rows: recipients } = await pool.query(
        `SELECT email FROM users WHERE business_id=$1 AND role IN ('owner','admin')`,
        [b.id]
      );
      if (!recipients.length) continue;

      const { rows: [{ count: inProgressCount }] } = await pool.query(
        `SELECT COUNT(*) FROM client_journeys cj JOIN journeys j ON j.id = cj.journey_id
         WHERE j.business_id=$1 AND cj.completed_at IS NULL AND cj.archived_at IS NULL`,
        [b.id]
      );
      const { rows: [{ count: completedThisWeek }] } = await pool.query(
        `SELECT COUNT(*) FROM client_journeys cj JOIN journeys j ON j.id = cj.journey_id
         WHERE j.business_id=$1 AND cj.completed_at >= NOW() - INTERVAL '7 days'`,
        [b.id]
      );
      const { rows: stalled } = await pool.query(
        `SELECT u.name FROM client_journeys cj
         JOIN journeys j ON j.id = cj.journey_id
         JOIN users u ON u.id = cj.client_id
         WHERE j.business_id=$1 AND cj.completed_at IS NULL AND cj.archived_at IS NULL
           AND cj.assigned_at < NOW() - INTERVAL '7 days'
           AND NOT EXISTS (
             SELECT 1 FROM task_completions tc
             JOIN tasks t ON t.id = tc.task_id JOIN sections s ON s.id = t.section_id
             WHERE s.journey_id = cj.journey_id AND tc.client_id = cj.client_id
               AND tc.completed_at >= NOW() - INTERVAL '7 days'
           )`,
        [b.id]
      );

      for (const r of recipients) {
        await sendWeeklyDigestEmail({
          to: r.email,
          businessName: b.name,
          inProgressCount: Number(inProgressCount),
          completedThisWeek: Number(completedThisWeek),
          stalledNames: stalled.map(s => s.name),
        }).catch(console.error);
      }

      await pool.query(`UPDATE businesses SET last_digest_sent_at = NOW() WHERE id=$1`, [b.id]);
    }
  } catch (err) {
    console.error('[scheduler] weekly digest failed:', err.message);
  }
}

function startScheduler() {
  // Run once shortly after boot, then hourly. Both jobs are idempotent/guarded,
  // so an hourly cadence is enough to catch daily archive thresholds and the
  // weekly digest window without needing a real cron dependency.
  setTimeout(() => { runAutoArchive(); runWeeklyDigest(); }, 30_000);
  setInterval(() => { runAutoArchive(); runWeeklyDigest(); }, 60 * 60 * 1000);
}

module.exports = { startScheduler, runAutoArchive, runWeeklyDigest };
