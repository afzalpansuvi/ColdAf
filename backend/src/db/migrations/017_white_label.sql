-- ColdAF Email Tool - White Label / Organization Settings
-- PostgreSQL Migration 017

BEGIN;

CREATE TABLE IF NOT EXISTS organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_org_settings ON organization_settings(organization_id, key);

COMMIT;
