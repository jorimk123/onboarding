const fetch = require('node-fetch');
const crypto = require('crypto');
const pool = require('../db/pool');
const { dispatch } = require('../webhooks/dispatcher');

// Talks to the Stripe REST API directly (form-encoded, per Stripe's spec)
// rather than pulling in the full stripe SDK — keeps the dependency list
// small. Gated on STRIPE_SECRET_KEY, same graceful-degrade pattern as
// DocuSeal/Checkr.
const KEY = process.env.STRIPE_SECRET_KEY;
const CLIENT_URL = process.env.CLIENT_PORTAL_URL || 'http://localhost:5174';

function toForm(obj, prefix) {
  const params = new URLSearchParams();
  const walk = (o, p) => {
    for (const [k, v] of Object.entries(o)) {
      const key = p ? `${p}[${k}]` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key);
      else if (Array.isArray(v)) v.forEach((item, i) => typeof item === 'object' ? walk(item, `${key}[${i}]`) : params.append(`${key}[${i}]`, item));
      else params.append(key, v);
    }
  };
  walk(obj, prefix || '');
  return params;
}

async function createCheckoutSession({ client, task }) {
  if (!KEY) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)');

  const body = toForm({
    mode: 'payment',
    success_url: `${CLIENT_URL}/journey/${task.journey_id}?paid=1`,
    cancel_url: `${CLIENT_URL}/journey/${task.journey_id}?paid=0`,
    customer_email: client.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: task.payment_currency || 'usd',
        unit_amount: task.payment_amount_cents,
        product_data: { name: task.title },
      },
    }],
    metadata: { crm_client_id: client.id, crm_task_id: task.id },
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Stripe checkout session failed: ${err}`); }
  return res.json();
}

// Verifies Stripe's webhook signature per their documented scheme (HMAC-SHA256
// over "{timestamp}.{rawBody}"), using STRIPE_WEBHOOK_SECRET. Real signature
// verification — not skipped.
function verifySignature(rawBody, sigHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  return parts.v1 === expected;
}

async function handleInboundWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const raw = req.body.toString('utf8');
  if (!verifySignature(raw, sig)) return res.status(400).json({ error: 'Invalid signature' });

  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Bad payload' }); }

  if (event.type !== 'checkout.session.completed') return res.json({ received: true });
  const session = event.data.object;

  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.email, u.name, u.business_id FROM payments p
       JOIN users u ON u.id=p.client_id WHERE p.stripe_session_id=$1`, [session.id]
    );
    if (!rows.length) return res.json({ received: true });
    const payment = rows[0];

    await pool.query(`UPDATE payments SET status='paid', stripe_payment_intent=$1, paid_at=NOW() WHERE id=$2`, [session.payment_intent, payment.id]);
    if (payment.task_id) {
      await pool.query(`INSERT INTO task_completions (client_id, task_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [payment.client_id, payment.task_id]);
    }
    dispatch('payment.completed', { client: { id: payment.client_id, email: payment.email, name: payment.name }, amount_cents: payment.amount_cents }, payment.business_id).catch(console.error);

    res.json({ received: true });
  } catch (err) {
    console.error('[stripe] Webhook error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = { createCheckoutSession, handleInboundWebhook };
