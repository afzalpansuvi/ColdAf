const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireRole, requirePermission } = require('../middleware/rbac');
const { getSetting } = require('../utils/settings');
const { logAction } = require('../services/audit');

const router = express.Router();

router.use(authenticate);
router.use(tenantScope);
router.use(requireOrg);
router.use(requirePermission('*'));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_PRICING = {
  anthropic: {
    'claude-haiku-4-5': { inputPer1M: 1.00, outputPer1M: 5.00 },
    'claude-sonnet-4-6': { inputPer1M: 3.00, outputPer1M: 15.00 },
    'claude-opus-4-6': { inputPer1M: 15.00, outputPer1M: 75.00 },
  },
  openai: {
    'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
    'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
  },
  google_gemini: {
    'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.00 },
    'gemini-2.0-flash': { inputPer1M: 0.10, outputPer1M: 0.40 },
  },
};

const DEFAULT_LIMITS = {
  monthlyTokenLimit: 5000000,
  monthlyCostLimit: 50.00,
  alertAtPercent: 80,
};

async function getPricingConfig() {
  const raw = await getSetting('ai_pricing_config', null);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  return DEFAULT_PRICING;
}

async function getLimitsConfig() {
  const raw = await getSetting('ai_usage_limits', null);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  return DEFAULT_LIMITS;
}

function calculateCost(inputTokens, outputTokens, model, provider, pricing) {
  const providerPricing = pricing[provider];
  if (!providerPricing) return 0;
  const modelPricing = providerPricing[model];
  if (!modelPricing) return 0;
  return (inputTokens / 1_000_000) * modelPricing.inputPer1M
       + (outputTokens / 1_000_000) * modelPricing.outputPer1M;
}

function parsePeriod(period, from, to) {
  const now = new Date();
  if (from && to) {
    return { fromDate: new Date(from), toDate: new Date(to) };
  }
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  return { fromDate, toDate: now };
}

// ---------------------------------------------------------------------------
// GET /summary - Aggregated usage data
// ---------------------------------------------------------------------------
router.get('/summary', async (req, res) => {
  try {
    const { period, from, to } = req.query;
    const { fromDate, toDate } = parsePeriod(period, from, to);
    const pricing = await getPricingConfig();

    // Agent logs aggregation
    const agentResult = await db.query(
      `SELECT
         DATE(created_at) AS date,
         COALESCE(provider, 'anthropic') AS provider,
         COALESCE(model, 'unknown') AS model,
         SUM(COALESCE((token_usage->>'input_tokens')::int, 0)) AS input_tokens,
         SUM(COALESCE((token_usage->>'output_tokens')::int, 0)) AS output_tokens,
         COUNT(*) AS request_count
       FROM ai_agent_logs
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY DATE(created_at), provider, model
       ORDER BY date`,
      [fromDate, toDate]
    );

    // Chat messages aggregation
    const chatResult = await db.query(
      `SELECT
         DATE(created_at) AS date,
         COALESCE(provider, 'anthropic') AS provider,
         COALESCE(model, 'unknown') AS model,
         SUM(COALESCE(input_tokens, 0)) AS input_tokens,
         SUM(COALESCE(output_tokens, 0)) AS output_tokens,
         COUNT(*) AS request_count
       FROM ai_chat_messages
       WHERE role = 'assistant'
         AND created_at >= $1 AND created_at <= $2
       GROUP BY DATE(created_at), provider, model
       ORDER BY date`,
      [fromDate, toDate]
    );

    // Merge and aggregate
    const allRows = [
      ...agentResult.rows.map(r => ({ ...r, source: 'agent' })),
      ...chatResult.rows.map(r => ({ ...r, source: 'chat' })),
    ];

    // Totals
    let totalInput = 0, totalOutput = 0, totalCost = 0, totalRequests = 0;
    const dailyMap = {};
    const providerMap = {};
    const modelMap = {};
    const sourceMap = { agent: { inputTokens: 0, outputTokens: 0, cost: 0, requestCount: 0 }, chat: { inputTokens: 0, outputTokens: 0, cost: 0, requestCount: 0 } };

    for (const row of allRows) {
      const inp = parseInt(row.input_tokens, 10) || 0;
      const out = parseInt(row.output_tokens, 10) || 0;
      const reqs = parseInt(row.request_count, 10) || 0;
      const cost = calculateCost(inp, out, row.model, row.provider, pricing);

      totalInput += inp;
      totalOutput += out;
      totalCost += cost;
      totalRequests += reqs;

      // Daily
      const dateKey = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { date: dateKey, inputTokens: 0, outputTokens: 0, cost: 0, requestCount: 0 };
      }
      dailyMap[dateKey].inputTokens += inp;
      dailyMap[dateKey].outputTokens += out;
      dailyMap[dateKey].cost += cost;
      dailyMap[dateKey].requestCount += reqs;

      // By provider
      if (!providerMap[row.provider]) {
        providerMap[row.provider] = { provider: row.provider, inputTokens: 0, outputTokens: 0, cost: 0, requestCount: 0 };
      }
      providerMap[row.provider].inputTokens += inp;
      providerMap[row.provider].outputTokens += out;
      providerMap[row.provider].cost += cost;
      providerMap[row.provider].requestCount += reqs;

      // By model
      const modelKey = `${row.provider}:${row.model}`;
      if (!modelMap[modelKey]) {
        modelMap[modelKey] = { model: row.model, provider: row.provider, inputTokens: 0, outputTokens: 0, cost: 0, requestCount: 0 };
      }
      modelMap[modelKey].inputTokens += inp;
      modelMap[modelKey].outputTokens += out;
      modelMap[modelKey].cost += cost;
      modelMap[modelKey].requestCount += reqs;

      // By source
      if (sourceMap[row.source]) {
        sourceMap[row.source].inputTokens += inp;
        sourceMap[row.source].outputTokens += out;
        sourceMap[row.source].cost += cost;
        sourceMap[row.source].requestCount += reqs;
      }
    }

    // Round costs
    const round2 = (n) => parseFloat(n.toFixed(4));

    const daily = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, cost: round2(d.cost) }));

    const byProvider = Object.values(providerMap).map(p => ({ ...p, cost: round2(p.cost) }));
    const byModel = Object.values(modelMap)
      .sort((a, b) => b.cost - a.cost)
      .map(m => ({ ...m, cost: round2(m.cost) }));

    return res.json({
      success: true,
      data: {
        totals: {
          inputTokens: totalInput,
          outputTokens: totalOutput,
          totalTokens: totalInput + totalOutput,
          estimatedCost: round2(totalCost),
          requestCount: totalRequests,
        },
        daily,
        byProvider,
        byModel,
        bySource: {
          agent: { ...sourceMap.agent, cost: round2(sourceMap.agent.cost) },
          chat: { ...sourceMap.chat, cost: round2(sourceMap.chat.cost) },
        },
      },
    });
  } catch (err) {
    logger.error('Failed to fetch AI usage summary', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch usage summary.' });
  }
});

// ---------------------------------------------------------------------------
// GET /limits - Current limits + usage against them
// ---------------------------------------------------------------------------
router.get('/limits', async (req, res) => {
  try {
    const limits = await getLimitsConfig();
    const pricing = await getPricingConfig();

    // Current month usage
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const agentResult = await db.query(
      `SELECT
         COALESCE(provider, 'anthropic') AS provider,
         COALESCE(model, 'unknown') AS model,
         SUM(COALESCE((token_usage->>'input_tokens')::int, 0)) AS input_tokens,
         SUM(COALESCE((token_usage->>'output_tokens')::int, 0)) AS output_tokens
       FROM ai_agent_logs
       WHERE created_at >= $1
       GROUP BY provider, model`,
      [monthStart]
    );

    const chatResult = await db.query(
      `SELECT
         COALESCE(provider, 'anthropic') AS provider,
         COALESCE(model, 'unknown') AS model,
         SUM(COALESCE(input_tokens, 0)) AS input_tokens,
         SUM(COALESCE(output_tokens, 0)) AS output_tokens
       FROM ai_chat_messages
       WHERE role = 'assistant' AND created_at >= $1
       GROUP BY provider, model`,
      [monthStart]
    );

    let totalTokens = 0, totalCost = 0;
    for (const row of [...agentResult.rows, ...chatResult.rows]) {
      const inp = parseInt(row.input_tokens, 10) || 0;
      const out = parseInt(row.output_tokens, 10) || 0;
      totalTokens += inp + out;
      totalCost += calculateCost(inp, out, row.model, row.provider, pricing);
    }

    return res.json({
      success: true,
      data: {
        limits,
        currentUsage: {
          tokens: totalTokens,
          cost: parseFloat(totalCost.toFixed(4)),
          percentTokens: limits.monthlyTokenLimit > 0 ? parseFloat(((totalTokens / limits.monthlyTokenLimit) * 100).toFixed(1)) : 0,
          percentCost: limits.monthlyCostLimit > 0 ? parseFloat(((totalCost / limits.monthlyCostLimit) * 100).toFixed(1)) : 0,
        },
      },
    });
  } catch (err) {
    logger.error('Failed to fetch AI usage limits', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch usage limits.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /limits - Update usage limits
// ---------------------------------------------------------------------------
router.put('/limits', async (req, res) => {
  try {
    const { monthlyTokenLimit, monthlyCostLimit, alertAtPercent } = req.body;
    const current = await getLimitsConfig();

    if (monthlyTokenLimit !== undefined) current.monthlyTokenLimit = parseInt(monthlyTokenLimit, 10) || 0;
    if (monthlyCostLimit !== undefined) current.monthlyCostLimit = parseFloat(monthlyCostLimit) || 0;
    if (alertAtPercent !== undefined) current.alertAtPercent = parseFloat(alertAtPercent) || 80;

    await db.query(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      ['ai_usage_limits', JSON.stringify(current)]
    );

    await logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'ai_usage.limits_updated',
      targetType: 'system_setting',
      description: 'Updated AI usage limits',
      metadata: current,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ success: true, data: { limits: current } });
  } catch (err) {
    logger.error('Failed to update AI usage limits', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to update limits.' });
  }
});

// ---------------------------------------------------------------------------
// GET /pricing - Current pricing config
// ---------------------------------------------------------------------------
router.get('/pricing', async (req, res) => {
  try {
    const pricing = await getPricingConfig();
    return res.json({ success: true, data: pricing });
  } catch (err) {
    logger.error('Failed to fetch AI pricing config', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch pricing.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /pricing - Update pricing config
// ---------------------------------------------------------------------------
router.put('/pricing', async (req, res) => {
  try {
    const newPricing = req.body;
    if (!newPricing || typeof newPricing !== 'object') {
      return res.status(400).json({ success: false, message: 'Pricing config must be a JSON object.' });
    }

    await db.query(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      ['ai_pricing_config', JSON.stringify(newPricing)]
    );

    await logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'ai_usage.pricing_updated',
      targetType: 'system_setting',
      description: 'Updated AI pricing config',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ success: true, data: newPricing });
  } catch (err) {
    logger.error('Failed to update AI pricing config', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to update pricing.' });
  }
});

module.exports = router;
