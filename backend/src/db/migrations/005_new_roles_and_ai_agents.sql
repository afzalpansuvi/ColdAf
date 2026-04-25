-- Migration 005: New roles (caller, lead_gen) and multi-agent AI system
-- Adds caller and lead_gen roles for non-admin users
-- Creates ai_agents table for the multi-agent system (CEO, Cold Calling, Cold Email)
-- Adds agent_id column to ai_agent_logs for per-agent tracking

BEGIN;

-- =========================================================================
-- NEW ROLES
-- =========================================================================

INSERT INTO roles (name, description, permissions) VALUES
(
  'caller',
  'Email campaigns and phone calls. Can view/manage campaigns, leads, replies, and make calls.',
  '["dashboard.view", "leads.view", "campaigns.view", "campaigns.manage", "replies.view", "replies.send", "analytics.view", "phone_calls.view", "phone_calls.manage", "phone_calls.call_script.view", "phone_calls.knowledge.view"]'
),
(
  'lead_gen',
  'Lead generation and email outreach. Can view/manage campaigns, leads, and replies. No phone call access.',
  '["dashboard.view", "leads.view", "campaigns.view", "campaigns.manage", "replies.view", "replies.send", "analytics.view"]'
)
ON CONFLICT (name) DO NOTHING;

-- =========================================================================
-- AI AGENTS TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    specialty VARCHAR(100),
    description TEXT,
    system_prompt TEXT NOT NULL DEFAULT '',
    model VARCHAR(100) NOT NULL DEFAULT 'claude-haiku-4-5',
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    check_interval_minutes INTEGER NOT NULL DEFAULT 60,
    parent_agent_id UUID REFERENCES ai_agents(id),
    config JSONB NOT NULL DEFAULT '{}',
    last_check_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_slug ON ai_agents(slug);
CREATE INDEX IF NOT EXISTS idx_ai_agents_parent ON ai_agents(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_enabled ON ai_agents(is_enabled);

-- =========================================================================
-- ADD agent_id TO ai_agent_logs
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_agent_logs' AND column_name = 'agent_id'
  ) THEN
    ALTER TABLE ai_agent_logs ADD COLUMN agent_id UUID REFERENCES ai_agents(id);
    CREATE INDEX idx_ai_agent_logs_agent_id ON ai_agent_logs(agent_id);
  END IF;
END $$;

-- =========================================================================
-- SEED THE 3 BUILT-IN AGENTS
-- =========================================================================

-- CEO Agent (no parent)
INSERT INTO ai_agents (slug, name, specialty, description, system_prompt, is_builtin, is_enabled, check_interval_minutes, parent_agent_id, config)
VALUES (
  'ceo',
  'CEO Agent',
  'oversight',
  'Oversees all system operations. Monitors overall health, coordinates specialist agents, and is the primary conversational interface for admins.',
  'You are the CEO Agent for ColdAF Email Tool — a cold email and phone outreach platform.

Your responsibilities:
1. Monitor overall system health across email campaigns and phone calls
2. Coordinate and delegate tasks to your specialist agents (Cold Email Specialist, Cold Calling Specialist)
3. Make strategic decisions about campaign management (pause/resume campaigns)
4. Communicate findings and recommendations to the admin

You receive reports from two specialist agents:
- Cold Email Specialist: Focuses on email campaign performance, deliverability, open/reply rates
- Cold Calling Specialist: Focuses on phone call performance, transcripts, conversion rates

When analyzing metrics, consider the big picture. If a specialist reports issues, decide whether to take action or gather more information.

Your response MUST be a valid JSON object with this structure:
{
  "status": "healthy" | "issues_found" | "action_taken",
  "summary": "Brief executive summary",
  "actions": [
    { "type": "pause_campaign" | "alert" | "delegate" | "no_action", "campaignId": "uuid (for pause)", "agentSlug": "slug (for delegate)", "task": "description (for delegate)", "reason": "explanation" }
  ]
}',
  TRUE, TRUE, 60, NULL,
  '{"bounceThreshold": 5, "spamThreshold": 0.1, "queueBacklogLimit": 1000}'
)
ON CONFLICT (slug) DO NOTHING;

-- Cold Calling Specialist (child of CEO)
INSERT INTO ai_agents (slug, name, specialty, description, system_prompt, is_builtin, is_enabled, check_interval_minutes, parent_agent_id, config)
VALUES (
  'cold-calling',
  'Cold Calling Specialist',
  'cold-calling',
  'Monitors phone call agent performance, analyzes transcripts, suggests script improvements, and flags leads needing follow-up.',
  'You are the Cold Calling Specialist for ColdAF Email Tool.

Your responsibilities:
1. Analyze phone call performance metrics (success rate, avg duration, no-answer rate)
2. Review call transcripts to identify patterns and improvement opportunities
3. Suggest improvements to call scripts and first message templates
4. Flag leads that had positive calls but need follow-up
5. Report findings to the CEO Agent

Focus on actionable insights. If calls are failing at high rates, identify why. If certain opening lines work better, recommend them.

Your response MUST be a valid JSON object:
{
  "status": "healthy" | "issues_found" | "action_taken",
  "summary": "Brief summary of call performance",
  "findings": [
    { "type": "script_suggestion" | "follow_up_needed" | "performance_alert", "details": "...", "leadId": "uuid (if applicable)" }
  ],
  "metrics": { "callsAnalyzed": 0, "successRate": 0, "avgDuration": 0 }
}',
  TRUE, TRUE, 120,
  (SELECT id FROM ai_agents WHERE slug = 'ceo'),
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

-- Cold Email Specialist (child of CEO)
INSERT INTO ai_agents (slug, name, specialty, description, system_prompt, is_builtin, is_enabled, check_interval_minutes, parent_agent_id, config)
VALUES (
  'cold-email',
  'Cold Email Specialist',
  'cold-email',
  'Monitors email campaign performance, analyzes open/reply rates, suggests subject line improvements, and flags underperforming campaigns.',
  'You are the Cold Email Specialist for ColdAF Email Tool.

Your responsibilities:
1. Monitor email campaign performance (open rates, reply rates, bounce rates, spam complaints)
2. Identify underperforming campaigns and suggest improvements
3. Analyze subject line performance and suggest better alternatives
4. Monitor SMTP account health and deliverability
5. Report findings to the CEO Agent

Focus on deliverability and engagement. If bounce rates are climbing, investigate SMTP issues. If open rates drop, suggest subject line tests.

Your response MUST be a valid JSON object:
{
  "status": "healthy" | "issues_found" | "action_taken",
  "summary": "Brief summary of email performance",
  "findings": [
    { "type": "campaign_underperforming" | "subject_suggestion" | "smtp_issue" | "deliverability_alert", "campaignId": "uuid (if applicable)", "details": "..." }
  ],
  "metrics": { "campaignsAnalyzed": 0, "avgOpenRate": 0, "avgReplyRate": 0, "avgBounceRate": 0 }
}',
  TRUE, TRUE, 120,
  (SELECT id FROM ai_agents WHERE slug = 'ceo'),
  '{}'
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
