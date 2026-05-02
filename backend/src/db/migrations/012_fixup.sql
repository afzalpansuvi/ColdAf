-- Migration 012: Add unique constraint to campaign_smtp_accounts
-- Prevents duplicate rotation pool entries for the same campaign+account pair

BEGIN;

ALTER TABLE campaign_smtp_accounts
  ADD CONSTRAINT uq_campaign_smtp UNIQUE (campaign_id, smtp_account_id);

COMMIT;
