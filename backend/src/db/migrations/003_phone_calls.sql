-- ColdAF Email Tool - Phone Calls Migration
-- PostgreSQL Migration 003

BEGIN;

-- ============================================================
-- PHONE CALLS
-- Tracks outbound AI phone calls made via Vapi.ai
-- ============================================================
CREATE TABLE phone_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES brands(id),
    vapi_call_id VARCHAR(255) UNIQUE,
    vapi_assistant_id VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (
        status IN ('queued', 'initiated', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer', 'busy', 'cancelled')
    ),
    direction VARCHAR(20) NOT NULL DEFAULT 'outbound',
    phone_number VARCHAR(50) NOT NULL,
    duration_seconds INTEGER,
    recording_url TEXT,
    transcript TEXT,
    summary TEXT,
    ended_reason VARCHAR(100),
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    initiated_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phone_calls_lead_id ON phone_calls(lead_id);
CREATE INDEX idx_phone_calls_brand_id ON phone_calls(brand_id);
CREATE INDEX idx_phone_calls_status ON phone_calls(status);
CREATE INDEX idx_phone_calls_vapi_call_id ON phone_calls(vapi_call_id);
CREATE INDEX idx_phone_calls_created_at ON phone_calls(created_at);

-- ============================================================
-- VAPI SYSTEM SETTINGS
-- ============================================================
INSERT INTO system_settings (key, value, description) VALUES
('vapi_call_enabled',           'false',           'Whether the Vapi phone call agent is active'),
('vapi_call_source_filter',     '"discord"',        'Webhook source name keyword to filter Discord leads (case-insensitive)'),
('vapi_retry_on_no_answer',     'true',            'Retry calls that were not answered'),
('vapi_max_retries',            '1',               'Maximum number of retry attempts per lead'),
('vapi_call_delay_hours',       '1',               'Hours to wait before retrying an unanswered call'),
('vapi_schedule_interval_minutes', '30',           'How often (minutes) the agent scans for new uncalled Discord leads'),
('vapi_agent_last_run_at',      'null',            'Timestamp of last Vapi agent scan run')
ON CONFLICT (key) DO NOTHING;

COMMIT;
