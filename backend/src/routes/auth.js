const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { dispatch } = require('../webhooks/dispatcher');
const { sendWelcomeEmail } = require('../services/email');
const { sendDocument } = require('../services/docuseal');

function sign(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, business_id: user.business_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'business';
}

async function uniqueSlug(base) {
  let slug = base, n = 1;
  while (true) {
    const { rows } = await pool.query('SELECT 1 FROM businesses WHERE slug=$1', [slug]);
    if (!rows.length) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

// ── POST /auth/register-business ────────────────────────────────
// Creates a new business (tenant) and its first user as 'owner'.
router.post('/register-business', async (req, res) => {
  const { businessName, name, email, password } = req.body;
  if (!businessName || !name || !email || !password) {
    return res.status(400).json({ error: 'businessName, name, email and password are required' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const slug = await uniqueSlug(slugify(businessName));
    const { rows: bRows } = await client.query(
      `INSERT INTO businesses (name, slug) VALUES ($1,$2) RETURNING *`,
      [businessName.trim(), slug]
    );
    const business = bRows[0];
    const hash = await bcrypt.hash(password, 10);
    const { rows: uRows } = await client.query(
      `INSERT INTO users (business_id, email, password, name, role) VALUES ($1,$2,$3,$4,'owner')
       RETURNING id,email,name,role,business_id,created_at`,
      [business.id, email.toLowerCase().trim(), hash, name]
    );
    await client.query('COMMIT');
    const user = uRows[0];
    const token = sign(user);
    res.status(201).json({ token, user, business });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') { // unique_violation — email already taken
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ── GET /auth/invites/:token ─────────────────────────────────────
// Public — lets the accept-invite page show who/what the invite is for
// before the person sets a password.
router.get('/invites/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.email, i.name, i.role, i.status, i.expires_at,
              b.name AS business_name, j.name AS journey_name
       FROM invites i
       JOIN businesses b ON b.id = i.business_id
       LEFT JOIN journeys j ON j.id = i.journey_id
       WHERE i.token = $1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invite not found' });
    const invite = rows[0];
    if (invite.status !== 'pending') return res.status(410).json({ error: `This invite was already ${invite.status}` });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'This invite has expired' });
    res.json(invite);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /auth/accept-invite ─────────────────────────────────────
router.post('/accept-invite', async (req, res) => {
  const { token, name, password } = req.body;
  if (!token || !name || !password) return res.status(400).json({ error: 'token, name and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: iRows } = await client.query('SELECT * FROM invites WHERE token=$1 FOR UPDATE', [token]);
    if (!iRows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Invite not found' }); }
    const invite = iRows[0];
    if (invite.status !== 'pending') { await client.query('ROLLBACK'); return res.status(410).json({ error: `This invite was already ${invite.status}` }); }
    if (new Date(invite.expires_at) < new Date()) { await client.query('ROLLBACK'); return res.status(410).json({ error: 'This invite has expired' }); }

    const hash = await bcrypt.hash(password, 10);
    const { rows: uRows } = await client.query(
      `INSERT INTO users (business_id, email, password, name, role) VALUES ($1,$2,$3,$4,$5)
       RETURNING id,email,name,role,business_id,created_at`,
      [invite.business_id, invite.email, hash, name, invite.role]
    );
    const user = uRows[0];
    await client.query(`UPDATE invites SET status='accepted', accepted_at=NOW() WHERE id=$1`, [invite.id]);

    let assignedJourney = null;
    if (invite.role === 'client' && invite.journey_id) {
      const { rows: jRows } = await client.query('SELECT * FROM journeys WHERE id=$1 AND business_id=$2', [invite.journey_id, invite.business_id]);
      if (jRows.length) {
        await client.query(
          `INSERT INTO client_journeys (client_id,journey_id,assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [user.id, invite.journey_id, invite.invited_by]
        );
        assignedJourney = jRows[0];
      }
    }
    await client.query('COMMIT');

    dispatch('client.registered', { client: { id: user.id, email: user.email, name: user.name } }, invite.business_id).catch(console.error);

    if (assignedJourney) {
      dispatch('client.journey_assigned', {
        client: { id: user.id, email: user.email, name: user.name },
        journey: { id: assignedJourney.id, name: assignedJourney.name },
      }, invite.business_id).catch(console.error);
      sendWelcomeEmail({ to: user.email, name: user.name, journeyName: assignedJourney.name }).catch(console.error);

      const { rows: dsTaskRows } = await pool.query(
        `SELECT t.* FROM tasks t JOIN sections s ON t.section_id=s.id
         WHERE s.journey_id=$1 AND t.docuseal_template_id IS NOT NULL AND t.docuseal_trigger='assignment'`,
        [assignedJourney.id]
      );
      for (const task of dsTaskRows) {
        sendDocument({ client: user, task, journeyId: assignedJourney.id }).catch(console.error);
      }
    }

    const jwtToken = sign(user);
    res.status(201).json({ token: jwtToken, user });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') { // unique_violation — email already taken
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  try {
    // Owner/admin emails are globally unique. A client could in theory be
    // invited to more than one business with the same email — if so, try
    // each matching account until the password matches, most recent first.
    const { rows } = await pool.query(
      `SELECT u.*, b.name AS business_name, b.slug AS business_slug FROM users u
       JOIN businesses b ON b.id = u.business_id WHERE u.email=$1
       ORDER BY (u.role IN ('owner','admin')) DESC, u.created_at DESC`,
      [email.toLowerCase().trim()]
    );
    let user = null;
    for (const candidate of rows) {
      if (await bcrypt.compare(password, candidate.password)) { user = candidate; break; }
    }
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = sign(user);
    res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role, company: user.company,
        business: { id: user.business_id, name: user.business_name, slug: user.business_slug },
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/me', auth(), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id,u.email,u.name,u.role,u.company,u.created_at, b.id AS business_id, b.name AS business_name, b.slug AS business_slug
     FROM users u JOIN businesses b ON b.id=u.business_id WHERE u.id=$1`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const r = rows[0];
  res.json({
    id: r.id, email: r.email, name: r.name, role: r.role, company: r.company, created_at: r.created_at,
    business: { id: r.business_id, name: r.business_name, slug: r.business_slug },
  });
});

module.exports = router;
