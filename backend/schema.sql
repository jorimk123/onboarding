-- ============================================================
-- CRM Onboarding Platform — PostgreSQL Schema
-- Includes: webhooks, DocuSeal integration
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Businesses (tenants) ────────────────────────────────────────
CREATE TABLE businesses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Users ────────────────────────────────────────────────────
-- role: 'owner' created the business account; 'admin' was invited by an
-- owner/admin; 'client' is an end user (client/volunteer/etc.) being onboarded.
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  password     TEXT NOT NULL,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('owner','admin','client')),
  company      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, email)
);

-- Emails are unique per-business (not globally) since the same person could
-- be a client of one business and an admin of another.
CREATE UNIQUE INDEX idx_users_email_global_owner_admin ON users(email) WHERE role IN ('owner','admin');

-- ── Invites ──────────────────────────────────────────────────
-- Admins invite other admins (owner only) or clients (owner/admin) via a
-- unique token link. Client invites can optionally pre-assign a journey.
CREATE TABLE invites (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  name         TEXT,
  role         TEXT NOT NULL CHECK (role IN ('admin','client')),
  journey_id   UUID, -- FK added below, after journeys table exists
  token        TEXT UNIQUE NOT NULL,
  invited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Journeys ─────────────────────────────────────────────────
CREATE TABLE journeys (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- invites.journey_id references journeys, which is defined after invites —
-- add the FK now that both tables exist.
ALTER TABLE invites ADD CONSTRAINT fk_invites_journey
  FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE SET NULL;

-- ── Sections ─────────────────────────────────────────────────
CREATE TABLE sections (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id   UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  position     INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tasks ─────────────────────────────────────────────────────
CREATE TABLE tasks (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_id            UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  tag                   TEXT,
  assignee              TEXT,
  position              INT NOT NULL DEFAULT 0,
  -- DocuSeal integration
  docuseal_template_id  TEXT,          -- if set, auto-sends doc when journey is assigned
  docuseal_trigger      TEXT DEFAULT 'assignment' CHECK (docuseal_trigger IN ('assignment','completion')),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Client Journey Assignments ────────────────────────────────
CREATE TABLE client_journeys (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journey_id   UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  assigned_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(client_id, journey_id)
);

-- ── Task Completions ──────────────────────────────────────────
CREATE TABLE task_completions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, task_id)
);

-- ── DocuSeal Submissions ──────────────────────────────────────
CREATE TABLE docuseal_submissions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id             UUID REFERENCES tasks(id) ON DELETE SET NULL,
  docuseal_submission_id TEXT NOT NULL,
  template_id         TEXT,
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','declined')),
  signed_at           TIMESTAMPTZ,
  document_url        TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Webhook Endpoints (registered by admin) ───────────────────
CREATE TABLE webhook_endpoints (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  label       TEXT,
  secret      TEXT,                   -- used to sign payloads (HMAC-SHA256)
  events      TEXT[] DEFAULT ARRAY['*'],  -- ['*'] = all, or specific event names
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Webhook Delivery Log ──────────────────────────────────────
CREATE TABLE webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  endpoint_id     UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         JSONB,
  status_code     INT,
  response_body   TEXT,
  success         BOOLEAN DEFAULT FALSE,
  delivered_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX idx_sections_journey    ON sections(journey_id);
CREATE INDEX idx_tasks_section       ON tasks(section_id);
CREATE INDEX idx_cj_client           ON client_journeys(client_id);
CREATE INDEX idx_cj_journey          ON client_journeys(journey_id);
CREATE INDEX idx_tc_client           ON task_completions(client_id);
CREATE INDEX idx_tc_task             ON task_completions(task_id);
CREATE INDEX idx_ds_client           ON docuseal_submissions(client_id);
CREATE INDEX idx_wd_endpoint         ON webhook_deliveries(endpoint_id);
CREATE INDEX idx_users_business      ON users(business_id);
CREATE INDEX idx_journeys_business   ON journeys(business_id);
CREATE INDEX idx_webhooks_business   ON webhook_endpoints(business_id);
CREATE INDEX idx_invites_business    ON invites(business_id);
CREATE INDEX idx_invites_token       ON invites(token);
CREATE INDEX idx_invites_email       ON invites(business_id, email) WHERE status = 'pending';

-- ── Seed: demo business + owner ─────────────────────────────────
-- Sign in at the admin portal with: admin@example.com / admin1234
-- password: admin1234
INSERT INTO businesses (id, name, slug) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Acme Onboarding',
  'acme-onboarding'
);

INSERT INTO users (business_id, email, password, name, role) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@example.com',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
  'Admin User',
  'owner'
);
