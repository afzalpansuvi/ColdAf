const { generateCompletion } = require('./aiProvider');
const db = require('../config/database');
const logger = require('../utils/logger');
const { createNotification } = require('./notifications');
const { logAction } = require('./audit');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetches a single value from the system_settings table.
 * Returns the default if the key does not exist.
 */
async function getSetting(key, defaultValue = null) {
  const result = await db.query(
    'SELECT value FROM system_settings WHERE key = $1 LIMIT 1',
    [key]
  );
  if (result.rows.length === 0) return defaultValue;
  return result.rows[0].value;
}

/**
 * Gathers all system metrics the agent needs to evaluate health.
 */
async function gatherMetrics() {
  // Active campaigns
  const campaignsResult = await db.query(
    `SELECT id, name, status FROM campaigns WHERE status = 'active'`
  );
  const activeCampaigns = campaignsResult.rows;

  // Per-campaign metrics from last 24h
  const campaignMetrics = [];
  for (const campaign of activeCampaigns) {
    const metricsResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'sent')    AS sent,
         COUNT(*) FILTER (WHERE status = 'bounced')  AS bounced,
         COUNT(*) FILTER (WHERE status = 'failed')   AS failed,
         COUNT(*) FILTER (WHERE status = 'replied')  AS replied
       FROM emails_sent
       WHERE campaign_id = $1
         AND created_at >= NOW() - INTERVAL '24 hours'`,
      [campaign.id]
    );
    const m = metricsResult.rows[0];
    const sent = parseInt(m.sent, 10) || 0;
    const bounced = parseInt(m.bounced, 10) || 0;
    const replied = parseInt(m.replied, 10) || 0;

    campaignMetrics.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      sent,
      bounced,
      bounceRate: sent > 0 ? parseFloat(((bounced / sent) * 100).toFixed(2)) : 0,
      spamComplaints: 0, // updated below if available
      replyRate: sent > 0 ? parseFloat(((replied / sent) * 100).toFixed(2)) : 0,
    });
  }

  // Spam complaints per campaign (if spam_complaints table exists)
  try {
    for (const cm of campaignMetrics) {
      const spamResult = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM spam_complaints
         WHERE campaign_id = $1
           AND created_at >= NOW() - INTERVAL '24 hours'`,
        [cm.campaignId]
      );
      cm.spamComplaints = parseInt(spamResult.rows[0].cnt, 10) || 0;
    }
  } catch (err) {
    // Table may not exist yet; ignore gracefully
    logger.debug('spam_complaints table not available, skipping', { error: err.message });
  }

  // SMTP account health
  const smtpResult = await db.query(
    `SELECT id, email, status, health_status FROM smtp_accounts WHERE is_active = TRUE`
  );
  const smtpHealth = smtpResult.rows.map((s) => ({
    id: s.id,
    email: s.email,
    status: s.status,
    healthStatus: s.health_status,
  }));

  // Email queue backlog
  const queueResult = await db.query(
    `SELECT COUNT(*) AS cnt FROM emails_sent WHERE status = 'queued'`
  );
  const queueBacklog = parseInt(queueResult.rows[0].cnt, 10) || 0;

  // Failed email jobs in last 24h
  const failedResult = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM emails_sent
     WHERE status = 'failed'
       AND created_at >= NOW() - INTERVAL '24 hours'`
  );
  const failedJobs24h = parseInt(failedResult.rows[0].cnt, 10) || 0;

  // Overall stats today
  const todayResult = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'sent')    AS total_sent,
       COUNT(*) FILTER (WHERE status = 'bounced')  AS total_bounced
     FROM emails_sent
     WHERE created_at >= CURRENT_DATE`
  );
  const totalSentToday = parseInt(todayResult.rows[0].total_sent, 10) || 0;
  const totalBouncedToday = parseInt(todayResult.rows[0].total_bounced, 10) || 0;

  return {
    activeCampaigns: activeCampaigns.map((c) => ({ id: c.id, name: c.name })),
    campaignMetrics,
    smtpHealth,
    queueBacklog,
    failedJobs24h,
    totalSentToday,
    totalBouncedToday,
  };
}

// ─── Main Agent Function ──────────────────────────────────────────────────────

/**
 * Runs a single AI agent health-check cycle.
 *
 * 1. Checks whether the agent is enabled in system_settings.
 * 2. Gathers system metrics (campaigns, bounces, queue, SMTP health, etc.).
 * 3. Sends the metrics to Claude and asks for an action plan.
 * 4. Executes any auto-pause actions if permitted.
 * 5. Creates admin notifications for issues found.
 * 6. Writes a log entry to ai_agent_logs.
 *
 * @returns {Object|null} The saved log entry, or null if the agent is disabled.
 */
async function runAgentCheck() {
  // 1. Check if the agent is enabled
  const enabled = await getSetting('ai_agent_enabled', 'false');
  if (enabled !== 'true') {
    logger.debug('AI agent is disabled, skipping check');
    return null;
  }

  logger.info('AI agent check starting');

  // 2. Gather metrics
  let metrics;
  try {
    metrics = await gatherMetrics();
  } catch (err) {
    logger.error('AI agent failed to gather metrics', { error: err.message });
    throw err;
  }

  // 3. Load thresholds and settings
  const bounceThreshold = parseFloat(await getSetting('ai_agent_bounce_threshold', '5')) || 5;
  const spamThreshold = parseFloat(await getSetting('ai_agent_spam_threshold', '0.1')) || 0.1;
  const queueBacklogLimit = parseInt(await getSetting('ai_agent_queue_backlog_limit', '1000'), 10) || 1000;
  const autoPauseEnabled = (await getSetting('ai_agent_auto_pause', 'false')) === 'true';
  const aiModel = await getSetting('ai_agent_model', 'claude-haiku-3-5');

  // 4. Build prompts for Claude
  const systemPrompt = [
    'You are a monitoring agent for an email sending platform called ColdAF Email Tool.',
    'Review the provided system metrics and return a JSON action plan.',
    '',
    'Your response MUST be a single valid JSON object with this structure:',
    '{',
    '  "status": "healthy" | "issues_found" | "action_taken",',
    '  "summary": "Brief summary of findings",',
    '  "actions": [',
    '    {',
    '      "type": "pause_campaign" | "alert" | "no_action",',
    '      "campaignId": "uuid (only for pause_campaign)",',
    '      "reason": "Explanation of why this action is recommended"',
    '    }',
    '  ]',
    '}',
    '',
    'Guidelines:',
    `- Bounce rate threshold: ${bounceThreshold}%. Recommend pausing campaigns that exceed this.`,
    `- Spam complaint threshold: ${spamThreshold}%. Recommend pausing campaigns that exceed this.`,
    `- Queue backlog warning limit: ${queueBacklogLimit} emails.`,
    '- If all metrics look healthy, return status "healthy" with an empty actions array.',
    '- Always provide a clear, concise summary.',
    '- Do not include any text outside the JSON object.',
  ].join('\n');

  const userPrompt = [
    'Here are the current system metrics:',
    '',
    JSON.stringify(metrics, null, 2),
    '',
    `Auto-pause is ${autoPauseEnabled ? 'ENABLED' : 'DISABLED'}.`,
    `Current thresholds: bounce=${bounceThreshold}%, spam=${spamThreshold}%, queue_backlog=${queueBacklogLimit}`,
    '',
    'Analyze these metrics and return your JSON action plan.',
  ].join('\n');

  // 5. Call Claude API
  let aiResponse;
  let tokenUsage = { input_tokens: 0, output_tokens: 0 };

  try {
    const aiResult = await generateCompletion({
      model: aiModel,
      systemPrompt,
      userPrompt,
      maxTokens: 1000,
    });
    aiResponse = aiResult.text;
    tokenUsage = {
      input_tokens: aiResult.inputTokens || 0,
      output_tokens: aiResult.outputTokens || 0,
    };
  } catch (err) {
    logger.error('AI agent Claude API call failed', { error: err.message });

    // Log the failure
    await db.query(
      `INSERT INTO ai_agent_logs (status, summary, metrics_snapshot, actions_taken, token_usage)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'error',
        `Claude API call failed: ${err.message}`,
        JSON.stringify(metrics),
        JSON.stringify([]),
        JSON.stringify(tokenUsage),
      ]
    );

    throw err;
  }

  // 6. Parse the response
  let actionPlan;
  try {
    // Strip markdown fences if present
    let cleaned = aiResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    actionPlan = JSON.parse(cleaned);
  } catch (err) {
    logger.error('AI agent failed to parse Claude response', {
      error: err.message,
      response: aiResponse.substring(0, 500),
    });
    actionPlan = {
      status: 'error',
      summary: 'Failed to parse AI response',
      actions: [],
    };
  }

  const status = actionPlan.status || 'unknown';
  const summary = actionPlan.summary || 'No summary provided';
  const actions = Array.isArray(actionPlan.actions) ? actionPlan.actions : [];

  // 7. Execute actions
  const executedActions = [];

  for (const action of actions) {
    if (action.type === 'pause_campaign' && action.campaignId) {
      if (autoPauseEnabled) {
        try {
          await db.query(
            `UPDATE campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1 AND status = 'active'`,
            [action.campaignId]
          );

          await logAction({
            actorName: 'AI Agent',
            actionType: 'campaign.auto_paused',
            targetType: 'campaign',
            targetId: action.campaignId,
            description: `AI Agent auto-paused campaign: ${action.reason || 'threshold exceeded'}`,
            metadata: { reason: action.reason, metrics },
          });

          executedActions.push({
            ...action,
            executed: true,
          });

          logger.warn('AI agent auto-paused campaign', {
            campaignId: action.campaignId,
            reason: action.reason,
          });
        } catch (err) {
          logger.error('AI agent failed to pause campaign', {
            campaignId: action.campaignId,
            error: err.message,
          });
          executedActions.push({
            ...action,
            executed: false,
            error: err.message,
          });
        }
      } else {
        // Auto-pause not enabled; record as recommendation only
        executedActions.push({
          ...action,
          executed: false,
          note: 'Auto-pause is disabled. This is a recommendation only.',
        });
      }
    } else if (action.type === 'alert') {
      executedActions.push({
        ...action,
        executed: true,
      });
    } else {
      executedActions.push({
        ...action,
        executed: false,
        note: 'No action needed.',
      });
    }
  }

  // 8. Create admin notifications for issues
  if (status === 'issues_found' || status === 'action_taken') {
    await createNotification({
      userId: null, // all admins
      type: 'ai_agent_alert',
      title: `AI Agent: ${status === 'action_taken' ? 'Action Taken' : 'Issues Found'}`,
      message: summary,
      metadata: { actions: executedActions },
    });
  }

  // 9. Save log entry
  const logResult = await db.query(
    `INSERT INTO ai_agent_logs (status, summary, metrics_snapshot, actions_taken, token_usage)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      status,
      summary,
      JSON.stringify(metrics),
      JSON.stringify(executedActions),
      JSON.stringify(tokenUsage),
    ]
  );

  const logEntry = logResult.rows[0];

  logger.info('AI agent check completed', {
    logId: logEntry.id,
    status,
    actionsCount: executedActions.length,
    inputTokens: tokenUsage.input_tokens,
    outputTokens: tokenUsage.output_tokens,
  });

  return logEntry;
}

// ─── Log Retrieval ────────────────────────────────────────────────────────────

/**
 * Retrieves the most recent ai_agent_logs entries.
 *
 * @param {number} [limit=20] - Maximum number of entries to return.
 * @returns {Promise<Object[]>} Array of log entries, newest first.
 */
async function getAgentLogs(limit = 20) {
  const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 200));

  const result = await db.query(
    `SELECT id, status, summary, metrics_snapshot, actions_taken, token_usage, created_at
     FROM ai_agent_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit]
  );

  return result.rows;
}

module.exports = { runAgentCheck, getAgentLogs };
