const db = require('../../config/database');
const logger = require('../../utils/logger');
const { generateCompletion, detectProvider } = require('../aiProvider');
const { createNotification } = require('../notifications');
const { logAction } = require('../audit');
const registry = require('./agentRegistry');
const coldEmailAgent = require('./coldEmailAgent');
const coldCallingAgent = require('./coldCallingAgent');
const { getSetting } = require('../../utils/settings');

// ─── CEO Agent ──────────────────────────────────────────────────────────────
// Orchestrates specialist agents, aggregates their reports, and takes
// high-level decisions (pause campaigns, delegate tasks, alert admin).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs all specialist (child) agents first, then runs the CEO agent
 * with their combined reports.
 *
 * @param {Object} ceoAgentRow - The CEO agent row from the database.
 * @returns {Promise<Object>} The CEO's log entry.
 */
async function runCheck(ceoAgentRow) {
  logger.info('CEO Agent orchestration starting', { agentId: ceoAgentRow.id });

  // 1. Gather specialist reports by running child agents
  const children = await registry.getChildAgents(ceoAgentRow.id);
  const specialistReports = [];

  for (const child of children) {
    try {
      const logEntry = await runSpecialistCheck(child);
      specialistReports.push({
        agentSlug: child.slug,
        agentName: child.name,
        status: logEntry.status,
        summary: logEntry.summary,
        findings: logEntry.actions_taken || [],
        metrics: logEntry.metrics_snapshot || {},
      });
    } catch (err) {
      logger.error('Specialist agent failed during CEO orchestration', {
        childSlug: child.slug,
        error: err.message,
      });
      specialistReports.push({
        agentSlug: child.slug,
        agentName: child.name,
        status: 'error',
        summary: `Agent failed: ${err.message}`,
        findings: [],
        metrics: {},
      });
    }
  }

  // 2. Load CEO thresholds from config
  const config = ceoAgentRow.config || {};
  const bounceThreshold = config.bounceThreshold || 5;
  const spamThreshold = config.spamThreshold || 0.1;
  const queueBacklogLimit = config.queueBacklogLimit || 1000;
  const autoPauseEnabled = (await getSetting('ai_agent_auto_pause', 'false')) === 'true';

  // 3. Build CEO prompt with specialist reports
  const userPrompt = [
    'Here are the reports from your specialist agents:',
    '',
    JSON.stringify(specialistReports, null, 2),
    '',
    `Auto-pause is ${autoPauseEnabled ? 'ENABLED' : 'DISABLED'}.`,
    `Thresholds: bounce=${bounceThreshold}%, spam=${spamThreshold}%, queue_backlog=${queueBacklogLimit}`,
    '',
    'Review these reports and return your executive JSON action plan.',
  ].join('\n');

  let aiResponse;
  let tokenUsage = { input_tokens: 0, output_tokens: 0 };

  try {
    const result = await generateCompletion({
      model: ceoAgentRow.model,
      systemPrompt: ceoAgentRow.system_prompt,
      userPrompt,
      maxTokens: 2500,
    });
    aiResponse = result.text;
    tokenUsage = { input_tokens: result.inputTokens || 0, output_tokens: result.outputTokens || 0 };
  } catch (err) {
    logger.error('CEO Agent AI call failed', { error: err.message });
    const logEntry = await registry.saveAgentLog({
      agentId: ceoAgentRow.id,
      status: 'error',
      summary: `AI call failed: ${err.message}`,
      metricsSnapshot: { specialistReports },
      actionsTaken: [],
      tokenUsage,
      model: ceoAgentRow.model,
      provider: detectProvider(ceoAgentRow.model),
    });
    await registry.touchLastCheck(ceoAgentRow.id);
    return logEntry;
  }

  // 4. Parse the CEO's response
  let actionPlan;
  try {
    let cleaned = aiResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    actionPlan = JSON.parse(cleaned);
  } catch {
    actionPlan = { status: 'error', summary: 'Failed to parse CEO AI response', actions: [] };
  }

  const status = actionPlan.status || 'unknown';
  const summary = actionPlan.summary || 'No summary provided';
  const actions = Array.isArray(actionPlan.actions) ? actionPlan.actions : [];

  // 5. Execute actions
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
            actorName: 'CEO Agent',
            actionType: 'campaign.auto_paused',
            targetType: 'campaign',
            targetId: action.campaignId,
            description: `CEO Agent auto-paused campaign: ${action.reason || 'threshold exceeded'}`,
            metadata: { reason: action.reason },
          });
          executedActions.push({ ...action, executed: true });
        } catch (err) {
          executedActions.push({ ...action, executed: false, error: err.message });
        }
      } else {
        executedActions.push({ ...action, executed: false, note: 'Auto-pause disabled — recommendation only.' });
      }
    } else if (action.type === 'alert') {
      executedActions.push({ ...action, executed: true });
    } else {
      executedActions.push({ ...action, executed: false, note: 'Acknowledged.' });
    }
  }

  // 6. Notify admins if issues found
  if (status === 'issues_found' || status === 'action_taken') {
    await createNotification({
      userId: null,
      type: 'ai_agent_alert',
      title: `CEO Agent: ${status === 'action_taken' ? 'Action Taken' : 'Issues Found'}`,
      message: summary,
      metadata: { actions: executedActions, specialistReports },
    });
  }

  // 7. Save log
  const logEntry = await registry.saveAgentLog({
    agentId: ceoAgentRow.id,
    status,
    summary,
    metricsSnapshot: { specialistReports },
    actionsTaken: executedActions,
    tokenUsage,
    model: ceoAgentRow.model,
    provider: detectProvider(ceoAgentRow.model),
  });

  await registry.touchLastCheck(ceoAgentRow.id);

  logger.info('CEO Agent orchestration completed', {
    agentId: ceoAgentRow.id,
    status,
    actionsCount: executedActions.length,
  });

  return logEntry;
}

/**
 * Dispatches a specialist agent check based on its specialty.
 */
async function runSpecialistCheck(agent) {
  const specialty = (agent.specialty || agent.slug || '').toLowerCase();

  if (specialty.includes('email')) {
    return coldEmailAgent.runCheck(agent);
  }
  if (specialty.includes('call')) {
    return coldCallingAgent.runCheck(agent);
  }

  // Generic specialist — use its own system prompt with basic metrics
  return runGenericSpecialist(agent);
}

/**
 * Runs a generic specialist that doesn't have a dedicated module.
 * Uses the agent's own system_prompt with a basic metrics dump.
 */
async function runGenericSpecialist(agent) {
  logger.info('Generic specialist check starting', { agentId: agent.id, slug: agent.slug });

  // Gather basic combined metrics
  let metrics = {};
  try {
    const emailMetrics = await coldEmailAgent.gatherEmailMetrics();
    metrics.email = emailMetrics;
  } catch { /* ignore */ }
  try {
    const callMetrics = await coldCallingAgent.gatherCallMetrics();
    metrics.calls = callMetrics;
  } catch { /* ignore */ }

  const userPrompt = [
    'Here are the current system metrics:',
    '',
    JSON.stringify(metrics, null, 2),
    '',
    'Analyze and return your JSON report.',
  ].join('\n');

  let aiResponse;
  let tokenUsage = { input_tokens: 0, output_tokens: 0 };

  try {
    const result = await generateCompletion({
      model: agent.model,
      systemPrompt: agent.system_prompt,
      userPrompt,
      maxTokens: 1000,
    });
    aiResponse = result.text;
    tokenUsage = { input_tokens: result.inputTokens || 0, output_tokens: result.outputTokens || 0 };
  } catch (err) {
    const logEntry = await registry.saveAgentLog({
      agentId: agent.id,
      status: 'error',
      summary: `AI call failed: ${err.message}`,
      metricsSnapshot: metrics,
      tokenUsage,
      model: agent.model,
      provider: detectProvider(agent.model),
    });
    await registry.touchLastCheck(agent.id);
    return logEntry;
  }

  let report;
  try {
    let cleaned = aiResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    report = JSON.parse(cleaned);
  } catch {
    report = { status: 'error', summary: 'Failed to parse response', findings: [] };
  }

  const logEntry = await registry.saveAgentLog({
    agentId: agent.id,
    status: report.status || 'unknown',
    summary: report.summary || 'No summary',
    metricsSnapshot: metrics,
    actionsTaken: report.findings || [],
    tokenUsage,
    model: agent.model,
    provider: detectProvider(agent.model),
  });

  await registry.touchLastCheck(agent.id);
  return logEntry;
}

module.exports = { runCheck, runSpecialistCheck };
