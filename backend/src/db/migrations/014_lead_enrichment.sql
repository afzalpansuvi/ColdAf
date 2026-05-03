BEGIN;

-- Add enrichment fields to leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS company_size TEXT, -- '1-10', '11-50', '51-200', '201-1000', '1000+'
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS tech_stack JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS recent_news TEXT, -- AI personalization seed
  ADD COLUMN IF NOT EXISTS enrichment_source TEXT; -- 'clay', 'apollo', 'manual', 'csv'

-- Add reply suggestion column to reply_messages if not already added
ALTER TABLE reply_messages ADD COLUMN IF NOT EXISTS suggested_response TEXT;
ALTER TABLE reply_messages ADD COLUMN IF NOT EXISTS sentiment VARCHAR(50);

COMMIT;
