require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { handleInboundWebhook } = require('./services/docuseal');
const { handleInboundWebhook: handleCheckrWebhook } = require('./services/checkr');
const { handleInboundWebhook: handleStripeWebhook } = require('./services/stripe');
const { startScheduler } = require('./services/scheduler');

const app = express();

// ADMIN_PORTAL_URL / CLIENT_PORTAL_URL are the primary URLs (also used to
// build invite links). ADDITIONAL_ALLOWED_ORIGINS is a comma-separated list
// of extra origins to accept — e.g. custom domains being added on top of the
// existing *.vercel.app URLs during a DNS cutover, without breaking anything
// already pointing at the old URLs.
const extraOrigins = (process.env.ADDITIONAL_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: [
    process.env.ADMIN_PORTAL_URL || 'http://localhost:5173',
    process.env.CLIENT_PORTAL_URL || 'http://localhost:5174',
    ...extraOrigins,
  ],
  credentials: true,
}));

// DocuSeal webhook — raw body needed before JSON parse
app.post('/docuseal/webhook', express.raw({ type: '*/*' }), (req, res, next) => {
  try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
  next();
}, handleInboundWebhook);

// Checkr webhook — plain JSON is fine here (no signature check yet).
app.post('/checkr/webhook', express.json(), handleCheckrWebhook);

// Stripe webhook — needs the raw body untouched to verify the signature.
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json());

app.use('/auth',      require('./routes/auth'));
app.use('/businesses',require('./routes/businesses'));
app.use('/journeys',  require('./routes/journeys'));
app.use('/clients',   require('./routes/clients'));
app.use('/progress',  require('./routes/progress'));
app.use('/webhooks',  require('./routes/webhooks'));

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on :${PORT}`));
startScheduler();
