const fetch = require('node-fetch');
const pool = require('../db/pool');
const { dispatch } = require('../webhooks/dispatcher');

// MinistrySafe / Abuse Prevention Systems API — https://developers.ministrysafe.com
// Token auth: "Authorization: Token token=<key>" on every request.
const BASE = process.env.MINISTRYSAFE_API_URL || 'https://safetysystem.ministrysafe.com/api';
const KEY = process.env.MINISTRYSAFE_API_KEY;

function authHeader() {
  return { Authorization: `Token token=${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };
}

function form(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

// Find-or-create the MinistrySafe User for a client, keyed by external_id
// so re-ordering a check for the same client reuses the same User record.
async function findOrCreateUser(client) {
  const search = await fetch(`${BASE}/users?external_id=${encodeURIComponent(client.id)}`, { headers: authHeader() });
  if (search.ok) {
    const rows = await search.json();
    if (Array.isArray(rows) && rows.length) return rows[0];
  }
  const [first, ...rest] = (client.name || '').split(' ');
  const createRes = await fetch(`${BASE}/users`, {
    method: 'POST', headers: authHeader(),
    body: form({ 'user[first_name]': first || client.name || 'Applicant', 'user[last_name]': rest.join(' ') || '-', 'user[email]': client.email, 'user[external_id]': client.id }),
  });
  if (!createRes.ok) throw new Error(`MinistrySafe user create failed: ${await createRes.text()}`);
  return createRes.json();
}

/**
 * Order a QuickApp Background Check — MinistrySafe emails the applicant
 * (and gives us applicant_interface_url) to collect all sensitive PII
 * themselves; we never see or store SSN/DOB/etc. Real API call, gated on
 * MINISTRYSAFE_API_KEY — throws (caller surfaces the message) if unset.
 */
async function startBackgroundCheck({ client, task }) {
  if (!KEY) throw new Error('Background checks aren’t configured yet — ask an admin to add the MinistrySafe API key.');

  const msUser = await findOrCreateUser(client);

  const res = await fetch(`${BASE}/background_checks`, {
    method: 'POST', headers: authHeader(),
    body: form({
      'background_check[user_id]': msUser.id,
      'background_check[quickapp]': true,
      'background_check[level]': task.ministrysafe_package_code ? undefined : (task.ministrysafe_level || 1),
      'background_check[custom_background_check_package_code]': task.ministrysafe_package_code || undefined,
    }),
  });
  if (!res.ok) throw new Error(`MinistrySafe background check order failed: ${await res.text()}`);
  const check = await res.json();

  const { rows } = await pool.query(
    `INSERT INTO background_checks (client_id, task_id, ministrysafe_user_id, ministrysafe_check_id, applicant_interface_url, status)
     VALUES ($1,$2,$3,$4,$5,'pending')
     ON CONFLICT DO NOTHING RETURNING *`,
    [client.id, task.id, String(msUser.id), String(check.id), check.applicant_interface_url || null]
  );
  return rows[0] || { applicant_interface_url: check.applicant_interface_url };
}

/**
 * Handle the inbound "Background Check ready for review" webhook. We do
 * NOT auto-clear the task — background checks need a human to actually
 * look at the results — we just mark it submitted and let an admin
 * review + mark it cleared from the Person page.
 */
async function handleInboundWebhook(req, res) {
  const event = req.body || {};
  const checkId = event.id;
  if (!checkId) return res.json({ received: true });

  try {
    const { rows } = await pool.query(
      `SELECT bc.*, u.email, u.name, u.business_id FROM background_checks bc
       JOIN users u ON u.id = bc.client_id WHERE bc.ministrysafe_check_id=$1 ORDER BY bc.created_at DESC LIMIT 1`,
      [String(checkId)]
    );
    if (!rows.length) return res.json({ received: true });
    const bc = rows[0];

    await pool.query(
      `UPDATE background_checks SET status='submitted', results_url=$1, completed_at=NOW() WHERE id=$2`,
      [event.results_url || null, bc.id]
    );

    dispatch('background_check.submitted', {
      client: { id: bc.client_id, email: bc.email, name: bc.name },
      results_url: event.results_url || null,
    }, bc.business_id).catch(console.error);

    res.json({ received: true });
  } catch (err) {
    console.error('[ministrysafe] Webhook error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = { startBackgroundCheck, handleInboundWebhook };
