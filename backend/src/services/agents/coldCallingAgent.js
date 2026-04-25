const db = require('../../config/database');
const logger = require('../../utils/logger');
const { generateCompletion, detectProvider } = require('../aiProvider');
const registry = require('./agentRegistry');

// ─── Cold Calling Specialist ────────────────────────────────────────────────
// Gathers phone call metrics and produces a specialist report.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gathers comprehensive phone call metrics for the Cold Calling Specialist.
 * Includes disposition breakdown, bucket distribution, compliance data, and transcripts.
 */
async function gatherCallMetrics() {
  // Total calls in last 24h with full status breakdown
  let calls = [];
  try {
    const callsResult = await db.query(
      `SELECT id, lead_id, status, duration_seconds, created_at, ended_reason, retry_count
       FROM phone_calls
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 200`
    );
    calls = callsResult.rows;
  } catch {
    // phone_calls table may not exist yet
    return { available: false, reason: 'phone_calls table not found' };
  }

  const totalCalls = calls.length;
  const completed = calls.filter(c => c.status === 'completed').length;
  const failed = calls.filter(c => c.status === 'failed').length;
  const noAnswer = calls.filter(c => c.status === 'no-answer').length;
  const busy = calls.filter(c => c.status === 'busy').length;
  const cancelled = calls.filter(c => c.status === 'cancelled').length;
  const inProgress = calls.filter(c => c.status === 'in-progress').length;
  const queued = calls.filter(c => c.status === 'queued').length;

  // Disposition breakdown (ended_reason analysis)
  const dispositions = {};
  calls.forEach(c => {
    const reason = c.ended_reason || 'unknown';
    dispositions[reason] = (dispositions[reason] || 0) + 1;
  });

  const durations = calls
    .filter(c => c.duration_seconds && c.duration_seconds > 0)
    .map(c => c.duration_seconds);
  const avgDuration = durations.length > 0
    ? parseFloat((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1))
    : 0;
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
  const minDuration = durations.length > 0 ? Math.min(...durations) : 0;

  // Calls with retries (shows persistence patterns)
  const retriedCalls = calls.filter(c => c.retry_count > 0).length;

  // Bucket distribution — lead status breakdown for leads that have been called
  let bucketDistribution = {};
  try {
    const bucketResult = await db.query(
      `SELECT l.status, COUNT(*) AS cnt
       FROM leads l
       WHERE l.id IN (SELECT DISTINCT lead_id FROM phone_calls)
       GROUP BY l.status`
    );
    bucketResult.rows.forEach(r => {
      bucketDistribution[r.status] = parseInt(r.cnt, 10) || 0;
    });
  } catch {
    // ignore
  }

  // Leads needing follow-up: called but no answer or busy, not yet retried to max
  let leadsNeedingFollowUp = 0;
  try {
    const followUpResult = await db.query(
      `SELECT COUNT(DISTINCT pc.lead_id) AS cnt
       FROM phone_calls pc
       WHERE pc.status IN ('no-answer', 'busy')
         AND pc.created_at >= NOW() - INTERVAL '48 hours'
         AND pc.retry_count < 2
         AND NOT EXISTS (
           SELECT 1 FROM phone_calls pc2
           WHERE pc2.lead_id = pc.lead_id AND pc2.status = 'completed'
         )`
    );
    leadsNeedingFollowUp = parseInt(followUpResult.rows[0].cnt, 10) || 0;
  } catch {
    // ignore
  }

  // Calling hours compliance: check if any calls were placed outside business hours
  let outsideHoursCalls = 0;
  try {
    const hoursResult = await db.query(
      `SELECT COUNT(*) AS cnt FROM phone_calls
       WHERE created_at >= NOW() - INTERVAL '24 hours'
         AND (EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/New_York') < 8
           OR EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/New_York') >= 21)`
    );
    outsideHoursCalls = parseInt(hoursResult.rows[0].cnt, 10) || 0;
  } catch {
    // ignore
  }

  // Today's call volume by hour (for pacing analysis)
  let hourlyVolume = [];
  try {
    const hourlyResult = await db.query(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/New_York') AS hr,
              COUNT(*) AS cnt
       FROM phone_calls
       WHERE created_at >= CURRENT_DATE
       GROUP BY hr ORDER BY hr`
    );
    hourlyVolume = hourlyResult.rows.map(r => ({
      hour: parseInt(r.hr, 10),
      calls: parseInt(r.cnt, 10),
    }));
  } catch {
    // ignore
  }

  // Recent transcripts (last 5 completed calls) with summary
  let recentTranscripts = [];
  try {
    const transcriptResult = await db.query(
      `SELECT pc.id, pc.lead_id, pc.transcript, pc.summary, pc.duration_seconds,
              l.full_name, l.industry, l.lead_type, l.phone
       FROM phone_calls pc
       LEFT JOIN leads l ON pc.lead_id = l.id
       WHERE pc.status = 'completed'
         AND pc.transcript IS NOT NULL
         AND pc.created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY pc.created_at DESC
       LIMIT 5`
    );
    recentTranscripts = transcriptResult.rows.map(r => ({
      callId: r.id,
      leadName: r.full_name || 'Unknown',
      industry: r.industry || 'Unknown',
      leadType: r.lead_type || 'Unknown',
      durationSeconds: r.duration_seconds,
      summary: r.summary || null,
      transcriptPreview: r.transcript ? r.transcript.substring(0, 800) : '',
    }));
  } catch {
    // ignore
  }

  // Abandoned call rate (calls < 2 seconds or ended immediately)
  const abandonedCalls = calls.filter(c =>
    c.status === 'completed' && c.duration_seconds !== null && c.duration_seconds < 2
  ).length;

  return {
    available: true,
    totalCalls,
    completed,
    failed,
    noAnswer,
    busy,
    cancelled,
    inProgress,
    queued,
    dispositions,
    successRate: totalCalls > 0 ? parseFloat(((completed / totalCalls) * 100).toFixed(1)) : 0,
    connectRate: totalCalls > 0 ? parseFloat((((completed + failed) / totalCalls) * 100).toFixed(1)) : 0,
    avgDurationSeconds: avgDuration,
    maxDurationSeconds: maxDuration,
    minDurationSeconds: minDuration,
    retriedCalls,
    abandonedCalls,
    abandonedRate: completed > 0 ? parseFloat(((abandonedCalls / completed) * 100).toFixed(1)) : 0,
    bucketDistribution,
    leadsNeedingFollowUp,
    compliance: {
      outsideHoursCalls,
      callingHoursViolation: outsideHoursCalls > 0,
    },
    hourlyVolume,
    recentTranscripts,
  };
}

/**
 * Runs the cold calling specialist check.
 * @param {Object} agent - The agent row from the database.
 * @returns {Promise<Object>} The saved log entry.
 */
async function runCheck(agent) {
  logger.info('Cold Calling Specialist check starting', { agentId: agent.id });

  const metrics = await gatherCallMetrics();

  const userPrompt = [
    'Here are the current phone call metrics (last 24 hours):',
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
    logger.error('Cold Calling agent AI call failed', { error: err.message });
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

  logger.info('Cold Calling Specialist check completed', { agentId: agent.id, status: report.status });
  return logEntry;
}

module.exports = { runCheck, gatherCallMetrics };
