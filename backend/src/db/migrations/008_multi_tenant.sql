-- Migration 008: Multi-Tenant SaaS Conversion
-- Adds organizations as the tenant boundary, platform_owner and super_admin roles,
-- super_admin approval workflow, org_id to all data tables, and usage metering.

BEGIN;

-- =========================================================================
-- 1. ORGANIZATIONS TABLE (tenant boundary)
-- =========================================================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_id UUID,                                -- set after user creation
    logo_url VARCHAR(500),
    website VARCHAR(500),
    -- Subscription
    plan VARCHAR(50) NOT NULL DEFAULT 'trial',    -- trial, starter, pro
    plan_started_at TIMESTAMPTZ DEFAULT NOW(),
    trial_ends_at TIMESTAMPTZ,                    -- NULL after upgrade
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    -- Usage limits (from plan)
    max_users INTEGER NOT NULL DEFAULT 3,
    max_brands INTEGER NOT NULL DEFAULT 1,
    max_emails_per_month INTEGER NOT NULL DEFAULT 1000,
    max_phone_minutes_per_month INTEGER NOT NULL DEFAULT 10,
    -- AI API keys (each org provides their own, AES-256-GCM encrypted)
    anthropic_api_key_enc TEXT,
    openai_api_key_enc TEXT,
    gemini_api_key_enc TEXT,
    -- Usage counters (reset monthly via cron)
    emails_sent_this_month INTEGER NOT NULL DEFAULT 0,
    phone_minutes_this_month NUMERIC(10,2) NOT NULL DEFAULT 0,
    usage_reset_at TIMESTAMPTZ DEFAULT NOW(),
    -- Onboarding
    onboarding_state JSONB DEFAULT '{}',
    -- White-label
    custom_domain VARCHAR(255),
    -- State
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_plan ON organizations(plan);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe ON organizations(stripe_customer_id);

-- =========================================================================
-- 2. SUPER ADMIN REQUESTS (approval workflow)
-- =========================================================================
CREATE TABLE IF NOT EXISTS super_admin_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'declined', 'suspended')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_super_admin_requests_user ON super_admin_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_requests_status ON super_admin_requests(status);

-- =========================================================================
-- 3. ORGANIZATION INVITATIONS
-- =========================================================================
CREATE TABLE IF NOT EXISTS organization_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id),
    invited_by UUID NOT NULL REFERENCES users(id),
    token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON organization_invitations(email);

-- =========================================================================
-- 4. USAGE EVENTS (metering for emails, phone minutes)
-- =========================================================================
CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,             -- email_sent, phone_minutes
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_org ON usage_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON usage_events(created_at);

-- =========================================================================
-- 5. ADD organization_id TO EXISTING TABLES
-- =========================================================================

-- users
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);

-- brands
ALTER TABLE brands ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_brands_organization ON brands(organization_id);

-- smtp_accounts
ALTER TABLE smtp_accounts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_smtp_accounts_organization ON smtp_accounts(organization_id);

-- leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_leads_organization ON leads(organization_id);

-- campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_campaigns_organization ON campaigns(organization_id);

-- campaign_leads
ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_campaign_leads_organization ON campaign_leads(organization_id);

-- emails_sent
ALTER TABLE emails_sent ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_emails_sent_organization ON emails_sent(organization_id);

-- email_templates
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_email_templates_organization ON email_templates(organization_id);

-- email_signatures
ALTER TABLE email_signatures ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_email_signatures_organization ON email_signatures(organization_id);

-- reply_messages
ALTER TABLE reply_messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_reply_messages_organization ON reply_messages(organization_id);

-- phone_calls
ALTER TABLE phone_calls ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_phone_calls_organization ON phone_calls(organization_id);

-- google_sheet_connections
ALTER TABLE google_sheet_connections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_gsheet_connections_organization ON google_sheet_connections(organization_id);

-- webhook_sources
ALTER TABLE webhook_sources ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_webhook_sources_organization ON webhook_sources(organization_id);

-- outbound_integrations
ALTER TABLE outbound_integrations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_outbound_integrations_organization ON outbound_integrations(organization_id);

-- ai_chat_messages
ALTER TABLE ai_chat_messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_organization ON ai_chat_messages(organization_id);

-- ai_agent_logs
ALTER TABLE ai_agent_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_organization ON ai_agent_logs(organization_id);

-- vapi_knowledge_entries
ALTER TABLE vapi_knowledge_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_vapi_knowledge_organization ON vapi_knowledge_entries(organization_id);

-- audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization ON audit_logs(organization_id);

-- notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_organization ON notifications(organization_id);

-- =========================================================================
-- 6. SEED NEW ROLES
-- =========================================================================
INSERT INTO roles (name, description, permissions) VALUES
(
    'platform_owner',
    'Platform owner — approves/suspends super admins, full platform access',
    '["*", "platform.*", "super_admin.approve", "super_admin.suspend"]'
),
(
    'super_admin',
    'Platform-level admin — manages organizations, requires platform owner approval',
    '["*", "platform.view"]'
),
(
    'org_admin',
    'Organization administrator — full access within their organization',
    '["*"]'
),
(
    'org_manager',
    'Organization manager — manages team and campaigns within their organization',
    '["dashboard.view", "leads.view", "leads.manage", "campaigns.view", "campaigns.manage", "replies.view", "replies.send", "analytics.view", "brands.view", "brands.manage", "smtp.view", "smtp.manage", "templates.view", "templates.manage", "integrations.view", "integrations.manage", "users.view", "users.invite", "phone_calls.view", "phone_calls.manage"]'
),
(
    'email_manager',
    'Email campaign manager — manages email campaigns, leads, and replies',
    '["dashboard.view", "leads.view", "leads.manage", "campaigns.view", "campaigns.manage", "replies.view", "replies.send", "analytics.view", "brands.view", "smtp.view", "templates.view", "templates.manage"]'
),
(
    'developer',
    'Developer — extended tool access including webhooks, integrations, and AI settings',
    '["dashboard.view", "leads.view", "campaigns.view", "campaigns.manage", "replies.view", "replies.send", "analytics.view", "integrations.view", "integrations.manage", "webhooks.view", "webhooks.manage", "templates.view", "templates.manage", "phone_calls.view", "phone_calls.manage", "settings.view", "ai.view", "ai.manage"]'
)
ON CONFLICT (name) DO NOTHING;

-- =========================================================================
-- 7. BACKFILL: Create Default Organization for existing data
-- =========================================================================
DO $$
DECLARE
    default_org_id UUID;
    admin_user_id UUID;
    org_admin_role_id UUID;
BEGIN
    -- Only run if no organizations exist yet
    IF NOT EXISTS (SELECT 1 FROM organizations LIMIT 1) THEN
        default_org_id := uuid_generate_v4();

        INSERT INTO organizations (id, name, slug, plan, plan_started_at, max_users, max_brands, max_emails_per_month, max_phone_minutes_per_month)
        VALUES (default_org_id, 'Default Organization', 'default', 'pro', NOW(), 999999, 999999, 999999, 999999);

        -- Backfill all existing rows with the default org
        UPDATE users SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE brands SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE smtp_accounts SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE leads SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE campaigns SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE campaign_leads SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE emails_sent SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE email_templates SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE email_signatures SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE reply_messages SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE phone_calls SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE google_sheet_connections SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE webhook_sources SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE outbound_integrations SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE ai_chat_messages SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE ai_agent_logs SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE vapi_knowledge_entries SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE audit_logs SET organization_id = default_org_id WHERE organization_id IS NULL;
        UPDATE notifications SET organization_id = default_org_id WHERE organization_id IS NULL;

        -- Set the first admin user as org owner
        SELECT u.id INTO admin_user_id
        FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.name = 'admin'
        ORDER BY u.created_at ASC LIMIT 1;

        IF admin_user_id IS NOT NULL THEN
            UPDATE organizations SET owner_id = admin_user_id WHERE id = default_org_id;

            -- Reassign existing admin to org_admin role
            SELECT id INTO org_admin_role_id FROM roles WHERE name = 'org_admin';
            IF org_admin_role_id IS NOT NULL THEN
                UPDATE users SET role_id = org_admin_role_id WHERE id = admin_user_id;
            END IF;
        END IF;
    END IF;
END $$;

-- =========================================================================
-- 8. SEED PLATFORM OWNER ACCOUNT (apansuvi1@gmail.com)
-- =========================================================================
DO $$
DECLARE
    po_role_id UUID;
    po_user_id UUID;
BEGIN
    SELECT id INTO po_role_id FROM roles WHERE name = 'platform_owner';

    -- Only create if platform_owner doesn't exist yet
    IF po_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'apansuvi1@gmail.com') THEN
        INSERT INTO users (id, email, password_hash, full_name, role_id, is_active)
        VALUES (
            uuid_generate_v4(),
            'apansuvi1@gmail.com',
            -- Temporary hash, must be reset on first login
            crypt('CHANGE_ME_ON_FIRST_LOGIN', gen_salt('bf', 10)),
            'Platform Owner',
            po_role_id,
            TRUE
        )
        RETURNING id INTO po_user_id;
    ELSIF po_role_id IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email = 'apansuvi1@gmail.com') THEN
        -- Existing user: just upgrade role to platform_owner
        UPDATE users SET role_id = po_role_id WHERE email = 'apansuvi1@gmail.com';
    END IF;
END $$;

-- =========================================================================
-- 9. ADD NOT NULL CONSTRAINTS (after backfill)
--    organization_id is required for most tables going forward.
--    audit_logs and users keep it nullable for platform-level records.
-- =========================================================================

-- Tables that require org_id on all new rows
DO $$
BEGIN
    -- brands
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE brands ALTER COLUMN organization_id SET NOT NULL;
    END IF;
    -- smtp_accounts
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'smtp_accounts' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE smtp_accounts ALTER COLUMN organization_id SET NOT NULL;
    END IF;
    -- leads
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE leads ALTER COLUMN organization_id SET NOT NULL;
    END IF;
    -- campaigns
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE campaigns ALTER COLUMN organization_id SET NOT NULL;
    END IF;
    -- campaign_leads
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaign_leads' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE campaign_leads ALTER COLUMN organization_id SET NOT NULL;
    END IF;
    -- emails_sent
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'emails_sent' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE emails_sent ALTER COLUMN organization_id SET NOT NULL;
    END IF;
    -- email_templates
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE email_templates ALTER COLUMN organization_id SET NOT NULL;
    END IF;
    -- email_signatures
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_signatures' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE email_signatures ALTER COLUMN organization_id SET NOT NULL;
    END IF;
    -- reply_messages
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reply_messages' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE reply_messages ALTER COLUMN organization_id SET NOT NULL;
    END IF;
    -- phone_calls
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'phone_calls' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE phone_calls ALTER COLUMN organization_id SET NOT NULL;
    END IF;
    -- ai_chat_messages
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_chat_messages' AND column_name = 'organization_id' AND is_nullable = 'YES') THEN
        ALTER TABLE ai_chat_messages ALTER COLUMN organization_id SET NOT NULL;
    END IF;
END $$;

-- organizations.owner_id FK now that users table has been populated
ALTER TABLE organizations
    DROP CONSTRAINT IF EXISTS organizations_owner_id_fkey;
ALTER TABLE organizations
    ADD CONSTRAINT organizations_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;
