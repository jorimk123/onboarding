const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { sendAdminInviteEmail, sendClientInviteEmail } = require('../services/email');

const INVITE_TTL_DAYS = 7;
const ADMIN_PORTAL_URL = process.env.ADMIN_PORTAL_URL || 'http://localhost:5173';
const CLIENT_PORTAL_URL = process.env.CLIENT_PORTAL_URL || 'http://localhost:5174';

function inviteLink(role, token) {
  const base = role === 'admin' ? ADMIN_PORTAL_URL : CLIENT_PORTAL_URL;
  return `${base}/accept-invite?token=${token}`;
}

// GET /businesses/me — current business profile
router.get('/me', auth(['owner', 'admin']), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE id=$1', [req.user.business_id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// PUT /businesses/me — rename business (owner only)
router.put('/me', auth('owner'), async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const { rows } = await pool.query('UPDATE businesses SET name=$1 WHERE id=$2 RETURNING *', [name.trim(), req.user.business_id]);
  res.json(rows[0]);
});

// GET /businesses/team — list owner + admins in this business
router.get('/team', auth(['owner', 'admin']), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, name, role, created_at FROM users
     WHERE business_id=$1 AND role IN ('owner','admin') ORDER BY role='owner' DESC, created_at ASC`,
    [req.user.business_id]
  );
  res.json(rows);
});

// DELETE /businesses/team/:userId — remove an admin (owner only)
router.delete('/team/:userId', auth('owner'), async (req, res) => {
  if (req.params.userId === req.user.id) return res.status(400).json({ error: "You can't remove yourself" });
  const { rows } = await pool.query(
    `DELETE FROM users WHERE id=$1 AND business_id=$2 AND role='admin' RETURNING id`,
    [req.params.userId, req.user.business_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Admin not found' });
  res.status(204).end();
});

// GET /businesses/invites?role=admin|client — list pending invites
router.get('/invites', auth(['owner', 'admin']), async (req, res) => {
  const { role } = req.query;
  const params = [req.user.business_id];
  let where = `i.business_id=$1 AND i.status='pending'`;
  if (role) { params.push(role); where += ` AND i.role=$2`; }
  const { rows } = await pool.query(
    `SELECT i.*, u.name AS invited_by_name, j.name AS journey_name FROM invites i
     LEFT JOIN users u ON u.id = i.invited_by LEFT JOIN journeys j ON j.id = i.journey_id
     WHERE ${where} ORDER BY i.created_at DESC`,
    params
  );
  res.json(rows.map(r => ({ ...r, link: inviteLink(r.role, r.token) })));
});

// POST /businesses/invites — invite an admin or a client
// { email, name?, role: 'admin'|'client', journey_id? (client only) }
router.post('/invites', auth(['owner', 'admin']), async (req, res) => {
  const { email, name, role, journey_id } = req.body;
  if (!email || !role) return res.status(400).json({ error: 'email and role are required' });
  if (!['admin', 'client'].includes(role)) return res.status(400).json({ error: "role must be 'admin' or 'client'" });
  if (role === 'admin' && req.user.role !== 'owner') return res.status(403).json({ error: 'Only the business owner can invite admins' });

  const normEmail = email.toLowerCase().trim();
  try {
    if (journey_id) {
      const { rows: jRows } = await pool.query('SELECT id FROM journeys WHERE id=$1 AND business_id=$2', [journey_id, req.user.business_id]);
      if (!jRows.length) return res.status(404).json({ error: 'Journey not found' });
    }

    const { rows: existing } = await pool.query(
      `SELECT 1 FROM users WHERE business_id=$1 AND email=$2`,
      [req.user.business_id, normEmail]
    );
    if (existing.length) return res.status(409).json({ error: 'This person already has an account in your business' });

    // Revoke any prior pending invite to the same email/role so links stay single-valid.
    await pool.query(
      `UPDATE invites SET status='revoked' WHERE business_id=$1 AND email=$2 AND role=$3 AND status='pending'`,
      [req.user.business_id, normEmail, role]
    );

    const token = crypto.randomBytes(24).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO invites (business_id, email, name, role, journey_id, token, invited_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() + INTERVAL '${INVITE_TTL_DAYS} days') RETURNING *`,
      [req.user.business_id, normEmail, name || null, role, journey_id || null, token, req.user.id]
    );
    const invite = rows[0];
    const link = inviteLink(role, token);

    const { rows: bRows } = await pool.query('SELECT name FROM businesses WHERE id=$1', [req.user.business_id]);
    const businessName = bRows[0]?.name || 'your team';

    if (role === 'admin') {
      sendAdminInviteEmail({ to: normEmail, businessName, invitedByName: req.user.name, link }).catch(console.error);
    } else {
      sendClientInviteEmail({ to: normEmail, businessName, link }).catch(console.error);
    }

    res.status(201).json({ ...invite, link });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /businesses/invites/:id/resend
router.post('/invites/:id/resend', auth(['owner', 'admin']), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, b.name AS business_name FROM invites i JOIN businesses b ON b.id=i.business_id
     WHERE i.id=$1 AND i.business_id=$2 AND i.status='pending'`,
    [req.params.id, req.user.business_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Invite not found' });
  const invite = rows[0];
  const link = inviteLink(invite.role, invite.token);
  if (invite.role === 'admin') {
    sendAdminInviteEmail({ to: invite.email, businessName: invite.business_name, invitedByName: req.user.name, link }).catch(console.error);
  } else {
    sendClientInviteEmail({ to: invite.email, businessName: invite.business_name, link }).catch(console.error);
  }
  res.json({ sent: true, link });
});

// DELETE /businesses/invites/:id — revoke
router.delete('/invites/:id', auth(['owner', 'admin']), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE invites SET status='revoked' WHERE id=$1 AND business_id=$2 AND status='pending' RETURNING id`,
    [req.params.id, req.user.business_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Invite not found' });
  res.status(204).end();
});

module.exports = router;
