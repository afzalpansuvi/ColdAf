-- =============================================================================
-- Migration 013: HubSpot CRM Integration + Custom Tracking Domains + Scheduled Reports
-- =============================================================================
-- Three Table-Stakes features from competitive research:
-- 1. HubSpot native two-way sync (TABLE-STAKES #2)
-- 2. Custom tracking domains per brand (DIFFERENTIATOR #4)
-- 3. Scheduled white-label reports (TABLE-STAKES #3 - quick win)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. HubSpot Connections (OAuth + sync config per organization)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hubspot_connections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- OAuth
  access_token          TEXT,
  refresh_token         TEXT,
  token_expires_at      TIMESTAMP,
  hubspot_portal_id     VARCHAR(50),
  hubspot_domain        VARCHAR(255),
  -- Sync configuration
  sync_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  sync_contacts         BOOLEAN NOT NULL DEFAULT TRUE,
  sync_activities       BOOLEAN NOT NULL DEFAULT TRUE,
  sync_deals            BOOLEAN NOT NULL DEFAULT FALSE,
  sync_companies        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Field mapping (JSON: { coldaf_field: hubspot_field })
  field_mapping         JSONB DEFAULT '{}',
  -- Last sync
  last_sync_at          TIMESTAMP,
  last_sync_status      VARCHAR(20) DEFAULT 'pending'
                          CHECK (last_sync_status IN ('pending', 'running', 'success', 'failed', 'partial')),
  last_sync_error       TEXT,
  records_synced_total  INTEGER NOT NULL DEFAULT 0,
  -- Metadata
  connected_by          UUID REFERENCES users(id),
  connected_at          TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  -- Unique per org
  CONSTRAINT hubspot_connections_org_unique UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_hubspot_connections_org ON hubspot_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_hubspot_connections_active ON hubspot_connections(is_active);

-- ---------------------------------------------------------------------------
-- 2. HubSpot Sync Log (individual sync operations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hubspot_sync_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hubspot_connection_id UUID NOT NULL REFERENCES hubspot_connections(id) ON DELETE CASCADE,
  -- Operation
  sync_type             VARCHAR(50) NOT NULL
                          CHECK (sync_type IN ('contacts', 'activities', 'deals', 'companies', 'bidirectional')),
  direction             VARCHAR(20) NOT NULL
                          CHECK (direction IN ('outbound', 'inbound', 'bidirectional')),
  status                VARCHAR(20) NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running', 'success', 'failed', 'partial')),
  records_processed     INTEGER NOT NULL DEFAULT 0,
  records_created       INTEGER NOT NULL DEFAULT 0,
  records_updated       INTEGER NOT NULL DEFAULT 0,
  records_failed        INTEGER NOT NULL DEFAULT 0,
  error_message         TEXT,
  started_at            TIMESTAMP DEFAULT NOW(),
  completed_at          TIMESTAMP,
  -- Timestamps
  created_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hubspot_sync_logs_org ON hubspot_sync_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_hubspot_sync_logs_conn ON hubspot_sync_logs(hubspot_connection_id);
CREATE INDEX IF NOT EXISTS idx_hubspot_sync_logs_status ON hubspot_sync_logs(status);

-- ---------------------------------------------------------------------------
-- 3. Custom Tracking Domains per Brand
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tracking_domains (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_id              UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  -- Domain
  domain                VARCHAR(255) NOT NULL,
  subdomain             VARCHAR(255) NOT NULL DEFAULT 'track',
  full_domain           VARCHAR(255) NOT NULL,
  -- CNAME validation
  cname_record          VARCHAR(255) NOT NULL,
  cname_target          VARCHAR(255) NOT NULL DEFAULT 'track.coldaf.com',
  is_verified           BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at           TIMESTAMP,
  -- SSL
  ssl_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  ssl_cert_expires_at   TIMESTAMP,
  -- Usage
  emails_tracked        INTEGER NOT NULL DEFAULT 0,
  opens_count           INTEGER NOT NULL DEFAULT 0,
  clicks_count          INTEGER NOT NULL DEFAULT 0,
  -- Status
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  is_primary            BOOLEAN NOT NULL DEFAULT FALSE,
  -- Timestamps
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  -- Unique per org+domain
  CONSTRAINT tracking_domains_org_domain_unique UNIQUE (organization_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_tracking_domains_org ON tracking_domains(organization_id);
CREATE INDEX IF NOT EXISTS idx_tracking_domains_brand ON tracking_domains(brand_id);
CREATE INDEX IF NOT EXISTS idx_tracking_domains_verified ON tracking_domains(is_verified);

-- ---------------------------------------------------------------------------
-- 4. Scheduled Reports (white-label client reports)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by            UUID NOT NULL REFERENCES users(id),
  -- Report config
  name                  VARCHAR(200) NOT NULL,
  description           TEXT,
  report_type           VARCHAR(50) NOT NULL
                          CHECK (report_type IN ('campaign_summary', 'brand_performance', 'smtp_health', 'lead_activity', 'replies', 'custom')),
  -- Filters
  filter_brand_ids      UUID[] DEFAULT '{}',
  filter_campaign_ids   UUID[] DEFAULT '{}',
  filter_date_range     VARCHAR(20) NOT NULL DEFAULT 'last_7_days'
                          CHECK (filter_date_range IN ('last_7_days', 'last_30_days', 'last_month', 'this_month', 'custom')),
  filter_date_from      DATE,
  filter_date_to        DATE,
  -- Schedule
  frequency             VARCHAR(20) NOT NULL
                          CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  day_of_week           INTEGER DEFAULT NULL, -- 0=Sunday, 1=Monday, etc. for weekly
  day_of_month          INTEGER DEFAULT NULL, -- 1-31 for monthly
  send_time             TIME NOT NULL DEFAULT '09:00:00',
  timezone              VARCHAR(50) NOT NULL DEFAULT 'UTC',
  -- Recipients
  recipient_emails      TEXT[] NOT NULL DEFAULT '{}',
  -- White-label
  white_label_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  white_label_logo_url  VARCHAR(500),
  white_label_primary_color VARCHAR(7) DEFAULT '#3B82F6',
  -- Format
  format                VARCHAR(20) NOT NULL DEFAULT 'pdf'
                          CHECK (format IN ('pdf', 'csv', 'html', 'both')),
  include_charts        BOOLEAN NOT NULL DEFAULT TRUE,
  include_tables        BOOLEAN NOT NULL DEFAULT TRUE,
  -- Status
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at          TIMESTAMP,
  last_sent_status      VARCHAR(20) DEFAULT 'pending',
  next_send_at          TIMESTAMP,
  send_count            INTEGER NOT NULL DEFAULT 0,
  -- Timestamps
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_org ON scheduled_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active ON scheduled_reports(is_active);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_send ON scheduled_reports(next_send_at);

-- ---------------------------------------------------------------------------
-- 5. Report Delivery Log (track sent reports)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_delivery_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scheduled_report_id   UUID NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  -- Delivery
  sent_at               TIMESTAMP DEFAULT NOW(),
  status                VARCHAR(20) NOT NULL DEFAULT 'sent'
                          CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  recipient_email       VARCHAR(255) NOT NULL,
  subject               VARCHAR(500),
  file_url              VARCHAR(500),
  file_size_bytes       INTEGER,
  error_message         TEXT,
  -- Timestamps
  created_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_delivery_logs_report ON report_delivery_logs(scheduled_report_id);
CREATE INDEX IF NOT EXISTS idx_report_delivery_logs_org ON report_delivery_logs(organization_id);

-- ---------------------------------------------------------------------------
-- 6. Add custom tracking domain columns to brands (for quick lookup)
-- ---------------------------------------------------------------------------
ALTER TABLE brands ADD COLUMN IF NOT EXISTS tracking_domain_id UUID REFERENCES tracking_domains(id);
ALTER TABLE brands ADD COLUMN IF NOT EXISTS custom_tracking_domain VARCHAR(255);

-- ---------------------------------------------------------------------------
-- 7. Migration tracking
-- ---------------------------------------------------------------------------
INSERT INTO _migrations (filename) VALUES ('013_hubspot_tracking_reports.sql')
ON CONFLICT DO NOTHING;
