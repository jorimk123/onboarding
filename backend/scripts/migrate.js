// Applies schema.sql using the `pg` driver already in package.json, so it
// works anywhere Node runs — no `psql` client binary required (handy for
// platforms like Railway where the build image doesn't ship one). Safe to
// run repeatedly: every statement in schema.sql is idempotent.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { seedMentorJourney } = require('./seed-mentor-journey');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('[migrate] schema.sql applied successfully');
  } catch (err) {
    console.error('[migrate] failed:', err.message);
    process.exitCode = 1;
    await pool.end();
    return;
  }
  try {
    await seedMentorJourney(pool);
  } catch (err) {
    // Non-fatal — don't fail the whole deploy over a seed script.
    console.error('[migrate] seed-mentor-journey failed:', err.message);
  } finally {
    await pool.end();
  }
})();
