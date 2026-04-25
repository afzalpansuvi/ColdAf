-- Migration 002: Enhancements - Warmup, Verification, Blacklist, Templates, Signatures, Sequences, Scoring

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- SMTP Warmup Schedules
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS smtp_warmup_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  smtp_account_id UUID NOT NULL REFERENCES smtp_accounts(id) ON DELETE CASCADE,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  current_day INTEGER DEFAULT 0,
  current_daily_limit INTEGER DEFAULT 2,
  target_daily_limit INTEGER NOT NULL,
  warmup_duration_days INTEGER DEFAULT 30,
  ramp_strategy VARCHAR(20) DEFAULT 'linear',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_warmup_smtp_account ON smtp_warmup_schedules(smtp_account_id);
CREATE INDEX idx_warmup_status ON smtp_warmup_schedules(status);

-- ═══════════════════════════════════════════════════════════════════
-- Blacklist Checks
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blacklist_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  smtp_account_id UUID REFERENCES smtp_accounts(id) ON DELETE SET NULL,
  check_type VARCHAR(10) NOT NULL, -- 'ip' or 'domain'
  checked_value VARCHAR(255) NOT NULL,
  blacklist_name VARCHAR(100) NOT NULL,
  is_listed BOOLEAN DEFAULT false,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_blacklist_smtp ON blacklist_checks(smtp_account_id);
CREATE INDEX idx_blacklist_checked_at ON blacklist_checks(checked_at);

-- ═══════════════════════════════════════════════════════════════════
-- Email Templates
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  subject VARCHAR(500),
  body_html TEXT,
  body_text TEXT,
  category VARCHAR(50) DEFAULT 'cold_outreach',
  tags TEXT[] DEFAULT '{}',
  is_ai_generated BOOLEAN DEFAULT false,
  use_spintax BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_templates_brand ON email_templates(brand_id);
CREATE INDEX idx_templates_category ON email_templates(category);

-- ═══════════════════════════════════════════════════════════════════
-- Email Signatures
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS email_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  full_name VARCHAR(100),
  title VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(255),
  linkedin_url VARCHAR(255),
  twitter_url VARCHAR(255),
  include_logo BOOLEAN DEFAULT true,
  html_content TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_signatures_brand ON email_signatures(brand_id);

-- ═══════════════════════════════════════════════════════════════════
-- Sequence Steps (branching sequences)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES sequence_steps(id) ON DELETE SET NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  step_type VARCHAR(20) NOT NULL, -- 'email', 'wait', 'condition'
  condition_type VARCHAR(30), -- 'start', 'opened', 'not_opened', 'clicked', 'not_clicked', 'replied', 'not_replied', 'no_action'
  condition_value TEXT, -- optional value/config for the condition
  delay_days INTEGER DEFAULT 0,
  delay_hours INTEGER DEFAULT 0,
  ai_prompt_override TEXT,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  subject_override VARCHAR(500),
  branch_label VARCHAR(50), -- 'yes'/'no' or 'true'/'false' for condition branches
  position_x INTEGER DEFAULT 0, -- for visual builder
  position_y INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sequence_campaign ON sequence_steps(campaign_id);
CREATE INDEX idx_sequence_parent ON sequence_steps(parent_step_id);

-- ═══════════════════════════════════════════════════════════════════
-- Lead Sequence State
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lead_sequence_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  current_step_id UUID REFERENCES sequence_steps(id) ON DELETE SET NULL,
  step_completed_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active', -- active, completed, paused, exited
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lead_seq_campaign ON lead_sequence_state(campaign_id);
CREATE INDEX idx_lead_seq_lead ON lead_sequence_state(lead_id);
CREATE INDEX idx_lead_seq_next_action ON lead_sequence_state(next_action_at) WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════════
-- ALTER existing tables: add new columns
-- ═══════════════════════════════════════════════════════════════════

-- Leads: verification, scoring, assignment
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_verification_status VARCHAR(20) DEFAULT 'unverified';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_verification ON leads(email_verification_status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);

-- Reply messages: sentiment classification
ALTER TABLE reply_messages ADD COLUMN IF NOT EXISTS sentiment VARCHAR(30);
CREATE INDEX IF NOT EXISTS idx_replies_sentiment ON reply_messages(sentiment);

-- Brands: tracking domain, signature
ALTER TABLE brands ADD COLUMN IF NOT EXISTS tracking_domain VARCHAR(255);
ALTER TABLE brands ADD COLUMN IF NOT EXISTS default_signature_id UUID;

-- Campaigns: sequence mode flag
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS use_sequences BOOLEAN DEFAULT false;

-- Users: dark mode and theme preferences
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(10) DEFAULT 'light';

COMMIT;
