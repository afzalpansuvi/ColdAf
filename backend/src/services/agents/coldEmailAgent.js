const db = require('../../config/database');
const logger = require('../../utils/logger');
const { generateCompletion, detectProvider } = require('../aiProvider');
const registry = require('./agentRegistry');

// ─── Cold Email Specialist ──────────────────────────────────────────────────
// Gathers email-specific metrics and produces a specialist report.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gathers comprehensive email campaign metrics for CARO v1.0 analysis.
 */
async function gatherEmailMetrics() {
  // Active campaigns with auto-pause thresholds
  const campaignsResult = await db.query(
    `SELECT id, name, status, auto_pause_bounce_rate, auto_pause_spam_rate,
            total_sent, total_opened, total_clicked, total_replied, total_bounced
     FROM campaigns WHERE status = 'active'`
  );
  const activeCampaigns = campaignsResult.rows;

  // Per-campaign email metrics (last 24h) with open/click/reply/bounce breakdown
  const campaignMetrics = [];
  for (const campaign of activeCampaigns) {
    const metricsResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked','replied')) AS sent,
         COUNT(*) FILTER (WHERE status = 'bounced')  AS bounced,
         COUNT(*) FILTER (WHERE status = 'failed')   AS failed,
         COUNT(*) FILTER (WHERE status = 'replied')  AS replied,
         COUNT(*) FILTER (WHERE status = 'opened')   AS opened,
         COUNT(*) FILTER (WHERE status = 'clicked')  AS clicked,
         COUNT(*) FILTER (WHERE status = 'delivered') AS delivered
       FROM emails_sent
       WHERE campaign_id = $1
         AND created_at >= NOW() - INTERVAL '24 hours'`,
      [campaign.id]
    );
    const m = metricsResult.rows[0];
    const sent = parseInt(m.sent, 10) || 0;
    const bounced = parseInt(m.bounced, 10) || 0;
    const replied = parseInt(m.replied, 10) || 0;
    const opened = parseInt(m.opened, 10) || 0;
    const clicked = parseInt(m.clicked, 10) || 0;
    const delivered = parseInt(m.delivered, 10) || 0;

    // Spam complaints for this campaign (last 24h)
    const spamResult = await db.query(
      `SELECT COUNT(*) AS cnt FROM email_events ee
       JOIN emails_sent es ON ee.email_id = es.id
       WHERE es.campaign_id = $1
         AND ee.event_type = 'spam_complaint'
         AND ee.created_at >= NOW() - INTERVAL '24 hours'`,
      [campaign.id]
    );
    const spamComplaints = parseInt(spamResult.rows[0].cnt, 10) || 0;

    // Unsubscribes for this campaign (last 24h)
    const unsubResult = await db.query(
      `SELECT COUNT(*) AS cnt FROM email_events ee
       JOIN emails_sent es ON ee.email_id = es.id
       WHERE es.campaign_id = $1
         AND ee.event_type = 'unsubscribe'
         AND ee.created_at >= NOW() - INTERVAL '24 hours'`,
      [campaign.id]
    );
    const unsubscribes = parseInt(unsubResult.rows[0].cnt, 10) || 0;

    campaignMetrics.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      sent,
      delivered,
      bounced,
      opened,
      clicked,
      replied,
      spamComplaints,
      unsubscribes,
      bounceRate: sent > 0 ? parseFloat(((bounced / sent) * 100).toFixed(2)) : 0,
      openRate: sent > 0 ? parseFloat(((opened / sent) * 100).toFixed(2)) : 0,
      clickRate: sent > 0 ? parseFloat(((clicked / sent) * 100).toFixed(2)) : 0,
      replyRate: sent > 0 ? parseFloat(((replied / sent) * 100).toFixed(2)) : 0,
      spamRate: sent > 0 ? parseFloat(((spamComplaints / sent) * 100).toFixed(4)) : 0,
      unsubRate: sent > 0 ? parseFloat(((unsubscribes / sent) * 100).toFixed(2)) : 0,
      // Lifetime totals from campaign record
      lifetimeSent: campaign.total_sent,
      lifetimeOpened: campaign.total_opened,
      lifetimeReplied: campaign.total_replied,
      lifetimeBounced: campaign.total_bounced,
      autoPauseBounceThreshold: parseFloat(campaign.auto_pause_bounce_rate) || 8.0,
      autoPauseSpamThreshold: parseFloat(campaign.auto_pause_spam_rate) || 0.2,
    });
  }

  // SMTP account health with warmup and blacklist info
  const smtpResult = await db.query(
    `SELECT sa.id, sa.email_address AS email, sa.provider, sa.health_status,
            sa.daily_send_limit, sa.sends_today, sa.last_health_check_at,
            sa.last_health_check_result,
            ws.status AS warmup_status, ws.current_day AS warmup_day,
            ws.current_daily_limit AS warmup_current_limit,
            ws.warmup_duration_days
     FROM smtp_accounts sa
     LEFT JOIN smtp_warmup_schedules ws ON ws.smtp_account_id = sa.id AND ws.status = 'active'
     WHERE sa.is_active = TRUE`
  );
  const smtpHealth = smtpResult.rows.map((s) => ({
    id: s.id,
    email: s.email,
    provider: s.provider,
    healthStatus: s.health_status,
    dailySendLimit: s.daily_send_limit,
    sendsToday: s.sends_today,
    lastHealthCheck: s.last_health_check_at,
    lastHealthResult: s.last_health_check_result,
    warmup: s.warmup_status ? {
      status: s.warmup_status,
      day: s.warmup_day,
      currentLimit: s.warmup_current_limit,
      totalDays: s.warmup_duration_days,
    } : null,
  }));

  // Blacklist status (latest checks)
  let blacklistAlerts = [];
  try {
    const blResult = await db.query(
      `SELECT bc.smtp_account_id, sa.email_address, bc.check_type, bc.checked_value,
              bc.blacklist_name, bc.is_listed, bc.checked_at
       FROM blacklist_checks bc
       JOIN smtp_accounts sa ON bc.smtp_account_id = sa.id
       WHERE bc.is_listed = TRUE
         AND bc.checked_at >= NOW() - INTERVAL '7 days'
       ORDER BY bc.checked_at DESC LIMIT 20`
    );
    blacklistAlerts = blResult.rows.map(r => ({
      smtpAccountId: r.smtp_account_id,
      email: r.email_address,
      checkType: r.check_type,
      checkedValue: r.checked_value,
      blacklistName: r.blacklist_name,
      checkedAt: r.checked_at,
    }));
  } catch {
    // blacklist_checks table may not exist
  }

  // Queue backlog
  const queueResult = await db.query(
    `SELECT COUNT(*) AS cnt FROM emails_sent WHERE status = 'queued'`
  );
  const queueBacklog = parseInt(queueResult.rows[0].cnt, 10) || 0;

  // Failed jobs in last 24h
  const failedResult = await db.query(
    `SELECT COUNT(*) AS cnt FROM emails_sent WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'`
  );
  const failedJobs24h = parseInt(failedResult.rows[0].cnt, 10) || 0;

  // Today totals
  const todayResult = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked','replied')) AS total_sent,
       COUNT(*) FILTER (WHERE status = 'bounced') AS total_bounced,
       COUNT(*) FILTER (WHERE status = 'opened')  AS total_opened,
       COUNT(*) FILTER (WHERE status = 'replied') AS total_replied
     FROM emails_sent WHERE created_at >= CURRENT_DATE`
  );
  const totalSentToday = parseInt(todayResult.rows[0].total_sent, 10) || 0;
  const totalBouncedToday = parseInt(todayResult.rows[0].total_bounced, 10) || 0;
  const totalOpenedToday = parseInt(todayResult.rows[0].total_opened, 10) || 0;
  const totalRepliedToday = parseInt(todayResult.rows[0].total_replied, 10) || 0;

  // Global spam complaints (last 24h)
  const globalSpamResult = await db.query(
    `SELECT COUNT(*) AS cnt FROM email_events
     WHERE event_type = 'spam_complaint' AND created_at >= NOW() - INTERVAL '24 hours'`
  );
  const spamComplaints24h = parseInt(globalSpamResult.rows[0].cnt, 10) || 0;

  // Unsubscribes (last 24h)
  const globalUnsubResult = await db.query(
    `SELECT COUNT(*) AS cnt FROM email_events
     WHERE event_type = 'unsubscribe' AND created_at >= NOW() - INTERVAL '24 hours'`
  );
  const unsubscribes24h = parseInt(globalUnsubResult.rows[0].cnt, 10) || 0;

  // Lead list hygiene: unverified and bounced leads
  let listHygiene = {};
  try {
    const hygieneResult = await db.query(
      `SELECT
         COUNT(*) AS total_leads,
         COUNT(*) FILTER (WHERE email_verification_status = 'unverified') AS unverified,
         COUNT(*) FILTER (WHERE email_verification_status = 'invalid') AS invalid,
         COUNT(*) FILTER (WHERE unsubscribed = TRUE) AS unsubscribed,
         COUNT(*) FILTER (WHERE status = 'bounced') AS bounced
       FROM leads`
    );
    const h = hygieneResult.rows[0];
    listHygiene = {
      totalLeads: parseInt(h.total_leads, 10) || 0,
      unverified: parseInt(h.unverified, 10) || 0,
      invalid: parseInt(h.invalid, 10) || 0,
      unsubscribed: parseInt(h.unsubscribed, 10) || 0,
      bounced: parseInt(h.bounced, 10) || 0,
    };
  } catch {
    // columns may not exist yet
  }

  // Active A/B tests
  let activeABTests = [];
  try {
    const abResult = await db.query(
      `SELECT at.id, at.name, at.test_type, at.status, c.name AS campaign_name,
              json_agg(json_build_object(
                'id', av.id, 'name', av.name, 'sent', av.total_sent,
                'opened', av.total_opened, 'replied', av.total_replied, 'bounced', av.total_bounced
              )) AS variants
       FROM ab_tests at
       JOIN campaigns c ON at.campaign_id = c.id
       JOIN ab_variants av ON av.ab_test_id = at.id
       WHERE at.status = 'active'
       GROUP BY at.id, at.name, at.test_type, at.status, c.name
       LIMIT 10`
    );
    activeABTests = abResult.rows;
  } catch {
    // ab tables may not exist
  }

  return {
    activeCampaigns: activeCampaigns.map(c => ({ id: c.id, name: c.name })),
    campaignMetrics,
    smtpHealth,
    blacklistAlerts,
    queueBacklog,
    failedJobs24h,
    totalSentToday,
    totalBouncedToday,
    totalOpenedToday,
    totalRepliedToday,
    spamComplaints24h,
    unsubscribes24h,
    listHygiene,
    activeABTests,
  };
}

/**
 * Runs the cold email specialist check.
 * @param {Object} agent - The agent row from the database.
 * @returns {Promise<Object>} The saved log entry.
 */
async function runCheck(agent) {
  logger.info('Cold Email Specialist check starting', { agentId: agent.id });

  const metrics = await gatherEmailMetrics();

  const userPrompt = [
    'Here are the current email campaign metrics (last 24 hours):',
    '',
    JSON.stringify(metrics, null, 2),
    '',
    'Analyze these metrics and return your JSON report.',
  ].join('\n');

  let aiResponse;
  let tokenUsage = { input_tokens: 0, output_tokens: 0 };

  try {
    const result = await generateCompletion({
      model: agent.model,
      systemPrompt: agent.system_prompt,
      userPrompt,
      maxTokens: 2500,
    });
    aiResponse = result.text;
    tokenUsage = { input_tokens: result.inputTokens || 0, output_tokens: result.outputTokens || 0 };
  } catch (err) {
    logger.error('Cold Email agent AI call failed', { error: err.message });
    const logEntry = await registry.saveAgentLog({
      agentId: agent.id,
      status: 'error',
      summary: `AI call failed: ${err.message}`,
      metricsSnapshot: metrics,
      actionsTaken: [],
      tokenUsage,
      model: agent.model,
      provider: detectProvider(agent.model),
    });
    await registry.touchLastCheck(agent.id);
    return logEntry;
  }

  // Parse response
  let report;
  try {
    let cleaned = aiResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    report = JSON.parse(cleaned);
  } catch {
    report = { status: 'error', summary: 'Failed to parse AI response', findings: [], metrics: {} };
  }

  const logEntry = await registry.saveAgentLog({
    agentId: agent.id,
    status: report.status || 'unknown',
    summary: report.summary || 'No summary provided',
    metricsSnapshot: metrics,
    actionsTaken: report.findings || [],
    tokenUsage,
    model: agent.model,
    provider: detectProvider(agent.model),
  });

  await registry.touchLastCheck(agent.id);

  logger.info('Cold Email Specialist check completed', { agentId: agent.id, status: report.status });
  return logEntry;
}

module.exports = { runCheck, gatherEmailMetrics };
