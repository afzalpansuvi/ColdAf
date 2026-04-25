-- Migration 004: VAPI call script settings and knowledge base
-- Adds knowledge base table for training the VAPI calling agent
-- Adds system_settings entries for custom call scripts

BEGIN;

-- =========================================================================
-- Knowledge base entries for VAPI call agent
-- =========================================================================
CREATE TABLE IF NOT EXISTS vapi_knowledge_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vapi_knowledge_active ON vapi_knowledge_entries(is_active);
CREATE INDEX IF NOT EXISTS idx_vapi_knowledge_sort ON vapi_knowledge_entries(sort_order);

-- =========================================================================
-- Call script settings in system_settings
-- =========================================================================
INSERT INTO system_settings (key, value, description) VALUES
(
    'vapi_custom_first_message',
    '"Hi, may I speak with {{leadName}}? I''m calling regarding your inquiry about {{projectDetails}}. Is now a good time?"',
    'Custom first message template for Vapi calls. Variables: {{leadName}}, {{projectDetails}}, {{industry}}, {{email}}, {{phone}}'
),
(
    'vapi_system_prompt',
    '""',
    'Custom system prompt / call script for the Vapi AI assistant. Gets sent as assistantOverrides.model.messages system prompt.'
),
(
    'vapi_knowledge_enabled',
    'true',
    'Whether to inject knowledge base entries into the Vapi assistant system prompt context.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
