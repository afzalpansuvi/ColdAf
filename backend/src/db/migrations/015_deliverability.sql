BEGIN;

CREATE TABLE IF NOT EXISTS smtp_deliverability_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smtp_account_id UUID NOT NULL REFERENCES smtp_accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blacklist_status JSONB,
  spf_valid BOOLEAN,
  dkim_valid BOOLEAN,
  dmarc_valid BOOLEAN,
  spf_record TEXT,
  dmarc_record TEXT,
  spam_score NUMERIC(4,1),
  spam_level VARCHAR(20),
  spam_flags JSONB
);

CREATE INDEX IF NOT EXISTS idx_smtp_deliv_account
  ON smtp_deliverability_checks(smtp_account_id, checked_at DESC);

COMMIT;
