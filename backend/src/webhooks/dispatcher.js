const fetch = require('node-fetch');
const crypto = require('crypto');
const pool = require('../db/pool');

/**
 * Fire a webhook event to all matching registered endpoints.
 *
 * Events:
 *   client.registered        { client }
 *   client.journey_assigned  { client, journey }
 *   task.completed           { client, task, journey }
 *   section.completed        { client, section, journey }
 *   journey.completed        { client, journey }
 *   document.signed          { client, task, submission }
 */
async function dispatch(event, payload, businessId) {
  if (!businessId) {
    console.error(`[webhook] dispatch('${event}') called without a businessId — skipping`);
    return;
  }
  let endpoints;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM webhook_endpoints WHERE active = TRUE AND business_id = $2
       AND (events @> ARRAY['*'] OR events @> ARRAY[$1::text])`,
      [event, businessId]
    );
    endpoints = rows;
  } catch (err) {
    console.error('[webhook] Failed to load endpoints:', err.message);
    return;
  }

  if (!endpoints.length) return;

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  await Promise.allSettled(
    endpoints.map(ep => deliverToEndpoint(ep, event, body, payload))
  );
}

async function deliverToEndpoint(ep, event, body, payload) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'CRM-Onboarding-Webhook/1.0',
    'X-Webhook-Event': event,
    'X-Webhook-Delivery': crypto.randomUUID(),
  };

  // Sign payload with HMAC-SHA256 if secret is set
  if (ep.secret) {
    const sig = crypto.createHmac('sha256', ep.secret).update(body).digest('hex');
    headers['X-Webhook-Signature'] = `sha256=${sig}`;
  }

  let statusCode = null;
  let responseBody = '';
  let success = false;

  try {
    const res = await fetch(ep.url, { method: 'POST', headers, body, timeout: 10000 });
    statusCode = res.status;
    responseBody = await res.text().catch(() => '');
    success = res.ok;
    if (!success) console.warn(`[webhook] ${ep.url} responded ${statusCode}`);
  } catch (err) {
    responseBody = err.message;
    console.error(`[webhook] Failed to deliver to ${ep.url}:`, err.message);
  }

  // Log delivery (non-blocking, best effort)
  pool.query(
    `INSERT INTO webhook_deliveries (endpoint_id, event, payload, status_code, response_body, success)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [ep.id, event, payload, statusCode, responseBody.slice(0, 2000), success]
  ).catch(() => {});
}

module.exports = { dispatch };
