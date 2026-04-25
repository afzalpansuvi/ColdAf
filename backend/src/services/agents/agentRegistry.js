const db = require('../../config/database');
const logger = require('../../utils/logger');

// ─── Agent Registry ──────────────────────────────────────────────────────────
// Loads agent definitions from the ai_agents table and provides lookup helpers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all agents from the database.
 * @param {Object} [opts]
 * @param {boolean} [opts.enabledOnly=false] - Only return enabled agents.
 * @returns {Promise<Object[]>}
 */
async function getAllAgents(enabledOnly = false) {
  const where = enabledOnly ? 'WHERE is_enabled = TRUE' : '';
  const result = await db.query(
    `SELECT a.*,
            p.slug AS parent_slug,
            p.name AS parent_name
     FROM ai_agents a
     LEFT JOIN ai_agents p ON a.parent_agent_id = p.id
     ${where}
     ORDER BY a.parent_agent_id NULLS FIRST, a.name`
  );
  return result.rows;
}

/**
 * Get a single agent by slug.
 * @param {string} slug
 * @returns {Promise<Object|null>}
 */
async function getAgentBySlug(slug) {
  const result = await db.query(
    `SELECT a.*,
            p.slug AS parent_slug,
            p.name AS parent_name
     FROM ai_agents a
     LEFT JOIN ai_agents p ON a.parent_agent_id = p.id
     WHERE a.slug = $1`,
    [slug]
  );
  return result.rows[0] || null;
}

/**
 * Get a single agent by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getAgentById(id) {
  const result = await db.query(
    `SELECT a.*,
            p.slug AS parent_slug,
            p.name AS parent_name
     FROM ai_agents a
     LEFT JOIN ai_agents p ON a.parent_agent_id = p.id
     WHERE a.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Get child agents for a given parent agent ID.
 * @param {string} parentId
 * @returns {Promise<Object[]>}
 */
async function getChildAgents(parentId) {
  const result = await db.query(
    `SELECT * FROM ai_agents WHERE parent_agent_id = $1 AND is_enabled = TRUE ORDER BY name`,
    [parentId]
  );
  return result.rows;
}

/**
 * Create a new custom agent.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function createAgent(data) {
  const {
    slug, name, specialty, description,
    system_prompt, model, is_enabled,
    check_interval_minutes, parent_agent_id, config,
  } = data;

  const result = await db.query(
    `INSERT INTO ai_agents (slug, name, specialty, description, system_prompt, model, is_builtin, is_enabled, check_interval_minutes, parent_agent_id, config)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8, $9, $10)
     RETURNING *`,
    [
      slug, name, specialty || null, description || null,
      system_prompt || '', model || 'claude-haiku-4-5',
      is_enabled !== false, check_interval_minutes || 120,
      parent_agent_id || null, JSON.stringify(config || {}),
    ]
  );
  return result.rows[0];
}

/**
 * Update an existing agent.
 * @param {string} id
 * @param {Object} data - Fields to update.
 * @returns {Promise<Object>}
 */
async function updateAgent(id, data) {
  const allowed = [
    'name', 'specialty', 'description', 'system_prompt',
    'model', 'is_enabled', 'check_interval_minutes',
    'parent_agent_id', 'config',
  ];

  const sets = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (data[key] !== undefined) {
      const dbVal = key === 'config' ? JSON.stringify(data[key]) : data[key];
      sets.push(`${key} = $${idx}`);
      values.push(dbVal);
      idx++;
    }
  }

  if (sets.length === 0) {
    return getAgentById(id);
  }

  sets.push(`updated_at = NOW()`);
  values.push(id);

  const result = await db.query(
    `UPDATE ai_agents SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete a custom agent (builtin agents cannot be deleted).
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteAgent(id) {
  const result = await db.query(
    `DELETE FROM ai_agents WHERE id = $1 AND is_builtin = FALSE RETURNING id`,
    [id]
  );
  return result.rowCount > 0;
}

/**
 * Update the last_check_at timestamp for an agent.
 * @param {string} id
 */
async function touchLastCheck(id) {
  await db.query(
    `UPDATE ai_agents SET last_check_at = NOW() WHERE id = $1`,
    [id]
  );
}

/**
 * Get logs for a specific agent.
 * @param {string} agentId
 * @param {number} [limit=20]
 * @returns {Promise<Object[]>}
 */
async function getAgentLogs(agentId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 200));
  const result = await db.query(
    `SELECT id, agent_id, status, summary, metrics_snapshot, actions_taken, token_usage, created_at
     FROM ai_agent_logs
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [agentId, safeLimit]
  );
  return result.rows;
}

/**
 * Save a log entry for an agent run.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function saveAgentLog(data) {
  const { agentId, status, summary, metricsSnapshot, actionsTaken, tokenUsage, model, provider } = data;
  const result = await db.query(
    `INSERT INTO ai_agent_logs (agent_id, status, summary, metrics_snapshot, actions_taken, token_usage, model, provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      agentId || null,
      status,
      summary,
      JSON.stringify(metricsSnapshot || {}),
      JSON.stringify(actionsTaken || []),
      JSON.stringify(tokenUsage || {}),
      model || null,
      provider || null,
    ]
  );
  return result.rows[0];
}

module.exports = {
  getAllAgents,
  getAgentBySlug,
  getAgentById,
  getChildAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  touchLastCheck,
  getAgentLogs,
  saveAgentLog,
};
