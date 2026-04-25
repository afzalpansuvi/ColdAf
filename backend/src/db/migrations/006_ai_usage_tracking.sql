-- Migration 006: AI Usage Tracking
-- Adds token/model/provider columns for cost tracking and seeds pricing config.

BEGIN;

-- ── Add token tracking columns to ai_chat_messages ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_messages' AND column_name = 'input_tokens'
  ) THEN
    ALTER TABLE ai_chat_messages ADD COLUMN input_tokens INTEGER DEFAULT 0;
    ALTER TABLE ai_chat_messages ADD COLUMN output_tokens INTEGER DEFAULT 0;
    ALTER TABLE ai_chat_messages ADD COLUMN model VARCHAR(100);
    ALTER TABLE ai_chat_messages ADD COLUMN provider VARCHAR(50);
  END IF;
END $$;

-- ── Add model/provider columns to ai_agent_logs ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_agent_logs' AND column_name = 'model'
  ) THEN
    ALTER TABLE ai_agent_logs ADD COLUMN model VARCHAR(100);
    ALTER TABLE ai_agent_logs ADD COLUMN provider VARCHAR(50);
  END IF;
END $$;

-- ── Seed default pricing config ─────────────────────────────────────
INSERT INTO system_settings (key, value, updated_at)
VALUES (
  'ai_pricing_config',
  '{
    "anthropic": {
      "claude-haiku-4-5": { "inputPer1M": 1.00, "outputPer1M": 5.00 },
      "claude-sonnet-4-6": { "inputPer1M": 3.00, "outputPer1M": 15.00 },
      "claude-opus-4-6": { "inputPer1M": 15.00, "outputPer1M": 75.00 }
    },
    "openai": {
      "gpt-4o": { "inputPer1M": 2.50, "outputPer1M": 10.00 },
      "gpt-4o-mini": { "inputPer1M": 0.15, "outputPer1M": 0.60 }
    },
    "google_gemini": {
      "gemini-1.5-pro": { "inputPer1M": 1.25, "outputPer1M": 5.00 },
      "gemini-2.0-flash": { "inputPer1M": 0.10, "outputPer1M": 0.40 }
    }
  }',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- ── Seed default usage limits ───────────────────────────────────────
INSERT INTO system_settings (key, value, updated_at)
VALUES (
  'ai_usage_limits',
  '{
    "monthlyTokenLimit": 5000000,
    "monthlyCostLimit": 50.00,
    "alertAtPercent": 80
  }',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
