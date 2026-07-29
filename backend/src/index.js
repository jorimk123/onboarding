require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { handleInboundWebhook } = require('./services/docuseal');

const app = express();

app.use(cors({
  origin: [
    process.env.ADMIN_PORTAL_URL || 'http://localhost:5173',
    process.env.CLIENT_PORTAL_URL || 'http://localhost:5174',
  ],
  credentials: true,
}));

// DocuSeal webhook — raw body needed before JSON parse
app.post('/docuseal/webhook', express.raw({ type: '*/*' }), (req, res, next) => {
  try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
  next();
}, handleInboundWebhook);

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
