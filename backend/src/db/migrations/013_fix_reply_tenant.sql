BEGIN;

-- Backfill NULL organization_id from the smtp_account that received the reply
UPDATE reply_messages rm
SET organization_id = sa.organization_id
FROM smtp_accounts sa
WHERE rm.smtp_account_id = sa.id
  AND rm.organization_id IS NULL;

-- Also backfill from leads for rows where smtp_account_id is NULL
UPDATE reply_messages rm
SET organization_id = l.organization_id
FROM leads l
WHERE rm.lead_id = l.id
  AND rm.organization_id IS NULL;

-- Add suggested_response column for AI-generated reply suggestions
ALTER TABLE reply_messages ADD COLUMN IF NOT EXISTS suggested_response TEXT;

COMMIT;
