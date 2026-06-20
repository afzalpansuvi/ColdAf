-- =============================================================================
-- Migration 012: Email Warmup System
-- =============================================================================
-- Per-organization isolated warmup system with configurable ramp curves.
-- Addresses the #1 critical gap identified in competitive research:
-- "Warmup is ColdAF's single largest critical-missing feature."
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Warmup Campaigns (per-organization isolated warmup tracks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warmup_campaigns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  smtp_account_id       UUID NOT NULL REFERENCES smtp_accounts(id) ON DELETE CASCADE,
  name                  VARCHAR(200) NOT NULL DEFAULT 'Warmup Campaign',
  status                VARCHAR(20) NOT NULL DEFAULT 'paused'
                          CHECK (status IN ('active', 'paused', 'completed', 'failed')),
  -- Ramp configuration
  daily_start_volume    INTEGER NOT NULL DEFAULT 5,
  daily_target_volume   INTEGER NOT NULL DEFAULT 40,
  daily_increment       INTEGER NOT NULL DEFAULT 5,
  randomization_percent INTEGER NOT NULL DEFAULT 30
                          CHECK (randomization_percent BETWEEN 0 AND 100),
  target_reply_rate     INTEGER NOT NULL DEFAULT 30
                          CHECK (target_reply_rate BETWEEN 0 AND 100),
  -- Current state
  current_daily_volume  INTEGER NOT NULL DEFAULT 5,
  emails_sent_today     INTEGER NOT NULL DEFAULT 0,
  emails_sent_total     INTEGER NOT NULL DEFAULT 0,
  emails_replied_total  INTEGER NOT NULL DEFAULT 0,
  -- Schedule
  schedule_days         INTEGER NOT NULL DEFAULT 30
                          CHECK (schedule_days BETWEEN 1 AND 90),
  days_elapsed          INTEGER NOT NULL DEFAULT 0,
  -- Health
  health_score          INTEGER DEFAULT NULL
                          CHECK (health_score BETWEEN 0 AND 100),
  last_health_check_at  TIMESTAMP,
  -- Content
  use_ai_conversations  BOOLEAN NOT NULL DEFAULT TRUE,
  conversation_topic    VARCHAR(200) DEFAULT 'business',
  -- Timestamps
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  completed_at          TIMESTAMP,
  -- Index for org scoping
  CONSTRAINT warmup_campaigns_org_smtp_unique UNIQUE (organization_id, smtp_account_id)
);

CREATE INDEX IF NOT EXISTS idx_warmup_campaigns_org ON warmup_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_warmup_campaigns_smtp ON warmup_campaigns(smtp_account_id);
CREATE INDEX IF NOT EXISTS idx_warmup_campaigns_status ON warmup_campaigns(status);

-- ---------------------------------------------------------------------------
-- 2. Warmup Emails (individual warmup messages sent/received)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warmup_emails (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  warmup_campaign_id    UUID NOT NULL REFERENCES warmup_campaigns(id) ON DELETE CASCADE,
  smtp_account_id       UUID NOT NULL REFERENCES smtp_accounts(id) ON DELETE CASCADE,
  -- Email details
  direction             VARCHAR(10) NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  from_address          VARCHAR(255) NOT NULL,
  to_address            VARCHAR(255) NOT NULL,
  subject               VARCHAR(500),
  body_text             TEXT,
  -- Status
  status                VARCHAR(20) NOT NULL DEFAULT 'sent'
                          CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'replied', 'spam')),
  -- Engagement
  opened_at             TIMESTAMP,
  clicked_at            TIMESTAMP,
  replied_at            TIMESTAMP,
  -- Tracking
  message_id            VARCHAR(255),
  thread_id             UUID,
  -- Timestamps
  sent_at               TIMESTAMP DEFAULT NOW(),
  created_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warmup_emails_org ON warmup_emails(organization_id);
CREATE INDEX IF NOT EXISTS idx_warmup_emails_campaign ON warmup_emails(warmup_campaign_id);
CREATE INDEX IF NOT EXISTS idx_warmup_emails_status ON warmup_emails(status);
CREATE INDEX IF NOT EXISTS idx_warmup_emails_direction ON warmup_emails(direction);
CREATE INDEX IF NOT EXISTS idx_warmup_emails_thread ON warmup_emails(thread_id);

-- ---------------------------------------------------------------------------
-- 3. Warmup Network Pools (the pool of warmup partner accounts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warmup_pools (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_name             VARCHAR(100) NOT NULL,
  pool_type             VARCHAR(20) NOT NULL DEFAULT 'shared'
                          CHECK (pool_type IN ('shared', 'dedicated', 'private')),
  -- Configuration
  domain_age_min_days   INTEGER NOT NULL DEFAULT 30,
  domain_age_max_days   INTEGER NOT NULL DEFAULT 365,
  min_reputation_score  INTEGER NOT NULL DEFAULT 70
                          CHECK (min_reputation_score BETWEEN 0 AND 100),
  max_daily_emails      INTEGER NOT NULL DEFAULT 50,
  -- Status
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  total_accounts        INTEGER NOT NULL DEFAULT 0,
  active_accounts       INTEGER NOT NULL DEFAULT 0,
  -- Timestamps
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. Warmup Pool Accounts (individual accounts in the pool)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warmup_pool_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id               UUID NOT NULL REFERENCES warmup_pools(id) ON DELETE CASCADE,
  email_address         VARCHAR(255) NOT NULL,
  display_name          VARCHAR(200),
  domain                VARCHAR(255) NOT NULL,
  -- Health
  reputation_score      INTEGER DEFAULT 100
                          CHECK (reputation_score BETWEEN 0 AND 100),
  health_status         VARCHAR(20) NOT NULL DEFAULT 'healthy'
                          CHECK (health_status IN ('healthy', 'degraded', 'flagged', 'suspended')),
  last_health_check     TIMESTAMP,
  -- Usage
  emails_received_today INTEGER NOT NULL DEFAULT 0,
  emails_sent_today     INTEGER NOT NULL DEFAULT 0,
  -- Engagement simulation
  reply_probability     DECIMAL(3,2) NOT NULL DEFAULT 0.30
                          CHECK (reply_probability BETWEEN 0.00 AND 1.00),
  open_probability      DECIMAL(3,2) NOT NULL DEFAULT 0.60
                          CHECK (open_probability BETWEEN 0.00 AND 1.00),
  -- Content preferences
  industry              VARCHAR(100) DEFAULT 'general',
  conversation_style      VARCHAR(50) DEFAULT 'professional',
  -- Timestamps
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  last_used_at          TIMESTAMP,
  -- Unique constraint
  CONSTRAINT warmup_pool_accounts_email_unique UNIQUE (email_address)
);

CREATE INDEX IF NOT EXISTS idx_warmup_pool_accounts_pool ON warmup_pool_accounts(pool_id);
CREATE INDEX IF NOT EXISTS idx_warmup_pool_accounts_health ON warmup_pool_accounts(health_status);
CREATE INDEX IF NOT EXISTS idx_warmup_pool_accounts_domain ON warmup_pool_accounts(domain);
CREATE INDEX IF NOT EXISTS idx_warmup_pool_accounts_industry ON warmup_pool_accounts(industry);

-- ---------------------------------------------------------------------------
-- 5. Warmup Daily Logs (aggregated daily stats per campaign)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warmup_daily_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  warmup_campaign_id    UUID NOT NULL REFERENCES warmup_campaigns(id) ON DELETE CASCADE,
  smtp_account_id       UUID NOT NULL REFERENCES smtp_accounts(id) ON DELETE CASCADE,
  -- Day data
  day_number            INTEGER NOT NULL,
  date                  DATE NOT NULL,
  -- Volume
  target_volume         INTEGER NOT NULL DEFAULT 0,
  actual_sent           INTEGER NOT NULL DEFAULT 0,
  actual_replies        INTEGER NOT NULL DEFAULT 0,
  actual_bounces        INTEGER NOT NULL DEFAULT 0,
  -- Engagement
  opens_count           INTEGER NOT NULL DEFAULT 0,
  clicks_count          INTEGER NOT NULL DEFAULT 0,
  -- Health
  spam_placement_rate   DECIMAL(5,2) DEFAULT NULL,
  inbox_placement_rate  DECIMAL(5,2) DEFAULT NULL,
  -- Score
  daily_health_score    INTEGER DEFAULT NULL
                          CHECK (daily_health_score BETWEEN 0 AND 100),
  -- Notes
  notes                 TEXT,
  -- Timestamps
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  -- Unique constraint
  CONSTRAINT warmup_daily_logs_campaign_day_unique UNIQUE (warmup_campaign_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_warmup_daily_logs_org ON warmup_daily_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_warmup_daily_logs_campaign ON warmup_daily_logs(warmup_campaign_id);
CREATE INDEX IF NOT EXISTS idx_warmup_daily_logs_date ON warmup_daily_logs(date);

-- ---------------------------------------------------------------------------
-- 6. Seed the default warmup pool with sample accounts
-- ---------------------------------------------------------------------------
INSERT INTO warmup_pools (pool_name, pool_type, total_accounts, active_accounts)
VALUES ('Global Shared Pool', 'shared', 0, 0)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Migration tracking
-- ---------------------------------------------------------------------------
INSERT INTO _migrations (filename) VALUES ('012_warmup_system.sql')
ON CONFLICT DO NOTHING;
