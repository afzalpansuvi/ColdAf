-- ColdAF Email Tool - Complete Database Schema
-- PostgreSQL Migration 001

BEGIN;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS & AUTH
-- ============================================================
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);

-- ============================================================
-- BRANDS
-- ============================================================
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    logo_url VARCHAR(500),
    primary_domain VARCHAR(255) NOT NULL,
    office_address TEXT,
    website_url VARCHAR(500),
    ai_system_prompt TEXT NOT NULL DEFAULT '',
    booking_link VARCHAR(500),
    daily_send_limit INTEGER NOT NULL DEFAULT 50,
    send_window_start TIME NOT NULL DEFAULT '09:00',
    send_window_end TIME NOT NULL DEFAULT '17:00',
    send_days VARCHAR(20) NOT NULL DEFAULT 'mon,tue,wed,thu,fri',
    min_delay_minutes INTEGER NOT NULL DEFAULT 3,
    max_delay_minutes INTEGER NOT NULL DEFAULT 9,
    ai_model VARCHAR(100) NOT NULL DEFAULT 'claude-haiku-3-5',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SMTP ACCOUNTS
-- ============================================================
CREATE TABLE smtp_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    email_address VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    provider VARCHAR(20) NOT NULL DEFAULT 'smtp' CHECK (provider IN ('smtp', 'sendgrid', 'mailgun')),
    smtp_host VARCHAR(255),
    smtp_port INTEGER,
    smtp_username VARCHAR(255),
    smtp_password_encrypted TEXT,
    api_key_encrypted TEXT,
    use_tls BOOLEAN NOT NULL DEFAULT TRUE,
    imap_host VARCHAR(255),
    imap_port INTEGER DEFAULT 993,
    imap_username VARCHAR(255),
    imap_password_encrypted TEXT,
    health_status VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'degraded', 'failed', 'unknown')),
    last_health_check_at TIMESTAMPTZ,
    last_health_check_result JSONB,
    daily_send_limit INTEGER NOT NULL DEFAULT 50,
    sends_today INTEGER NOT NULL DEFAULT 0,
    sends_today_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_smtp_accounts_brand_id ON smtp_accounts(brand_id);
CREATE INDEX idx_smtp_accounts_health_status ON smtp_accounts(health_status);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    lead_type VARCHAR(100),
    industry VARCHAR(255),
    project_details TEXT,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('google_sheets', 'csv', 'webhook', 'manual')),
    source_detail VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'queued', 'sent', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed')),
    unsubscribed BOOLEAN NOT NULL DEFAULT FALSE,
    brand_id UUID REFERENCES brands(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(email, brand_id)
);

CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_brand_id ON leads(brand_id);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_source_type ON leads(source_type);
CREATE INDEX idx_leads_industry ON leads(industry);
CREATE INDEX idx_leads_lead_type ON leads(lead_type);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
    is_multi_brand BOOLEAN NOT NULL DEFAULT FALSE,
    multi_brand_strategy VARCHAR(20) DEFAULT 'simultaneous' CHECK (multi_brand_strategy IN ('simultaneous', 'staggered')),
    multi_brand_stagger_days INTEGER DEFAULT 1,
    lead_filter JSONB DEFAULT '{}',
    schedule_start TIMESTAMPTZ,
    schedule_end TIMESTAMPTZ,
    daily_send_limit INTEGER NOT NULL DEFAULT 50,
    min_delay_minutes INTEGER NOT NULL DEFAULT 3,
    max_delay_minutes INTEGER NOT NULL DEFAULT 9,
    send_window_start TIME NOT NULL DEFAULT '09:00',
    send_window_end TIME NOT NULL DEFAULT '17:00',
    send_days VARCHAR(20) NOT NULL DEFAULT 'mon,tue,wed,thu,fri',
    followup_count INTEGER NOT NULL DEFAULT 2,
    followup_delays JSONB NOT NULL DEFAULT '[3, 5]',
    auto_pause_bounce_rate NUMERIC(5,2) DEFAULT 8.0,
    auto_pause_spam_rate NUMERIC(5,2) DEFAULT 0.2,
    auto_pause_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    total_sent INTEGER NOT NULL DEFAULT 0,
    total_opened INTEGER NOT NULL DEFAULT 0,
    total_clicked INTEGER NOT NULL DEFAULT 0,
    total_replied INTEGER NOT NULL DEFAULT 0,
    total_bounced INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at);

-- Campaign-Brand association (many-to-many)
CREATE TABLE campaign_brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    UNIQUE(campaign_id, brand_id)
);

CREATE INDEX idx_campaign_brands_campaign_id ON campaign_brands(campaign_id);
CREATE INDEX idx_campaign_brands_brand_id ON campaign_brands(brand_id);

-- Campaign-Lead association
CREATE TABLE campaign_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES brands(id),
    ab_variant_id UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'opened', 'clicked', 'replied', 'bounced', 'failed', 'skipped')),
    followup_stage INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMPTZ,
    next_followup_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(campaign_id, lead_id, brand_id)
);

CREATE INDEX idx_campaign_leads_campaign_id ON campaign_leads(campaign_id);
CREATE INDEX idx_campaign_leads_lead_id ON campaign_leads(lead_id);
CREATE INDEX idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX idx_campaign_leads_next_followup ON campaign_leads(next_followup_at);

-- ============================================================
-- EMAILS SENT
-- ============================================================
CREATE TABLE emails_sent (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id),
    campaign_lead_id UUID REFERENCES campaign_leads(id),
    lead_id UUID NOT NULL REFERENCES leads(id),
    brand_id UUID NOT NULL REFERENCES brands(id),
    smtp_account_id UUID NOT NULL REFERENCES smtp_accounts(id),
    ab_variant_id UUID,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    message_id VARCHAR(500),
    followup_number INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed')),
    sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emails_sent_campaign_id ON emails_sent(campaign_id);
CREATE INDEX idx_emails_sent_lead_id ON emails_sent(lead_id);
CREATE INDEX idx_emails_sent_brand_id ON emails_sent(brand_id);
CREATE INDEX idx_emails_sent_smtp_account_id ON emails_sent(smtp_account_id);
CREATE INDEX idx_emails_sent_status ON emails_sent(status);
CREATE INDEX idx_emails_sent_sent_at ON emails_sent(sent_at);
CREATE INDEX idx_emails_sent_message_id ON emails_sent(message_id);
CREATE INDEX idx_emails_sent_to_email ON emails_sent(to_email);

-- ============================================================
-- EMAIL EVENTS (opens, clicks, etc.)
-- ============================================================
CREATE TABLE email_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID NOT NULL REFERENCES emails_sent(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('open', 'click', 'bounce', 'spam_complaint', 'unsubscribe')),
    metadata JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_events_email_id ON email_events(email_id);
CREATE INDEX idx_email_events_event_type ON email_events(event_type);
CREATE INDEX idx_email_events_created_at ON email_events(created_at);

-- ============================================================
-- A/B TESTS
-- ============================================================
CREATE TABLE ab_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    test_type VARCHAR(50) NOT NULL CHECK (test_type IN ('subject_line', 'body_style', 'send_time', 'multi_brand_strategy', 'combined')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    winner_variant_id UUID,
    min_sample_size INTEGER NOT NULL DEFAULT 100,
    auto_select_winner BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ab_tests_campaign_id ON ab_tests(campaign_id);

CREATE TABLE ab_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ab_test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    variant_type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    total_sent INTEGER NOT NULL DEFAULT 0,
    total_opened INTEGER NOT NULL DEFAULT 0,
    total_clicked INTEGER NOT NULL DEFAULT 0,
    total_replied INTEGER NOT NULL DEFAULT 0,
    total_bounced INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ab_variants_ab_test_id ON ab_variants(ab_test_id);

-- Add FK now that ab_variants exists
ALTER TABLE campaign_leads ADD CONSTRAINT fk_campaign_leads_variant
    FOREIGN KEY (ab_variant_id) REFERENCES ab_variants(id);
ALTER TABLE emails_sent ADD CONSTRAINT fk_emails_sent_variant
    FOREIGN KEY (ab_variant_id) REFERENCES ab_variants(id);

-- ============================================================
-- REPLY MESSAGES
-- ============================================================
CREATE TABLE reply_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID REFERENCES emails_sent(id),
    lead_id UUID NOT NULL REFERENCES leads(id),
    campaign_id UUID REFERENCES campaigns(id),
    brand_id UUID NOT NULL REFERENCES brands(id),
    smtp_account_id UUID REFERENCES smtp_accounts(id),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    from_email VARCHAR(255) NOT NULL,
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    body_html TEXT,
    body_text TEXT,
    message_id VARCHAR(500),
    in_reply_to VARCHAR(500),
    sent_by_user_id UUID REFERENCES users(id),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reply_messages_lead_id ON reply_messages(lead_id);
CREATE INDEX idx_reply_messages_campaign_id ON reply_messages(campaign_id);
CREATE INDEX idx_reply_messages_brand_id ON reply_messages(brand_id);
CREATE INDEX idx_reply_messages_direction ON reply_messages(direction);
CREATE INDEX idx_reply_messages_is_read ON reply_messages(is_read);
CREATE INDEX idx_reply_messages_created_at ON reply_messages(created_at);

-- ============================================================
-- INTEGRATIONS
-- ============================================================
CREATE TABLE google_sheet_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    sheet_url VARCHAR(500) NOT NULL,
    sheet_id VARCHAR(255) NOT NULL,
    tab_name VARCHAR(255) DEFAULT 'Sheet1',
    service_account_credentials_encrypted TEXT NOT NULL,
    column_mapping JSONB NOT NULL DEFAULT '{}',
    polling_interval_seconds INTEGER NOT NULL DEFAULT 60,
    last_seen_row INTEGER NOT NULL DEFAULT 0,
    last_sync_at TIMESTAMPTZ,
    leads_imported INTEGER NOT NULL DEFAULT 0,
    brand_id UUID REFERENCES brands(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    endpoint_path VARCHAR(255) NOT NULL UNIQUE,
    secret_token VARCHAR(255) NOT NULL,
    field_mapping JSONB NOT NULL DEFAULT '{}',
    brand_id UUID REFERENCES brands(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_source_id UUID NOT NULL REFERENCES webhook_sources(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'skipped')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_source_id ON webhook_events(webhook_source_id);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at);

CREATE TABLE outbound_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('discord', 'custom_webhook', 'google_sheets_export')),
    config JSONB NOT NULL DEFAULT '{}',
    event_triggers JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id),
    actor_name VARCHAR(255) NOT NULL DEFAULT 'System',
    action_type VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id UUID,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_logs_target_type ON audit_logs(target_type);
CREATE INDEX idx_audit_logs_target_id ON audit_logs(target_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================
CREATE TABLE system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AI AGENT LOGS
-- ============================================================
CREATE TABLE ai_agent_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'issues_found', 'action_taken', 'error')),
    summary TEXT NOT NULL,
    metrics_snapshot JSONB NOT NULL DEFAULT '{}',
    actions_taken JSONB NOT NULL DEFAULT '[]',
    token_usage JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_agent_logs_created_at ON ai_agent_logs(created_at);

-- ============================================================
-- AI CHAT HISTORY (Admin chat interface)
-- ============================================================
CREATE TABLE ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    actions_taken JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_chat_messages_user_id ON ai_chat_messages(user_id);
CREATE INDEX idx_ai_chat_messages_created_at ON ai_chat_messages(created_at);

-- ============================================================
-- SEED DEFAULT ROLES
-- ============================================================
INSERT INTO roles (name, description, permissions) VALUES
('admin', 'Full system access', '["*"]'),
('sales', 'View dashboard, leads, replies, and respond to leads', '["dashboard.view", "leads.view", "campaigns.view", "replies.view", "replies.send", "analytics.view"]');

-- ============================================================
-- SEED DEFAULT SETTINGS
-- ============================================================
INSERT INTO system_settings (key, value, description) VALUES
('default_daily_send_limit', '50', 'Default emails per day per SMTP account'),
('default_send_window_start', '"09:00"', 'Default start time for sending window'),
('default_send_window_end', '"17:00"', 'Default end time for sending window'),
('default_send_days', '"mon,tue,wed,thu,fri"', 'Default sending days'),
('default_min_delay_minutes', '3', 'Minimum delay between sends (minutes)'),
('default_max_delay_minutes', '9', 'Maximum delay between sends (minutes)'),
('auto_pause_bounce_rate', '8.0', 'Bounce rate % to trigger auto-pause'),
('auto_pause_spam_rate', '0.2', 'Spam complaint rate % to trigger auto-pause'),
('ai_email_model', '"claude-haiku-3-5"', 'Claude model for email generation'),
('ai_agent_model', '"claude-haiku-3-5"', 'Claude model for AI monitoring agent'),
('ai_agent_enabled', 'true', 'Whether AI monitoring agent is active'),
('ai_agent_interval_hours', '2', 'AI agent check interval in hours'),
('ai_agent_can_auto_pause', 'true', 'Whether AI agent can auto-pause campaigns'),
('ai_agent_bounce_threshold', '8.0', 'Agent bounce rate alert threshold'),
('ai_agent_spam_threshold', '0.2', 'Agent spam rate alert threshold'),
('ai_agent_queue_backlog_limit', '1000', 'Agent queue backlog alert threshold'),
('smtp_health_check_interval_hours', '6', 'SMTP health check interval'),
('reply_poll_interval_minutes', '5', 'IMAP reply polling interval'),
('sheets_poll_interval_seconds', '60', 'Google Sheets polling interval'),
('platform_timezone', '"America/New_York"', 'Platform timezone'),
('unsubscribe_page_text', '"You have been successfully unsubscribed. You will no longer receive emails from us."', 'Unsubscribe page text'),
('notification_events', '["reply_received", "campaign_paused", "smtp_degraded", "smtp_failed", "bounce_threshold", "spam_threshold"]', 'Events that trigger notifications');

COMMIT;
