const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');

// ═══════════════════════════════════════════════════════════════
//  Per-Client Analytics API (for Agency Dashboards)
// ═══════════════════════════════════════════════════════════════
// Returns per-organization campaign performance as JSON for
// embedding into agency white-label portals.
// ═══════════════════════════════════════════════════════════════

// GET /api/analytics/client-dashboard — JSON for client dashboards
router.get('/client-dashboard', authenticate, tenantScope, requireOrg, async (req, res) => {
  try {
    const orgId = req.organizationId;
    const dateRange = req.query.range || 'last_30_days';
    const { from, to } = getDateRange(dateRange);

    // Campaign summary
    const campaigns = await db.query(
      `SELECT
         c.id, c.name, c.status,
         COUNT(DISTINCT cl.lead_id) AS leads,
         COUNT(DISTINCT es.id) FILTER (WHERE es.status != 'pending') AS sent,
         COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL) AS opens,
         COUNT(DISTINCT es.id) FILTER (WHERE es.clicked_at IS NOT NULL) AS clicks,
         COUNT(DISTINCT es.id) FILTER (WHERE es.replied_at IS NOT NULL) AS replies,
         COUNT(DISTINCT es.id) FILTER (WHERE es.bounced_at IS NOT NULL) AS bounces
       FROM campaigns c
       LEFT JOIN campaign_leads cl ON c.id = cl.campaign_id
       LEFT JOIN emails_sent es ON c.id = es.campaign_id AND es.sent_at BETWEEN $2 AND $3
       WHERE c.organization_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [orgId, from, to]
    );

    // Brand performance
    const brands = await db.query(
      `SELECT b.id, b.name, b.primary_domain,
              COUNT(DISTINCT c.id) AS campaigns,
              COUNT(DISTINCT sa.id) AS smtp_accounts,
              COUNT(DISTINCT es.id) FILTER (WHERE es.status != 'pending') AS sent,
              COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL) AS opens
       FROM brands b
       LEFT JOIN campaigns c ON b.id = ANY(c.brand_ids) AND c.organization_id = $1
       LEFT JOIN smtp_accounts sa ON b.id = sa.brand_id AND sa.organization_id = $1
       LEFT JOIN emails_sent es ON es.organization_id = $1 AND es.sent_at BETWEEN $2 AND $3
       WHERE b.organization_id = $1
       GROUP BY b.id
       ORDER BY sent DESC`,
      [orgId, from, to]
    );

    // Overall stats
    const stats = await db.query(
      `SELECT
         COUNT(DISTINCT es.id) FILTER (WHERE es.status != 'pending') AS total_sent,
         COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL) AS total_opens,
         COUNT(DISTINCT es.id) FILTER (WHERE es.clicked_at IS NOT NULL) AS total_clicks,
         COUNT(DISTINCT es.id) FILTER (WHERE es.replied_at IS NOT NULL) AS total_replies,
         COUNT(DISTINCT es.id) FILTER (WHERE es.bounced_at IS NOT NULL) AS total_bounces,
         CASE WHEN COUNT(DISTINCT es.id) FILTER (WHERE es.status != 'pending') > 0
              THEN ROUND(
                COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL) * 100.0 /
                COUNT(DISTINCT es.id) FILTER (WHERE es.status != 'pending'), 2
              )
              ELSE 0
         END AS open_rate,
         CASE WHEN COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL) > 0
              THEN ROUND(
                COUNT(DISTINCT es.id) FILTER (WHERE es.clicked_at IS NOT NULL) * 100.0 /
                COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL), 2
              )
              ELSE 0
         END AS click_rate
       FROM emails_sent es
       WHERE es.organization_id = $1 AND es.sent_at BETWEEN $2 AND $3`,
      [orgId, from, to]
    );

    // Daily timeline
    const timeline = await db.query(
      `SELECT
         DATE(sent_at) AS date,
         COUNT(DISTINCT id) FILTER (WHERE status != 'pending') AS sent,
         COUNT(DISTINCT id) FILTER (WHERE opened_at IS NOT NULL) AS opens,
         COUNT(DISTINCT id) FILTER (WHERE clicked_at IS NOT NULL) AS clicks,
         COUNT(DISTINCT id) FILTER (WHERE replied_at IS NOT NULL) AS replies
       FROM emails_sent
       WHERE organization_id = $1 AND sent_at BETWEEN $2 AND $3
       GROUP BY DATE(sent_at)
       ORDER BY date ASC`,
      [orgId, from, to]
    );

    const result = {
      generated_at: new Date().toISOString(),
      date_range: { from, to },
      summary: stats.rows[0] || {},
      campaigns: campaigns.rows,
      brands: brands.rows,
      timeline: timeline.rows,
    };

    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Client dashboard analytics failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/analytics/client-dashboard/widget — HTML embed widget
router.get('/client-dashboard/widget', authenticate, tenantScope, requireOrg, async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { from, to } = getDateRange(req.query.range || 'last_30_days');
    const theme = req.query.theme || 'light';
    const primaryColor = req.query.color || '#3B82F6';

    const stats = await db.query(
      `SELECT
         COUNT(DISTINCT es.id) FILTER (WHERE es.status != 'pending') AS total_sent,
         COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL) AS total_opens,
         COUNT(DISTINCT es.id) FILTER (WHERE es.clicked_at IS NOT NULL) AS total_clicks,
         COUNT(DISTINCT es.id) FILTER (WHERE es.replied_at IS NOT NULL) AS total_replies
       FROM emails_sent es
       WHERE es.organization_id = $1 AND es.sent_at BETWEEN $2 AND $3`,
      [orgId, from, to]
    );

    const s = stats.rows[0] || {};
    const openRate = s.total_sent > 0 ? ((s.total_opens / s.total_sent) * 100).toFixed(1) : 0;
    const clickRate = s.total_opens > 0 ? ((s.total_clicks / s.total_opens) * 100).toFixed(1) : 0;

    const bg = theme === 'dark' ? '#1a1a2e' : '#ffffff';
    const text = theme === 'dark' ? '#e2e8f0' : '#1e293b';
    const cardBg = theme === 'dark' ? '#16213e' : '#f8fafc';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 16px; background: ${bg}; color: ${text}; }
    .widget { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; max-width: 600px; }
    .card { background: ${cardBg}; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid ${theme === 'dark' ? '#0f3460' : '#e2e8f0'}; }
    .value { font-size: 28px; font-weight: 700; color: ${primaryColor}; margin: 8px 0; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
    .rate { font-size: 14px; margin-top: 4px; }
    @media (max-width: 480px) { .widget { grid-template-columns: repeat(2, 1fr); } }
  </style>
</head>
<body>
  <div class="widget">
    <div class="card">
      <div class="label">Sent</div>
      <div class="value">${s.total_sent || 0}</div>
    </div>
    <div class="card">
      <div class="label">Opens</div>
      <div class="value">${s.total_opens || 0}</div>
      <div class="rate">${openRate}% open rate</div>
    </div>
    <div class="card">
      <div class="label">Clicks</div>
      <div class="value">${s.total_clicks || 0}</div>
      <div class="rate">${clickRate}% CTR</div>
    </div>
    <div class="card">
      <div class="label">Replies</div>
      <div class="value">${s.total_replies || 0}</div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(html);
  } catch (err) {
    logger.error('Widget generation failed', { error: err.message });
    return res.status(500).send('Error generating widget');
  }
});

function getDateRange(range) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case 'last_7_days': return { from: new Date(today.getTime() - 7 * 86400000), to: now };
    case 'last_30_days': return { from: new Date(today.getTime() - 30 * 86400000), to: now };
    case 'this_month': return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: now };
    case 'last_month': return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59) };
    default: return { from: new Date(today.getTime() - 30 * 86400000), to: now };
  }
}

module.exports = router;
