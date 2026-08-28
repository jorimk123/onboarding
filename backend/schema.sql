-- ============================================================
-- CRM Onboarding Platform — PostgreSQL Schema
-- Multi-tenant: businesses, admin invites, journey builder,
-- webhooks, DocuSeal integration
--
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS /
-- ON CONFLICT DO NOTHING), so this can run as a deploy step on every
-- release without erroring on an already-migrated database.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Businesses (tenants) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Branding + policy columns (added post-launch; guarded so this stays
-- idempotent against databases that already have them).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#5b4fd6';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS auto_archive_days INT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS weekly_digest_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_digest_sent_at TIMESTAMPTZ;

-- ── Users ────────────────────────────────────────────────────
-- role: 'owner' created the business account; 'admin' was invited by an
-- owner/admin; 'client' is an end user (client/volunteer/etc.) being onboarded.
CREATE TABLE IF NOT EXISTS users (
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global_owner_admin ON users(email) WHERE role IN ('owner','admin');

-- Forgot-password support (added post-launch).
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

-- ── Invites ──────────────────────────────────────────────────
-- Admins invite other admins (owner only) or clients (owner/admin) via a
-- unique token link. Client invites can optionally pre-assign a journey.
CREATE TABLE IF NOT EXISTS invites (
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
CREATE TABLE IF NOT EXISTS journeys (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
-- Free-text category used to group/filter the template library (e.g.
-- "Mentors", "Students", "Partners") — shown as a colored badge/tab.
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- invites.journey_id references journeys, which is defined after invites —
-- add the FK now that both tables exist (guarded: ADD CONSTRAINT has no
-- IF NOT EXISTS in Postgres, so check pg_constraint first).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invites_journey') THEN
    ALTER TABLE invites ADD CONSTRAINT fk_invites_journey
      FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Sections ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id   UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  position     INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tasks ─────────────────────────────────────────────────────
-- A task is one "step" in a journey. step_type drives how it's presented
-- and behaves on the client side; fields holds the typed field defs for
-- Form/Check(quiz)/Learn steps: [{id, label, type, options?, url?, required?}].
CREATE TABLE IF NOT EXISTS tasks (
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

-- Step-type / typed-field system (added post-launch).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS step_type TEXT NOT NULL DEFAULT 'Form'
  CHECK (step_type IN ('Form','Upload','Sign','Check','Learn','Book','Pay'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS fields JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS booking_url TEXT;                -- step_type='Book'
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS payment_amount_cents INT;        -- step_type='Pay'
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS payment_currency TEXT DEFAULT 'usd';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS checkr_package TEXT;             -- step_type='Check', non-quiz

-- BGCheck step type (MinistrySafe background checks). Re-run-safe: drop
-- and recreate the CHECK constraint so this migration can apply cleanly
-- whether or not it's already been run.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_step_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_step_type_check
  CHECK (step_type IN ('Form','Upload','Sign','Check','Learn','Book','Pay','BGCheck'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ministrysafe_level INT;                    -- step_type='BGCheck', 1-7
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ministrysafe_package_code TEXT;            -- alternative to level

-- Per-step behavior settings (Journey Builder "Edit step" panel).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS required_to_continue BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS allow_skip BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_reviewer BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_advance BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_cadence TEXT NOT NULL DEFAULT 'off'
  CHECK (reminder_cadence IN ('off','3days','weekly'));

-- ── Client Journey Assignments ────────────────────────────────
CREATE TABLE IF NOT EXISTS client_journeys (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journey_id   UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  assigned_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  archived_at  TIMESTAMPTZ,
  UNIQUE(client_id, journey_id)
);
ALTER TABLE client_journeys ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ── Task Completions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_completions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, task_id)
);
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Task Field Responses ───────────────────────────────────────
-- Per-field answers a client gives on a Form/Quiz/Learn step. task_completions
-- (above) still tracks whether the *step* is done; this holds the actual
-- typed answers behind it.
CREATE TABLE IF NOT EXISTS task_responses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  field_id     TEXT NOT NULL,
  value        JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, task_id, field_id)
);

-- ── Background Checks (MinistrySafe) ─────────────────────────────
-- Legacy Checkr columns are kept (unused) rather than dropped, so this
-- table's history stays intact; MinistrySafe uses the columns below.
CREATE TABLE IF NOT EXISTS background_checks (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id             UUID REFERENCES tasks(id) ON DELETE SET NULL,
  checkr_candidate_id TEXT,
  checkr_report_id    TEXT,
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending','clear','consider','suspended','failed')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);
ALTER TABLE background_checks DROP CONSTRAINT IF EXISTS background_checks_status_check;
ALTER TABLE background_checks ADD CONSTRAINT background_checks_status_check
  CHECK (status IN ('pending','submitted','clear','consider','suspended','failed'));
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS ministrysafe_user_id TEXT;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS ministrysafe_check_id TEXT;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS applicant_interface_url TEXT;
ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS results_url TEXT;
CREATE INDEX IF NOT EXISTS idx_bc_task_client ON background_checks(task_id, client_id);

-- ── Payments (Stripe) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id                UUID REFERENCES tasks(id) ON DELETE SET NULL,
  stripe_session_id      TEXT,
  stripe_payment_intent  TEXT,
  amount_cents           INT,
  currency               TEXT DEFAULT 'usd',
  status                 TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  paid_at                TIMESTAMPTZ
);

-- ── DocuSeal Submissions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS docuseal_submissions (
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
CREATE TABLE IF NOT EXISTS webhook_endpoints (
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
CREATE TABLE IF NOT EXISTS webhook_deliveries (
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
CREATE INDEX IF NOT EXISTS idx_sections_journey    ON sections(journey_id);
CREATE INDEX IF NOT EXISTS idx_tasks_section       ON tasks(section_id);
CREATE INDEX IF NOT EXISTS idx_cj_client           ON client_journeys(client_id);
CREATE INDEX IF NOT EXISTS idx_cj_journey          ON client_journeys(journey_id);
CREATE INDEX IF NOT EXISTS idx_tc_client           ON task_completions(client_id);
CREATE INDEX IF NOT EXISTS idx_tc_task             ON task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_ds_client           ON docuseal_submissions(client_id);
CREATE INDEX IF NOT EXISTS idx_tr_client_task      ON task_responses(client_id, task_id);
CREATE INDEX IF NOT EXISTS idx_bc_client           ON background_checks(client_id);
CREATE INDEX IF NOT EXISTS idx_pay_client          ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_wd_endpoint         ON webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_users_business      ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_journeys_business   ON journeys(business_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_business   ON webhook_endpoints(business_id);
CREATE INDEX IF NOT EXISTS idx_invites_business    ON invites(business_id);
CREATE INDEX IF NOT EXISTS idx_invites_token       ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email       ON invites(business_id, email) WHERE status = 'pending';

-- ── Seed: demo business + owner ─────────────────────────────────
-- Sign in at the admin portal with: admin@example.com / admin1234
-- password: admin1234
INSERT INTO businesses (id, name, slug) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Acme Onboarding',
  'acme-onboarding'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO users (business_id, email, password, name, role) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@example.com',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
  'Admin User',
  'owner'
) ON CONFLICT (business_id, email) DO NOTHING;
