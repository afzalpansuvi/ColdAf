-- ColdAF Email Tool - Gmail OAuth + Multi-Account Sending
-- PostgreSQL Migration 010

BEGIN;

-- ============================================================
-- Extend smtp_accounts with Gmail OAuth columns
-- ============================================================

-- Allow 'gmail' as a provider value
ALTER TABLE smtp_accounts DROP CONSTRAINT IF EXISTS smtp_accounts_provider_check;
ALTER TABLE smtp_accounts
    ADD CONSTRAINT smtp_accounts_provider_check
    CHECK (provider IN ('smtp', 'sendgrid', 'mailgun', 'gmail'));

-- OAuth fields (nullable — only populated for provider='gmail' OAuth flow)
ALTER TABLE smtp_accounts
    ADD COLUMN IF NOT EXISTS oauth_provider TEXT,
    ADD COLUMN IF NOT EXISTS oauth_access_token TEXT,
    ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT,
    ADD COLUMN IF NOT EXISTS oauth_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS oauth_scope TEXT,
    ADD COLUMN IF NOT EXISTS oauth_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS oauth_status VARCHAR(20) DEFAULT 'active'
        CHECK (oauth_status IN ('active', 'expired', 'revoked'));

CREATE INDEX IF NOT EXISTS idx_smtp_accounts_provider ON smtp_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_smtp_accounts_oauth_email ON smtp_accounts(oauth_email);

-- ============================================================
-- Campaign → SMTP account rotation pool
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_smtp_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    smtp_account_id UUID NOT NULL REFERENCES smtp_accounts(id) ON DELETE CASCADE,
    weight INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, smtp_account_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_smtp_accounts_campaign ON campaign_smtp_accounts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_smtp_accounts_account ON campaign_smtp_accounts(smtp_account_id);

-- ============================================================
-- OAuth state (CSRF token storage for the OAuth redirect flow)
-- Stored in DB as a fallback if Redis is unavailable
-- ============================================================
CREATE TABLE IF NOT EXISTS oauth_states (
    state VARCHAR(128) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    provider VARCHAR(20) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

COMMIT;
