const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../config/database');
const env = require('../config/env');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireRole } = require('../middleware/rbac');
const { logAction } = require('../services/audit');
const { registry } = require('../services/agents');

const router = express.Router();

// All AI chat routes require authentication + org scope + admin role
router.use(authenticate);
router.use(tenantScope);
router.use(requireOrg);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts JSON action blocks embedded in the assistant's text response.
 * Looks for objects containing an "action" key anywhere in the text.
 *
 * @param {string} text - The assistant response text.
 * @returns {Object[]} Array of parsed action objects.
 */
function extractActions(text) {
  const actions = [];
  // Match JSON objects that contain an "action" key
  const jsonRegex = /\{[^{}]*"action"\s*:\s*"[^"]+?"[^{}]*\}/g;
  const matches = text.match(jsonRegex);

  if (!matches) return actions;

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match);
      if (parsed && parsed.action) {
        actions.push(parsed);
      }
    } catch (err) {
      // Not valid JSON; skip it
      logger.debug('Failed to parse potential action block', { raw: match });
    }
  }

  return actions;
}

/**
 * Fetches the current list of brands with their AI prompts for context.
 */
async function getBrandsContext(organizationId) {
  const result = await db.query(
    `SELECT id, name, primary_domain, ai_system_prompt, ai_model
     FROM brands
     WHERE is_active = TRUE AND organization_id = $1
     ORDER BY name`,
    [organizationId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// GET /history - Get chat history for the current user
// ---------------------------------------------------------------------------
router.get('/history', async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 50;
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    const offset = (page - 1) * limit;

    const countResult = await db.query(
      'SELECT COUNT(*) AS total FROM ai_chat_messages WHERE user_id = $1',
      [req.user.id]
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await db.query(
      `SELECT id, user_id, role, content, actions_taken, created_at
       FROM ai_chat_messages
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        messages: result.rows.map((m) => ({
          id: m.id,
          userId: m.user_id,
          role: m.role,
          content: m.content,
          actionsTaken: m.actions_taken,
          createdAt: m.created_at,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    logger.error('Failed to fetch AI chat history', {
      error: err.message,
      userId: req.user.id,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch chat history.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /message - Send a message to the AI chat assistant
// ---------------------------------------------------------------------------
router.post('/message', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message is required and must be a non-empty string.',
      });
    }

    const trimmedMessage = message.trim();

    if (trimmedMessage.length > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Message must be 10,000 characters or fewer.',
      });
    }

    // Save user message
    await db.query(
      `INSERT INTO ai_chat_messages (user_id, role, content)
       VALUES ($1, 'user', $2)`,
      [req.user.id, trimmedMessage]
    );

    // Build conversation context: last 20 messages for this user
    const historyResult = await db.query(
      `SELECT role, content FROM ai_chat_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id]
    );
    // Reverse so oldest first
    const conversationHistory = historyResult.rows.reverse();

    // Get brands context (org-scoped)
    const brands = await getBrandsContext(req.organizationId);
    const brandsContext = brands.map((b) => ({
      id: b.id,
      name: b.name,
      domain: b.primary_domain,
      aiPrompt: b.ai_system_prompt ? b.ai_system_prompt.substring(0, 500) + (b.ai_system_prompt.length > 500 ? '...' : '') : null,
      aiModel: b.ai_model,
    }));

    // Load CEO agent's system prompt (if available) and augment with action capabilities
    let ceoPromptPrefix = '';
    try {
      const ceoAgent = await registry.getAgentBySlug('ceo');
      if (ceoAgent && ceoAgent.system_prompt) {
        ceoPromptPrefix = ceoAgent.system_prompt + '\n\n';
      }
    } catch { /* use default */ }

    // Load specialist agents for context
    let specialistContext = '';
    try {
      const allAgents = await registry.getAllAgents();
      const specialists = allAgents.filter(a => a.parent_agent_id);
      if (specialists.length > 0) {
        specialistContext = '\n\nYou oversee these specialist agents:\n' +
          specialists.map(a => `- ${a.name} (${a.slug}): ${a.description || a.specialty || 'No description'}`).join('\n') +
          '\n\nWhen discussing agent-specific topics (email campaigns, phone calls), reference the relevant specialist\'s domain. ' +
          'You can suggest delegating tasks to specialists when appropriate using: {"action": "delegate_to_agent", "agentSlug": "...", "task": "..."}';
      }
    } catch { /* ignore */ }

    // Build system prompt
    const systemPrompt = [
      ceoPromptPrefix || 'You are the CEO AI assistant for ColdAF Email Tool admin panel.',
      'You are the primary point of contact for the admin. You can help with:',
      '- Updating brand AI prompts',
      '- Modifying campaign settings',
      '- Generating subject line variations',
      '- Analyzing campaign performance',
      '- Overseeing email and phone call operations',
      '- Delegating tasks to specialist agents',
      '',
      'When the user asks to change a brand\'s prompt or settings, return a JSON action block in your response:',
      '{"action": "update_brand_prompt", "brandId": "...", "newPrompt": "..."}',
      'or {"action": "update_setting", "key": "...", "value": "..."}',
      'or {"action": "update_campaign_setting", "campaignId": "...", "field": "...", "value": "..."}',
      'or {"action": "delegate_to_agent", "agentSlug": "...", "task": "..."}',
      '',
      'Always explain what you\'re about to do and ask for confirmation first, unless the user already confirmed.',
      specialistContext,
      '',
      'Current brands:',
      JSON.stringify(brandsContext, null, 2),
    ].join('\n');

    // Build messages array for Claude
    const messages = conversationHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Get AI model from settings, default to claude-haiku-3-5
    let aiModel;
    try {
      const modelResult = await db.query(
        "SELECT value FROM system_settings WHERE key = 'ai_chat_model' LIMIT 1"
      );
      aiModel = modelResult.rows.length > 0 ? modelResult.rows[0].value : 'claude-haiku-3-5';
    } catch (err) {
      aiModel = 'claude-haiku-3-5';
    }

    // Call Claude API
    const client = new Anthropic({ apiKey: env.anthropic.apiKey });
    const response = await client.messages.create({
      model: aiModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const assistantContent = response.content[0].text;

    // Parse for action blocks
    const actions = extractActions(assistantContent);
    const needsConfirmation = actions.length > 0;

    // Save assistant message with token usage
    await db.query(
      `INSERT INTO ai_chat_messages (user_id, role, content, actions_taken, input_tokens, output_tokens, model, provider)
       VALUES ($1, 'assistant', $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        assistantContent,
        actions.length > 0 ? JSON.stringify(actions) : null,
        response.usage?.input_tokens || 0,
        response.usage?.output_tokens || 0,
        aiModel,
        'anthropic',
      ]
    );

    return res.json({
      success: true,
      data: {
        message: assistantContent,
        actions,
        needsConfirmation,
        tokenUsage: {
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
        },
      },
    });
  } catch (err) {
    logger.error('Failed to process AI chat message', {
      error: err.message,
      userId: req.user.id,
    });

    if (err.status === 401 || err.message?.includes('authentication')) {
      return res.status(502).json({
        success: false,
        message: 'AI service authentication failed. Check your API key configuration.',
      });
    }

    if (err.status === 429) {
      return res.status(429).json({
        success: false,
        message: 'AI service rate limit reached. Please try again in a moment.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to process chat message.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /confirm-action - Execute a confirmed action from the AI chat
// ---------------------------------------------------------------------------
router.post('/confirm-action', async (req, res) => {
  try {
    const { action } = req.body;

    if (!action || !action.action) {
      return res.status(400).json({
        success: false,
        message: 'A valid action object with an "action" field is required.',
      });
    }

    let result;

    switch (action.action) {
      case 'update_brand_prompt': {
        if (!action.brandId || !action.newPrompt) {
          return res.status(400).json({
            success: false,
            message: 'brandId and newPrompt are required for update_brand_prompt.',
          });
        }

        // Verify brand exists
        const brandCheck = await db.query(
          'SELECT id, name, ai_system_prompt FROM brands WHERE id = $1 AND organization_id = $2',
          [action.brandId, req.organizationId]
        );
        if (brandCheck.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Brand not found.',
          });
        }

        const oldPrompt = brandCheck.rows[0].ai_system_prompt;

        await db.query(
          'UPDATE brands SET ai_system_prompt = $1, updated_at = NOW() WHERE id = $2',
          [action.newPrompt, action.brandId]
        );

        await logAction({
          actorId: req.user.id,
          actorName: req.user.email,
          actionType: 'brand.ai_prompt_updated',
          targetType: 'brand',
          targetId: action.brandId,
          description: `AI chat updated brand "${brandCheck.rows[0].name}" AI prompt`,
          metadata: {
            oldPromptPreview: oldPrompt ? oldPrompt.substring(0, 200) : null,
            newPromptPreview: action.newPrompt.substring(0, 200),
            source: 'ai_chat',
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        result = {
          type: 'update_brand_prompt',
          brandId: action.brandId,
          brandName: brandCheck.rows[0].name,
          message: `Successfully updated AI prompt for brand "${brandCheck.rows[0].name}".`,
        };
        break;
      }

      case 'update_setting': {
        if (!action.key || action.value === undefined) {
          return res.status(400).json({
            success: false,
            message: 'key and value are required for update_setting.',
          });
        }

        // Fetch old value for audit
        const oldSettingResult = await db.query(
          'SELECT value FROM system_settings WHERE key = $1 LIMIT 1',
          [action.key]
        );
        const oldValue = oldSettingResult.rows.length > 0 ? oldSettingResult.rows[0].value : null;

        const valueStr = typeof action.value === 'string' ? action.value : JSON.stringify(action.value);

        // Upsert the setting
        await db.query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [action.key, valueStr]
        );

        await logAction({
          actorId: req.user.id,
          actorName: req.user.email,
          actionType: 'setting.updated',
          targetType: 'system_setting',
          targetId: action.key,
          description: `AI chat updated system setting "${action.key}"`,
          metadata: {
            key: action.key,
            oldValue,
            newValue: valueStr,
            source: 'ai_chat',
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        result = {
          type: 'update_setting',
          key: action.key,
          message: `Successfully updated setting "${action.key}".`,
        };
        break;
      }

      case 'update_campaign_setting': {
        if (!action.campaignId || !action.field || action.value === undefined) {
          return res.status(400).json({
            success: false,
            message: 'campaignId, field, and value are required for update_campaign_setting.',
          });
        }

        // Whitelist of updatable campaign fields
        const allowedFields = [
          'name', 'description', 'status', 'daily_send_limit',
          'min_delay_minutes', 'max_delay_minutes', 'send_window_start',
          'send_window_end', 'followup_count', 'auto_pause_bounce_rate',
          'auto_pause_spam_rate', 'auto_pause_enabled',
        ];

        if (!allowedFields.includes(action.field)) {
          return res.status(400).json({
            success: false,
            message: `Field "${action.field}" is not an allowed campaign setting. Allowed: ${allowedFields.join(', ')}`,
          });
        }

        // Verify campaign exists
        const campaignCheck = await db.query(
          'SELECT id, name FROM campaigns WHERE id = $1 AND organization_id = $2',
          [action.campaignId, req.organizationId]
        );
        if (campaignCheck.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Campaign not found.',
          });
        }

        // Use parameterized identifier (field name is whitelisted above)
        await db.query(
          `UPDATE campaigns SET ${action.field} = $1, updated_at = NOW() WHERE id = $2`,
          [action.value, action.campaignId]
        );

        await logAction({
          actorId: req.user.id,
          actorName: req.user.email,
          actionType: 'campaign.setting_updated',
          targetType: 'campaign',
          targetId: action.campaignId,
          description: `AI chat updated campaign "${campaignCheck.rows[0].name}" setting: ${action.field}`,
          metadata: {
            field: action.field,
            newValue: action.value,
            campaignName: campaignCheck.rows[0].name,
            source: 'ai_chat',
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        result = {
          type: 'update_campaign_setting',
          campaignId: action.campaignId,
          campaignName: campaignCheck.rows[0].name,
          field: action.field,
          message: `Successfully updated "${action.field}" for campaign "${campaignCheck.rows[0].name}".`,
        };
        break;
      }

      case 'delegate_to_agent': {
        if (!action.agentSlug || !action.task) {
          return res.status(400).json({
            success: false,
            message: 'agentSlug and task are required for delegate_to_agent.',
          });
        }

        const targetAgent = await registry.getAgentBySlug(action.agentSlug);
        if (!targetAgent) {
          return res.status(404).json({
            success: false,
            message: `Agent "${action.agentSlug}" not found.`,
          });
        }

        const { runAgentCheck } = require('../services/agents');
        let delegationLog = null;
        try {
          delegationLog = await runAgentCheck(action.agentSlug);
        } catch (err) {
          logger.error('Delegation failed', { agentSlug: action.agentSlug, error: err.message });
        }

        await logAction({
          actorId: req.user.id,
          actorName: req.user.email,
          actionType: 'ai_agent.delegated',
          targetType: 'ai_agent',
          targetId: targetAgent.id,
          description: `CEO delegated task to "${targetAgent.name}": ${action.task}`,
          metadata: { task: action.task, logId: delegationLog?.id },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        result = {
          type: 'delegate_to_agent',
          agentSlug: action.agentSlug,
          agentName: targetAgent.name,
          message: `Task delegated to "${targetAgent.name}". ${delegationLog ? `Check completed with status: ${delegationLog.status}` : 'Agent check could not be run.'}`,
          logSummary: delegationLog?.summary || null,
        };
        break;
      }

      default:
        return res.status(400).json({
          success: false,
          message: `Unknown action type: "${action.action}". Supported: update_brand_prompt, update_setting, update_campaign_setting, delegate_to_agent.`,
        });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    logger.error('Failed to execute AI chat action', {
      error: err.message,
      userId: req.user.id,
      action: req.body.action,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to execute the confirmed action.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /history - Clear chat history for the current user
// ---------------------------------------------------------------------------
router.delete('/history', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM ai_chat_messages WHERE user_id = $1',
      [req.user.id]
    );

    logger.info('AI chat history cleared', {
      userId: req.user.id,
      deletedCount: result.rowCount,
    });

    return res.json({
      success: true,
      data: {
        deletedCount: result.rowCount,
        message: 'Chat history cleared successfully.',
      },
    });
  } catch (err) {
    logger.error('Failed to clear AI chat history', {
      error: err.message,
      userId: req.user.id,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to clear chat history.',
    });
  }
});

module.exports = router;
