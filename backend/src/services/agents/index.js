const logger = require('../../utils/logger');
const { getSetting } = require('../../utils/settings');
const registry = require('./agentRegistry');
const ceoAgent = require('./ceoAgent');

// ─── Multi-Agent Orchestrator ───────────────────────────────────────────────
// Entry point for triggering agent checks. Replaces the old single-agent
// runAgentCheck() with a multi-agent system.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs a full agent check cycle.
 * - If a specific agent slug is given, runs just that agent.
 * - Otherwise runs the CEO agent (which orchestrates all children).
 *
 * @param {string} [slug] - Optional agent slug to run a single agent.
 * @returns {Promise<Object|null>} The log entry, or null if disabled.
 */
async function runAgentCheck(slug) {
  const enabled = await getSetting('ai_agent_enabled', 'false');
  if (enabled !== 'true') {
    logger.debug('AI agents are disabled, skipping check');
    return null;
  }

  if (slug) {
    // Run a specific agent
    const agent = await registry.getAgentBySlug(slug);
    if (!agent) {
      throw new Error(`Agent with slug "${slug}" not found`);
    }
    if (!agent.is_enabled) {
      throw new Error(`Agent "${slug}" is disabled`);
    }
    return runSingleAgent(agent);
  }

  // Default: run the CEO agent which orchestrates everything
  const ceo = await registry.getAgentBySlug('ceo');
  if (!ceo) {
    throw new Error('CEO agent not found. Run migration 005 to seed built-in agents.');
  }
  if (!ceo.is_enabled) {
    logger.debug('CEO agent is disabled, skipping');
    return null;
  }

  return ceoAgent.runCheck(ceo);
}

/**
 * Runs a single agent based on its specialty.
 */
async function runSingleAgent(agent) {
  // If this is the CEO, it orchestrates children
  if (agent.slug === 'ceo' || (!agent.parent_agent_id && agent.is_builtin)) {
    return ceoAgent.runCheck(agent);
  }
  // Otherwise it's a specialist
  return ceoAgent.runSpecialistCheck(agent);
}

/**
 * Gets agent logs. If agentId is provided, gets logs for that agent.
 * Otherwise gets all logs.
 */
async function getAgentLogs(agentId, limit = 20) {
  if (agentId) {
    return registry.getAgentLogs(agentId, limit);
  }
  // All logs (backwards compatible)
  const db = require('../../config/database');
  const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 200));
  const result = await db.query(
    `SELECT l.*, a.slug AS agent_slug, a.name AS agent_name
     FROM ai_agent_logs l
     LEFT JOIN ai_agents a ON l.agent_id = a.id
     ORDER BY l.created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}

module.exports = {
  runAgentCheck,
  getAgentLogs,
  registry,
};
