const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireRole, requirePermission } = require('../middleware/rbac');
const { logAction } = require('../services/audit');
const { runAgentCheck, getAgentLogs, registry } = require('../services/agents');
const { getSetting } = require('../utils/settings');

const router = express.Router();

// All AI agent routes require authentication + org scope + admin
router.use(authenticate);
router.use(tenantScope);
router.use(requireOrg);
router.use(requirePermission('*'));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAgent(a) {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    specialty: a.specialty,
    description: a.description,
    systemPrompt: a.system_prompt,
    model: a.model,
    isBuiltin: a.is_builtin,
    isEnabled: a.is_enabled,
    checkIntervalMinutes: a.check_interval_minutes,
    parentAgentId: a.parent_agent_id,
    parentSlug: a.parent_slug || null,
    parentName: a.parent_name || null,
    config: a.config || {},
    lastCheckAt: a.last_check_at,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

function formatLog(log) {
  return {
    id: log.id,
    agentId: log.agent_id,
    agentSlug: log.agent_slug || null,
    agentName: log.agent_name || null,
    status: log.status,
    summary: log.summary,
    metricsSnapshot: log.metrics_snapshot,
    actionsTaken: log.actions_taken,
    tokenUsage: log.token_usage,
    createdAt: log.created_at,
  };
}

// ---------------------------------------------------------------------------
// GET /status - Return global agent system status + CEO agent status
// ---------------------------------------------------------------------------
router.get('/status', async (req, res) => {
  try {
    const enabled = (await getSetting('ai_agent_enabled', 'false')) === 'true';
    const interval = parseInt(await getSetting('ai_agent_interval_minutes', '60'), 10) || 60;
    const autoPause = (await getSetting('ai_agent_auto_pause', 'false')) === 'true';
    const bounceThreshold = parseFloat(await getSetting('ai_agent_bounce_threshold', '5')) || 5;
    const spamThreshold = parseFloat(await getSetting('ai_agent_spam_threshold', '0.1')) || 0.1;
    const queueBacklogLimit = parseInt(await getSetting('ai_agent_queue_backlog_limit', '1000'), 10) || 1000;
    const aiModel = await getSetting('ai_agent_model', 'claude-haiku-4-5');

    // Get last check from most recent log
    const lastCheckResult = await db.query(
      `SELECT created_at, status, summary
       FROM ai_agent_logs
       ORDER BY created_at DESC
       LIMIT 1`
    );

    let lastCheck = null;
    let lastStatus = null;
    let lastSummary = null;
    let nextScheduledCheck = null;

    if (lastCheckResult.rows.length > 0) {
      const row = lastCheckResult.rows[0];
      lastCheck = row.created_at;
      lastStatus = row.status;
      lastSummary = row.summary;

      if (enabled) {
        const lastCheckTime = new Date(row.created_at);
        nextScheduledCheck = new Date(lastCheckTime.getTime() + interval * 60 * 1000);
        if (nextScheduledCheck < new Date()) {
          nextScheduledCheck = new Date();
        }
      }
    }

    return res.json({
      success: true,
      data: {
        enabled,
        intervalMinutes: interval,
        autoPauseEnabled: autoPause,
        bounceThreshold,
        spamThreshold,
        queueBacklogLimit,
        aiModel,
        lastCheck,
        lastStatus,
        lastSummary,
        nextScheduledCheck,
      },
    });
  } catch (err) {
    logger.error('Failed to fetch AI agent status', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch agent status.' });
  }
});

// ---------------------------------------------------------------------------
// GET /agents - List all agents
// ---------------------------------------------------------------------------
router.get('/agents', async (req, res) => {
  try {
    const agents = await registry.getAllAgents();

    // Attach latest log for each agent
    const agentsWithStatus = [];
    for (const agent of agents) {
      const logs = await registry.getAgentLogs(agent.id, 1);
      const lastLog = logs[0] || null;
      agentsWithStatus.push({
        ...formatAgent(agent),
        lastLog: lastLog ? {
          status: lastLog.status,
          summary: lastLog.summary,
          createdAt: lastLog.created_at,
        } : null,
      });
    }

    return res.json({ success: true, data: { agents: agentsWithStatus } });
  } catch (err) {
    logger.error('Failed to fetch agents', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch agents.' });
  }
});

// ---------------------------------------------------------------------------
// GET /agents/:slug - Get a single agent by slug
// ---------------------------------------------------------------------------
router.get('/agents/:slug', async (req, res) => {
  try {
    const agent = await registry.getAgentBySlug(req.params.slug);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found.' });
    }

    const logs = await registry.getAgentLogs(agent.id, 10);

    return res.json({
      success: true,
      data: {
        agent: formatAgent(agent),
        logs: logs.map(formatLog),
      },
    });
  } catch (err) {
    logger.error('Failed to fetch agent', { error: err.message, slug: req.params.slug });
    return res.status(500).json({ success: false, message: 'Failed to fetch agent.' });
  }
});

// ---------------------------------------------------------------------------
// POST /agents - Create a new custom agent
// ---------------------------------------------------------------------------
router.post('/agents', async (req, res) => {
  try {
    const { slug, name, specialty, description, systemPrompt, model, isEnabled, checkIntervalMinutes, parentAgentId, config } = req.body;

    if (!slug || !name) {
      return res.status(400).json({ success: false, message: 'slug and name are required.' });
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ success: false, message: 'Slug must be lowercase alphanumeric with hyphens only.' });
    }

    // Check uniqueness
    const existing = await registry.getAgentBySlug(slug);
    if (existing) {
      return res.status(409).json({ success: false, message: `Agent with slug "${slug}" already exists.` });
    }

    const agent = await registry.createAgent({
      slug,
      name,
      specialty,
      description,
      system_prompt: systemPrompt || '',
      model: model || 'claude-haiku-4-5',
      is_enabled: isEnabled !== false,
      check_interval_minutes: checkIntervalMinutes || 120,
      parent_agent_id: parentAgentId || null,
      config: config || {},
    });

    await logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'ai_agent.created',
      targetType: 'ai_agent',
      targetId: agent.id,
      description: `Created AI agent "${name}" (${slug})`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(201).json({ success: true, data: { agent: formatAgent(agent) } });
  } catch (err) {
    logger.error('Failed to create agent', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to create agent.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /agents/:slug - Update an agent
// ---------------------------------------------------------------------------
router.put('/agents/:slug', async (req, res) => {
  try {
    const agent = await registry.getAgentBySlug(req.params.slug);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found.' });
    }

    const { name, specialty, description, systemPrompt, model, isEnabled, checkIntervalMinutes, parentAgentId, config } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (specialty !== undefined) updates.specialty = specialty;
    if (description !== undefined) updates.description = description;
    if (systemPrompt !== undefined) updates.system_prompt = systemPrompt;
    if (model !== undefined) updates.model = model;
    if (isEnabled !== undefined) updates.is_enabled = isEnabled;
    if (checkIntervalMinutes !== undefined) updates.check_interval_minutes = checkIntervalMinutes;
    if (parentAgentId !== undefined) updates.parent_agent_id = parentAgentId;
    if (config !== undefined) updates.config = config;

    const updated = await registry.updateAgent(agent.id, updates);

    await logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'ai_agent.updated',
      targetType: 'ai_agent',
      targetId: agent.id,
      description: `Updated AI agent "${agent.name}" (${agent.slug})`,
      metadata: { updatedFields: Object.keys(updates) },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ success: true, data: { agent: formatAgent(updated) } });
  } catch (err) {
    logger.error('Failed to update agent', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to update agent.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /agents/:slug - Delete a custom agent (builtin agents cannot be deleted)
// ---------------------------------------------------------------------------
router.delete('/agents/:slug', async (req, res) => {
  try {
    const agent = await registry.getAgentBySlug(req.params.slug);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found.' });
    }
    if (agent.is_builtin) {
      return res.status(403).json({ success: false, message: 'Built-in agents cannot be deleted. You can disable them instead.' });
    }

    const deleted = await registry.deleteAgent(agent.id);
    if (!deleted) {
      return res.status(500).json({ success: false, message: 'Failed to delete agent.' });
    }

    await logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'ai_agent.deleted',
      targetType: 'ai_agent',
      targetId: agent.id,
      description: `Deleted AI agent "${agent.name}" (${agent.slug})`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ success: true, data: { message: `Agent "${agent.name}" deleted.` } });
  } catch (err) {
    logger.error('Failed to delete agent', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to delete agent.' });
  }
});

// ---------------------------------------------------------------------------
// GET /logs - Return recent agent logs (all agents or filtered)
// ---------------------------------------------------------------------------
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const agentId = req.query.agentId || null;
    const logs = await getAgentLogs(agentId, limit);

    return res.json({
      success: true,
      data: {
        logs: logs.map(formatLog),
      },
    });
  } catch (err) {
    logger.error('Failed to fetch AI agent logs', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch agent logs.' });
  }
});

// ---------------------------------------------------------------------------
// POST /trigger - Manually trigger an agent check (all or specific)
// ---------------------------------------------------------------------------
router.post('/trigger', async (req, res) => {
  try {
    const { slug } = req.body || {};
    logger.info('Manual AI agent check triggered', { userId: req.user.id, slug });

    await logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'ai_agent.manual_trigger',
      targetType: 'ai_agent',
      description: `Manually triggered AI agent check${slug ? ` for ${slug}` : ' (all)'}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const logEntry = await runAgentCheck(slug || undefined);

    if (!logEntry) {
      return res.json({
        success: true,
        data: {
          message: 'AI agent system is currently disabled. Enable it in settings to run checks.',
          executed: false,
        },
      });
    }

    return res.json({
      success: true,
      data: {
        message: 'Agent check completed successfully.',
        executed: true,
        log: formatLog(logEntry),
      },
    });
  } catch (err) {
    logger.error('Failed to trigger AI agent check', { error: err.message, userId: req.user.id });
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to run agent check.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /settings - Update global agent settings
// ---------------------------------------------------------------------------
router.put('/settings', async (req, res) => {
  try {
    const { enabled, intervalMinutes, bounceThreshold, spamThreshold, queueBacklogLimit, autoPause, aiModel } = req.body;

    const updates = [];
    const changedSettings = {};

    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, message: '"enabled" must be a boolean.' });
      }
      updates.push({ key: 'ai_agent_enabled', value: String(enabled) });
      changedSettings.enabled = enabled;
    }

    if (intervalMinutes !== undefined) {
      const interval = parseInt(intervalMinutes, 10);
      if (isNaN(interval) || interval < 5 || interval > 1440) {
        return res.status(400).json({ success: false, message: '"intervalMinutes" must be between 5 and 1440.' });
      }
      updates.push({ key: 'ai_agent_interval_minutes', value: String(interval) });
      changedSettings.intervalMinutes = interval;
    }

    if (bounceThreshold !== undefined) {
      const t = parseFloat(bounceThreshold);
      if (isNaN(t) || t < 0 || t > 100) {
        return res.status(400).json({ success: false, message: '"bounceThreshold" must be between 0 and 100.' });
      }
      updates.push({ key: 'ai_agent_bounce_threshold', value: String(t) });
      changedSettings.bounceThreshold = t;
    }

    if (spamThreshold !== undefined) {
      const t = parseFloat(spamThreshold);
      if (isNaN(t) || t < 0 || t > 100) {
        return res.status(400).json({ success: false, message: '"spamThreshold" must be between 0 and 100.' });
      }
      updates.push({ key: 'ai_agent_spam_threshold', value: String(t) });
      changedSettings.spamThreshold = t;
    }

    if (queueBacklogLimit !== undefined) {
      const l = parseInt(queueBacklogLimit, 10);
      if (isNaN(l) || l < 0) {
        return res.status(400).json({ success: false, message: '"queueBacklogLimit" must be a non-negative integer.' });
      }
      updates.push({ key: 'ai_agent_queue_backlog_limit', value: String(l) });
      changedSettings.queueBacklogLimit = l;
    }

    if (autoPause !== undefined) {
      if (typeof autoPause !== 'boolean') {
        return res.status(400).json({ success: false, message: '"autoPause" must be a boolean.' });
      }
      updates.push({ key: 'ai_agent_auto_pause', value: String(autoPause) });
      changedSettings.autoPause = autoPause;
    }

    if (aiModel !== undefined) {
      if (typeof aiModel !== 'string' || aiModel.trim().length === 0) {
        return res.status(400).json({ success: false, message: '"aiModel" must be a non-empty string.' });
      }
      updates.push({ key: 'ai_agent_model', value: aiModel.trim() });
      changedSettings.aiModel = aiModel.trim();
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid settings provided.' });
    }

    for (const { key, value } of updates) {
      await db.query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      );
    }

    await logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'ai_agent.settings_updated',
      targetType: 'ai_agent',
      description: `Updated AI agent settings: ${Object.keys(changedSettings).join(', ')}`,
      metadata: changedSettings,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ success: true, data: { message: 'Agent settings updated.', updatedSettings: changedSettings } });
  } catch (err) {
    logger.error('Failed to update AI agent settings', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to update agent settings.' });
  }
});

module.exports = router;
