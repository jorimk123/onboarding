# Onboarding CRM Platform

Multi-tenant onboarding CRM: businesses sign up, invite admins to their team, and build unique onboarding journeys for their clients/volunteers/etc. Includes journey builder, client portal, Zapier webhooks, and DocuSeal e-signature integration.

Note: password hashing uses `bcryptjs` (pure JS) rather than `bcrypt` so `npm install` works out of the box without a native build toolchain. Swap back to `bcrypt` for a small perf gain in production if you like — the API is identical.

---

## Quick Start

### 1. Database
```bash
createdb crm_onboarding
psql crm_onboarding < backend/schema.sql
```
This seeds one demo business ("Acme Onboarding") with an owner login: `admin@example.com` / `admin1234` — change this immediately, or just sign up a fresh business account instead (see below).

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in your values
npm run dev            # :4000
```

### 3. Admin Portal
```bash
cd admin-portal && npm install
echo "VITE_API_URL=http://localhost:4000" > .env.local
npm run dev            # :5173
```
Visit `http://localhost:5173/signup` to create a new business account (you become the **owner**). Owners can invite **admins** to help manage the account from the Team page.

### 4. Client Portal
```bash
cd client-portal && npm install
echo "VITE_API_URL=http://localhost:4000" > .env.local
npm run dev            # :5174
```
Clients don't self-register — an owner/admin invites them from the Clients page in the admin portal (optionally pre-assigning a journey), and they set their password via the invite link.

---

## Business accounts, admins & invites

- **Business account** — created via `/signup` in the admin portal. The person who signs up becomes the **owner**.
- **Admins** — invited by the owner only, from the Team page. Admins can build journeys, manage clients, and configure webhooks, but can't invite other admins or remove team members.
- **Clients** — invited by an owner or admin from the Clients page, optionally with a journey pre-assigned so it's ready the moment they accept.
- **Invite links** — valid for 7 days, single-use. If `RESEND_API_KEY` isn't configured, no email is sent — the invite link is returned directly in the API response and shown in the admin UI with a "Copy link" button, so the whole flow works locally without any email setup.
- **Tenant isolation** — every journey, client, and webhook endpoint is scoped to its business. Admins from one business can never see or modify another business's data.

---

## Zapier Integration

### Setup
1. In Zapier, create a new Zap → **Trigger: Webhooks by Zapier → Catch Hook**
2. Copy the unique Zapier webhook URL
3. In the admin portal → **Webhooks** → **Add endpoint** → paste the URL
4. Choose which events to subscribe to (or select "All events")
5. Click **Send test** to verify the connection in Zapier

### Available Events

| Event | When it fires | Payload includes |
|---|---|---|
| `client.registered` | New client signs up | client id, name, email, company |
| `client.journey_assigned` | Admin assigns a journey | client, journey |
| `task.completed` | Client checks off a task | client, task, journey |
| `section.completed` | All tasks in a section done | client, section, journey |
| `journey.completed` | Client finishes entire journey | client, journey |
| `document.signed` | DocuSeal document fully signed | client, task, submission + document URL |

### Example Zap ideas
- `journey.completed` → Send a Slack message to #new-clients
- `client.registered` → Add to HubSpot / Salesforce as a contact
- `task.completed` → Log to a Google Sheet
- `document.signed` → Notify a team member via email
- `client.journey_assigned` → Create a Trello card

### Payload format
```json
{
  "event": "task.completed",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "data": {
    "client": { "id": "uuid", "email": "jane@co.com", "name": "Jane Smith" },
    "task": { "id": "uuid", "title": "Sign NDA", "tag": "Legal" },
    "journey": { "id": "uuid", "name": "Standard Onboarding" }
  }
}
```

### Payload verification (optional)
If you set a **signing secret** on the endpoint, each request includes:
```
X-Webhook-Signature: sha256=<hmac-sha256-hex>
```
Verify it in Zapier's Code step or your own endpoint with:
```js
const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
const valid = sig === req.headers['x-webhook-signature'].replace('sha256=', '');
```

---

## DocuSeal Integration

DocuSeal is an open-source e-signature platform. Use their cloud at https://docuseal.com or self-host.

### Setup
1. Sign up at https://docuseal.com and get your API key from Settings → API
2. Add to backend `.env`:
   ```
   DOCUSEAL_API_URL=https://api.docuseal.com
   DOCUSEAL_API_KEY=your_api_key
   ```
3. In DocuSeal, create a document template and note its **Template ID** (in the URL: `/templates/12345`)
4. In the admin portal → Journeys → open a journey → edit any task → paste the Template ID into the **DocuSeal Template ID** field
5. Choose when to send: **On assignment** (sent when admin assigns the journey) or **When this task is checked off**

### Inbound webhook (signature → task complete)
When a client signs, DocuSeal sends a webhook back to your platform which auto-completes the linked task.

In DocuSeal → Settings → Webhooks, add:
```
https://your-api-domain.com/docuseal/webhook
```
Event: `form.completed`

The platform will:
- Mark the DocuSeal submission as complete
- Auto-check off the linked task for that client
- Fire the `document.signed` webhook event to all your Zapier endpoints

### What clients see
Tasks with a DocuSeal template show a **📄 Requires signature** badge. Clients receive the document by email from DocuSeal and sign it there — the task auto-completes when they're done.

---

## Deployment (Railway + Vercel)

### Backend on Railway
1. Push to GitHub
2. New Railway project → Deploy from GitHub → select `backend/`
3. Add PostgreSQL plugin → it sets `DATABASE_URL` automatically
4. Add all env vars from `.env.example`
5. Run schema: Railway shell → `npm run db:migrate`

### Frontends on Vercel
```bash
# Admin portal
cd admin-portal && vercel --prod
# Set VITE_API_URL = https://your-railway-api.up.railway.app

# Client portal
cd client-portal && vercel --prod
# Set VITE_API_URL = https://your-railway-api.up.railway.app
```

After deploying, update backend env vars:
```
ADMIN_PORTAL_URL=https://admin.yourdomain.com
CLIENT_PORTAL_URL=https://app.yourdomain.com
```

---

## API Reference

### Auth
| POST | `/auth/register-business` | Create a new business account (owner) |
| GET  | `/auth/invites/:token` | Look up a pending invite (public) |
| POST | `/auth/accept-invite` | Accept an admin or client invite |
| POST | `/auth/login` | Login |
| GET  | `/auth/me` | Current user + business |

### Businesses (owner/admin only, scoped to caller's business)
| GET/PUT | `/businesses/me` | Business profile (rename: owner only) |
| GET | `/businesses/team` | List owner + admins |
| DELETE | `/businesses/team/:userId` | Remove an admin (owner only) |
| GET | `/businesses/invites?role=admin\|client` | List pending invites |
| POST | `/businesses/invites` | Invite an admin (owner only) or client |
| POST | `/businesses/invites/:id/resend` | Resend an invite |
| DELETE | `/businesses/invites/:id` | Revoke a pending invite |

### Journeys (admin: full CRUD, client: read assigned)
| GET/POST | `/journeys` |
| GET/PUT/DELETE | `/journeys/:id` |
| POST/PUT/DELETE | `/journeys/:id/sections/:sid` |
| POST/PUT/DELETE | `/journeys/:id/sections/:sid/tasks/:tid` |

### Clients (admin only)
| GET | `/clients` | All clients with progress |
| POST | `/clients/:id/assign` | Assign journey |
| DELETE | `/clients/:id/assign/:journeyId` | Unassign |

### Progress (authenticated client)
| POST | `/progress/tasks/:id/complete` | Check off task |
| DELETE | `/progress/tasks/:id/complete` | Uncheck task |

### Webhooks (admin only)
| GET | `/webhooks` | List endpoints |
| GET | `/webhooks/events` | All event types |
| POST | `/webhooks` | Register endpoint |
| PUT/DELETE | `/webhooks/:id` | Update/delete |
| POST | `/webhooks/:id/test` | Send test ping |
| GET | `/webhooks/:id/deliveries` | Delivery log |

### DocuSeal (public)
| POST | `/docuseal/webhook` | Inbound signature callback |
