-- Migration 009: Stripe integration fields + new plan tiers
-- Adds Stripe subscription status, price ID, current period end for dunning,
-- and expands the plan enum to the new market-entry ladder.

BEGIN;

-- =========================================================================
-- 1. Add Stripe-related columns
-- =========================================================================
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_status VARCHAR(32) DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_cancel_at_period_end BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_organizations_stripe_status ON organizations(stripe_status);

-- =========================================================================
-- 2. Raise default usage limits to match the new Free tier sensibly
--    (Existing orgs keep their current limits — only new defaults change.)
-- =========================================================================
ALTER TABLE organizations
  ALTER COLUMN plan SET DEFAULT 'trial',
  ALTER COLUMN max_users SET DEFAULT 3,
  ALTER COLUMN max_brands SET DEFAULT 1,
  ALTER COLUMN max_emails_per_month SET DEFAULT 5000,
  ALTER COLUMN max_phone_minutes_per_month SET DEFAULT 50;

-- =========================================================================
-- 3. Stripe events table (for idempotent webhook processing)
-- =========================================================================
CREATE TABLE IF NOT EXISTS stripe_events (
  id VARCHAR(255) PRIMARY KEY,               -- evt_...
  type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_org ON stripe_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(type);

COMMIT;
