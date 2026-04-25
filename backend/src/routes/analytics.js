const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const logger = require('../utils/logger');

const router = express.Router();

// All analytics routes require authentication + tenant scoping
router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely round a number to `decimals` places. Returns 0 for NaN / Infinity.
 */
function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}

function whereFromConditions(conditions) {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

// ---------------------------------------------------------------------------
// GET /overview - Dashboard overview cards
// ---------------------------------------------------------------------------
router.get('/overview', async (req, res) => {
  try {
    const { date_from, date_to, brand_id } = req.query;

    // ----- Total Leads -----
    const leadConditions = ['organization_id = $1'];
    const leadParams = [req.organizationId];
    let lIdx = 2;
    if (brand_id) {
      leadConditions.push(`brand_id = $${lIdx++}`);
      leadParams.push(brand_id);
    }
    const leadWhere = whereFromConditions(leadConditions);

    const leadsResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM leads ${leadWhere}`,
      leadParams
    );
    const totalLeads = leadsResult.rows[0].total;

    // ----- Emails sent (excluding queued & failed) -----
    const sentConditions = ["es.status NOT IN ('queued', 'failed')", 'es.organization_id = $1'];
    const sentParams = [req.organizationId];
    let sIdx = 2;
    if (date_from) {
      sentConditions.push(`es.sent_at >= $${sIdx++}`);
      sentParams.push(date_from);
    }
    if (date_to) {
      sentConditions.push(`es.sent_at <= $${sIdx++}`);
      sentParams.push(date_to);
    }
    if (brand_id) {
      sentConditions.push(`es.brand_id = $${sIdx++}`);
      sentParams.push(brand_id);
    }
    const sentWhere = whereFromConditions(sentConditions);

    const sentResult = await db.query(
      `SELECT
         COUNT(*)::int                                                     AS total_sent,
         COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)::int             AS total_opened,
         COUNT(*) FILTER (WHERE es.clicked_at IS NOT NULL)::int            AS total_clicked,
         COUNT(*) FILTER (WHERE es.replied_at IS NOT NULL)::int            AS total_replied,
         COUNT(*) FILTER (WHERE es.bounced_at IS NOT NULL)::int            AS total_bounced
       FROM emails_sent es
       ${sentWhere}`,
      sentParams
    );

    const {
      total_sent: totalSent,
      total_opened: totalOpened,
      total_clicked: totalClicked,
      total_replied: totalReplied,
      total_bounced: totalBounced,
    } = sentResult.rows[0];

    // ----- Sent last 30 days (always last 30 days regardless of date range) -----
    const last30Conditions = [
      "es.status NOT IN ('queued', 'failed')",
      "es.sent_at >= NOW() - INTERVAL '30 days'",
      'es.organization_id = $1',
    ];
    const last30Params = [req.organizationId];
    let l30Idx = 2;
    if (brand_id) {
      last30Conditions.push(`es.brand_id = $${l30Idx++}`);
      last30Params.push(brand_id);
    }
    const last30Where = whereFromConditions(last30Conditions);

    const last30Result = await db.query(
      `SELECT COUNT(*)::int AS total FROM emails_sent es ${last30Where}`,
      last30Params
    );
    const totalSentLast30Days = last30Result.rows[0].total;

    // ----- Unsubscribe count (from email_events) -----
    // Join email_events to emails_sent so we can apply brand + date + org filters
    const unsubConditions = ["ee.event_type = 'unsubscribe'", 'es.organization_id = $1'];
    const unsubParams = [req.organizationId];
    let uIdx = 2;
    if (date_from) {
      unsubConditions.push(`ee.created_at >= $${uIdx++}`);
      unsubParams.push(date_from);
    }
    if (date_to) {
      unsubConditions.push(`ee.created_at <= $${uIdx++}`);
      unsubParams.push(date_to);
    }
    if (brand_id) {
      unsubConditions.push(`es.brand_id = $${uIdx++}`);
      unsubParams.push(brand_id);
    }
    const unsubWhere = whereFromConditions(unsubConditions);

    const unsubResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM email_events ee
       JOIN emails_sent es ON es.id = ee.email_id
       ${unsubWhere}`,
      unsubParams
    );
    const totalUnsubscribed = unsubResult.rows[0].total;

    // ----- Active campaigns -----
    const campConditions = ["c.status = 'active'", 'c.organization_id = $1'];
    const campParams = [req.organizationId];
    let cIdx = 2;
    if (brand_id) {
      campConditions.push(
        `EXISTS (SELECT 1 FROM campaign_brands cb WHERE cb.campaign_id = c.id AND cb.brand_id = $${cIdx++})`
      );
      campParams.push(brand_id);
    }
    const campWhere = whereFromConditions(campConditions);

    const campResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM campaigns c ${campWhere}`,
      campParams
    );
    const activeCampaigns = campResult.rows[0].total;

    // ----- SMTP health summary -----
    const smtpConditions = ['organization_id = $1'];
    const smtpParams = [req.organizationId];
    let smIdx = 2;
    if (brand_id) {
      smtpConditions.push(`brand_id = $${smIdx++}`);
      smtpParams.push(brand_id);
    }
    const smtpWhere = whereFromConditions(smtpConditions);

    const smtpResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE health_status = 'healthy')::int  AS healthy,
         COUNT(*) FILTER (WHERE health_status = 'degraded')::int AS degraded,
         COUNT(*) FILTER (WHERE health_status = 'failed')::int   AS failed
       FROM smtp_accounts
       ${smtpWhere}`,
      smtpParams
    );

    const smtpHealthSummary = smtpResult.rows[0];

    // ----- Rates -----
    const openRate = totalSent > 0 ? round((totalOpened / totalSent) * 100) : 0;
    const clickRate = totalSent > 0 ? round((totalClicked / totalSent) * 100) : 0;
    const replyRate = totalSent > 0 ? round((totalReplied / totalSent) * 100) : 0;
    const bounceRate = totalSent > 0 ? round((totalBounced / totalSent) * 100) : 0;
    const unsubscribeRate = totalSent > 0 ? round((totalUnsubscribed / totalSent) * 100) : 0;

    return res.json({
      success: true,
      data: {
        totalLeads,
        totalSent,
        totalSentLast30Days,
        openRate,
        clickRate,
        replyRate,
        bounceRate,
        unsubscribeRate,
        activeCampaigns,
        smtpHealthSummary,
      },
    });
  } catch (err) {
    logger.error('Analytics overview error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the analytics overview.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /timeline - Emails sent per day over selected period
// ---------------------------------------------------------------------------
router.get('/timeline', authenticate, async (req, res) => {
  try {
    const { date_from, date_to, brand_id, campaign_id } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({
        success: false,
        message: 'date_from and date_to query parameters are required.',
      });
    }

    // $1 = date_from, $2 = date_to (used by both generate_series and the WHERE)
    const extraConditions = [];
    const params = [date_from, date_to];
    let idx = 3;

    if (brand_id) {
      extraConditions.push(`es.brand_id = $${idx++}`);
      params.push(brand_id);
    }
    if (campaign_id) {
      extraConditions.push(`es.campaign_id = $${idx++}`);
      params.push(campaign_id);
    }

    const extraWhere = extraConditions.length > 0
      ? 'AND ' + extraConditions.join(' AND ')
      : '';

    const result = await db.query(
      `WITH date_series AS (
         SELECT d::date AS date
         FROM generate_series($1::date, $2::date, '1 day'::interval) d
       ),
       daily AS (
         SELECT
           es.sent_at::date AS date,
           COUNT(*)::int AS sent,
           COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)::int AS opened,
           COUNT(*) FILTER (WHERE es.clicked_at IS NOT NULL)::int AS clicked,
           COUNT(*) FILTER (WHERE es.replied_at IS NOT NULL)::int AS replied,
           COUNT(*) FILTER (WHERE es.bounced_at IS NOT NULL)::int AS bounced
         FROM emails_sent es
         WHERE es.status NOT IN ('queued', 'failed')
           AND es.sent_at >= $1::date
           AND es.sent_at < ($2::date + INTERVAL '1 day')
           ${extraWhere}
         GROUP BY es.sent_at::date
       )
       SELECT
         ds.date,
         COALESCE(d.sent, 0)    AS sent,
         COALESCE(d.opened, 0)  AS opened,
         COALESCE(d.clicked, 0) AS clicked,
         COALESCE(d.replied, 0) AS replied,
         COALESCE(d.bounced, 0) AS bounced
       FROM date_series ds
       LEFT JOIN daily d ON d.date = ds.date
       ORDER BY ds.date ASC`,
      params
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    logger.error('Analytics timeline error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the timeline data.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /funnel - Funnel data
// ---------------------------------------------------------------------------
router.get('/funnel', authenticate, async (req, res) => {
  try {
    const { date_from, date_to, brand_id, campaign_id } = req.query;

    // Leads count (filtered by brand if provided)
    const leadConditions = [];
    const leadParams = [];
    let lIdx = 1;
    if (brand_id) {
      leadConditions.push(`brand_id = $${lIdx++}`);
      leadParams.push(brand_id);
    }
    const leadWhere = whereFromConditions(leadConditions);

    const leadsResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM leads ${leadWhere}`,
      leadParams
    );

    // Email funnel counts
    const esConditions = [];
    const esParams = [];
    let eIdx = 1;
    if (date_from) {
      esConditions.push(`es.sent_at >= $${eIdx++}`);
      esParams.push(date_from);
    }
    if (date_to) {
      esConditions.push(`es.sent_at <= $${eIdx++}`);
      esParams.push(date_to);
    }
    if (brand_id) {
      esConditions.push(`es.brand_id = $${eIdx++}`);
      esParams.push(brand_id);
    }
    if (campaign_id) {
      esConditions.push(`es.campaign_id = $${eIdx++}`);
      esParams.push(campaign_id);
    }
    const esWhere = whereFromConditions(esConditions);

    const funnelResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE es.status = 'queued')::int                  AS queued,
         COUNT(*) FILTER (WHERE es.status NOT IN ('queued', 'failed'))::int AS sent,
         COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)::int              AS opened,
         COUNT(*) FILTER (WHERE es.clicked_at IS NOT NULL)::int             AS clicked,
         COUNT(*) FILTER (WHERE es.replied_at IS NOT NULL)::int             AS replied
       FROM emails_sent es
       ${esWhere}`,
      esParams
    );

    return res.json({
      success: true,
      data: {
        leads: leadsResult.rows[0].total,
        queued: funnelResult.rows[0].queued,
        sent: funnelResult.rows[0].sent,
        opened: funnelResult.rows[0].opened,
        clicked: funnelResult.rows[0].clicked,
        replied: funnelResult.rows[0].replied,
      },
    });
  } catch (err) {
    logger.error('Analytics funnel error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the funnel data.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /campaigns - Per-campaign breakdown table
// ---------------------------------------------------------------------------
router.get('/campaigns', authenticate, async (req, res) => {
  try {
    const {
      date_from,
      date_to,
      brand_id,
      sort_by = 'sent',
      sort_order = 'desc',
    } = req.query;

    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 25;
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    const validSortFields = [
      'name', 'sent', 'opened', 'open_rate', 'clicked', 'click_rate',
      'replied', 'reply_rate', 'bounced', 'bounce_rate', 'status',
    ];
    const safeSortBy = validSortFields.includes(sort_by) ? sort_by : 'sent';
    const safeSortOrder = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    // Build date / brand conditions for the emails_sent sub-query
    const esConditions = [];
    const esParams = [];
    let idx = 1;

    if (date_from) {
      esConditions.push(`es.sent_at >= $${idx++}`);
      esParams.push(date_from);
    }
    if (date_to) {
      esConditions.push(`es.sent_at <= $${idx++}`);
      esParams.push(date_to);
    }
    if (brand_id) {
      esConditions.push(`es.brand_id = $${idx++}`);
      esParams.push(brand_id);
    }

    const esExtra = esConditions.length > 0
      ? 'AND ' + esConditions.join(' AND ')
      : '';

    // Optional brand filter on campaigns via campaign_brands
    const brandJoin = brand_id
      ? `JOIN campaign_brands cb ON cb.campaign_id = c.id AND cb.brand_id = $${idx++}`
      : '';
    const brandParams = brand_id ? [brand_id] : [];

    // Pagination params
    const limitParam = `$${idx++}`;
    const offsetParam = `$${idx++}`;

    const allParams = [...esParams, ...brandParams, limit, offset];

    const result = await db.query(
      `SELECT
         c.id,
         c.name,
         c.status,
         COALESCE(stats.sent, 0)::int     AS sent,
         COALESCE(stats.opened, 0)::int   AS opened,
         COALESCE(stats.clicked, 0)::int  AS clicked,
         COALESCE(stats.replied, 0)::int  AS replied,
         COALESCE(stats.bounced, 0)::int  AS bounced,
         CASE WHEN COALESCE(stats.sent, 0) > 0
           THEN ROUND((COALESCE(stats.opened, 0)::numeric / stats.sent) * 100, 2)
           ELSE 0 END AS open_rate,
         CASE WHEN COALESCE(stats.sent, 0) > 0
           THEN ROUND((COALESCE(stats.clicked, 0)::numeric / stats.sent) * 100, 2)
           ELSE 0 END AS click_rate,
         CASE WHEN COALESCE(stats.sent, 0) > 0
           THEN ROUND((COALESCE(stats.replied, 0)::numeric / stats.sent) * 100, 2)
           ELSE 0 END AS reply_rate,
         CASE WHEN COALESCE(stats.sent, 0) > 0
           THEN ROUND((COALESCE(stats.bounced, 0)::numeric / stats.sent) * 100, 2)
           ELSE 0 END AS bounce_rate,
         COALESCE(brand_agg.brand_names, '') AS brand_names
       FROM campaigns c
       ${brandJoin}
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE es.status NOT IN ('queued', 'failed'))  AS sent,
           COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)               AS opened,
           COUNT(*) FILTER (WHERE es.clicked_at IS NOT NULL)              AS clicked,
           COUNT(*) FILTER (WHERE es.replied_at IS NOT NULL)              AS replied,
           COUNT(*) FILTER (WHERE es.bounced_at IS NOT NULL)              AS bounced
         FROM emails_sent es
         WHERE es.campaign_id = c.id
           ${esExtra}
       ) stats ON true
       LEFT JOIN LATERAL (
         SELECT STRING_AGG(b.name, ', ' ORDER BY b.name) AS brand_names
         FROM campaign_brands cb2
         JOIN brands b ON b.id = cb2.brand_id
         WHERE cb2.campaign_id = c.id
       ) brand_agg ON true
       ORDER BY ${safeSortBy} ${safeSortOrder}
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      allParams
    );

    // Total count for pagination
    const countParams = brand_id ? [brand_id] : [];
    const countBrandJoin = brand_id
      ? 'JOIN campaign_brands cb ON cb.campaign_id = c.id AND cb.brand_id = $1'
      : '';

    const totalResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM campaigns c ${countBrandJoin}`,
      countParams
    );
    const total = totalResult.rows[0].total;
    const totalPages = Math.ceil(total / limit) || 1;

    const campaigns = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      brandNames: row.brand_names,
      sent: row.sent,
      opened: row.opened,
      openRate: parseFloat(row.open_rate),
      clicked: row.clicked,
      clickRate: parseFloat(row.click_rate),
      replied: row.replied,
      replyRate: parseFloat(row.reply_rate),
      bounced: row.bounced,
      bounceRate: parseFloat(row.bounce_rate),
    }));

    return res.json({
      success: true,
      data: {
        campaigns,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    logger.error('Analytics campaigns error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching campaign analytics.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /brands - Per-brand breakdown
// ---------------------------------------------------------------------------
router.get('/brands', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         b.id,
         b.name,
         COALESCE(lead_counts.total, 0)::int AS total_leads,
         COALESCE(stats.sent, 0)::int        AS sent,
         COALESCE(stats.opened, 0)::int      AS opened,
         COALESCE(stats.clicked, 0)::int     AS clicked,
         COALESCE(stats.replied, 0)::int     AS replied,
         COALESCE(stats.bounced, 0)::int     AS bounced
       FROM brands b
       LEFT JOIN (
         SELECT brand_id, COUNT(*)::int AS total
         FROM leads
         GROUP BY brand_id
       ) lead_counts ON lead_counts.brand_id = b.id
       LEFT JOIN (
         SELECT
           es.brand_id,
           COUNT(*) FILTER (WHERE es.status NOT IN ('queued', 'failed'))  AS sent,
           COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)               AS opened,
           COUNT(*) FILTER (WHERE es.clicked_at IS NOT NULL)              AS clicked,
           COUNT(*) FILTER (WHERE es.replied_at IS NOT NULL)              AS replied,
           COUNT(*) FILTER (WHERE es.bounced_at IS NOT NULL)              AS bounced
         FROM emails_sent es
         GROUP BY es.brand_id
       ) stats ON stats.brand_id = b.id
       ORDER BY b.name ASC`
    );

    const brands = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      totalLeads: row.total_leads,
      sent: row.sent,
      opened: row.opened,
      openRate: row.sent > 0 ? round((row.opened / row.sent) * 100) : 0,
      clicked: row.clicked,
      clickRate: row.sent > 0 ? round((row.clicked / row.sent) * 100) : 0,
      replied: row.replied,
      replyRate: row.sent > 0 ? round((row.replied / row.sent) * 100) : 0,
      bounced: row.bounced,
      bounceRate: row.sent > 0 ? round((row.bounced / row.sent) * 100) : 0,
    }));

    return res.json({
      success: true,
      data: brands,
    });
  } catch (err) {
    logger.error('Analytics brands error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching brand analytics.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /smtp-performance - Per SMTP account performance
// ---------------------------------------------------------------------------
router.get('/smtp-performance', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         sa.id,
         sa.email_address,
         sa.health_status,
         COALESCE(b.name, 'Unassigned') AS brand_name,
         COALESCE(stats.sent, 0)::int    AS sent,
         COALESCE(stats.opened, 0)::int  AS opened,
         COALESCE(stats.bounced, 0)::int AS bounced
       FROM smtp_accounts sa
       LEFT JOIN brands b ON b.id = sa.brand_id
       LEFT JOIN (
         SELECT
           es.smtp_account_id,
           COUNT(*) FILTER (WHERE es.status NOT IN ('queued', 'failed'))  AS sent,
           COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)               AS opened,
           COUNT(*) FILTER (WHERE es.bounced_at IS NOT NULL)              AS bounced
         FROM emails_sent es
         GROUP BY es.smtp_account_id
       ) stats ON stats.smtp_account_id = sa.id
       ORDER BY sa.email_address ASC`
    );

    const accounts = result.rows.map((row) => ({
      id: row.id,
      emailAddress: row.email_address,
      brandName: row.brand_name,
      sent: row.sent,
      opened: row.opened,
      openRate: row.sent > 0 ? round((row.opened / row.sent) * 100) : 0,
      bounced: row.bounced,
      bounceRate: row.sent > 0 ? round((row.bounced / row.sent) * 100) : 0,
      healthStatus: row.health_status,
    }));

    return res.json({
      success: true,
      data: accounts,
    });
  } catch (err) {
    logger.error('Analytics SMTP performance error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching SMTP performance data.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /lead-status-distribution - Lead status distribution
// ---------------------------------------------------------------------------
router.get('/lead-status-distribution', authenticate, async (req, res) => {
  try {
    const { brand_id } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (brand_id) {
      conditions.push(`brand_id = $${idx++}`);
      params.push(brand_id);
    }

    const whereClause = whereFromConditions(conditions);

    const result = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM leads
       ${whereClause}
       GROUP BY status
       ORDER BY count DESC`,
      params
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    logger.error('Analytics lead status distribution error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching lead status distribution.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /response-times - Average time between send and reply
// ---------------------------------------------------------------------------
router.get('/response-times', authenticate, async (req, res) => {
  try {
    const conditions = ['es.replied_at IS NOT NULL', 'es.sent_at IS NOT NULL'];
    const params = [];
    let idx = 1;

    if (req.query.date_from) {
      conditions.push(`es.sent_at >= $${idx++}`);
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      conditions.push(`es.sent_at <= $${idx++}`);
      params.push(req.query.date_to);
    }
    if (req.query.brand_id) {
      conditions.push(`es.brand_id = $${idx++}`);
      params.push(req.query.brand_id);
    }
    if (req.query.campaign_id) {
      conditions.push(`es.campaign_id = $${idx++}`);
      params.push(req.query.campaign_id);
    }

    const whereClause = whereFromConditions(conditions);

    const result = await db.query(
      `WITH response_times AS (
         SELECT
           EXTRACT(EPOCH FROM (es.replied_at - es.sent_at)) / 3600.0 AS hours
         FROM emails_sent es
         ${whereClause}
       )
       SELECT
         COALESCE(ROUND(AVG(hours)::numeric, 2), 0)                       AS avg_response_time_hours,
         COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours)::numeric, 2), 0)
                                                                           AS median_response_time_hours,
         COUNT(*)::int                                                     AS count
       FROM response_times`,
      params
    );

    const row = result.rows[0];

    return res.json({
      success: true,
      data: {
        avgResponseTimeHours: parseFloat(row.avg_response_time_hours),
        medianResponseTimeHours: parseFloat(row.median_response_time_hours),
        count: row.count,
      },
    });
  } catch (err) {
    logger.error('Analytics response times error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching response time data.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /top-subjects - Best performing subject lines by open rate
// ---------------------------------------------------------------------------
router.get('/top-subjects', authenticate, async (req, res) => {
  try {
    const resultLimit = parseInt(req.query.limit, 10) || 20;
    const minSent = parseInt(req.query.min_sent, 10) || 5;

    const conditions = ["es.status NOT IN ('queued', 'failed')"];
    const params = [];
    let idx = 1;

    if (req.query.date_from) {
      conditions.push(`es.sent_at >= $${idx++}`);
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      conditions.push(`es.sent_at <= $${idx++}`);
      params.push(req.query.date_to);
    }
    if (req.query.brand_id) {
      conditions.push(`es.brand_id = $${idx++}`);
      params.push(req.query.brand_id);
    }

    const whereClause = whereFromConditions(conditions);

    const result = await db.query(
      `SELECT
         es.subject,
         COUNT(*)::int                                            AS sent,
         COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)::int    AS opened,
         CASE WHEN COUNT(*) > 0
           THEN ROUND((COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)::numeric / COUNT(*)) * 100, 2)
           ELSE 0 END                                             AS open_rate
       FROM emails_sent es
       ${whereClause}
       GROUP BY es.subject
       HAVING COUNT(*) >= $${idx++}
       ORDER BY open_rate DESC, sent DESC
       LIMIT $${idx++}`,
      [...params, minSent, resultLimit]
    );

    const subjects = result.rows.map((row) => ({
      subject: row.subject,
      sent: row.sent,
      opened: row.opened,
      openRate: parseFloat(row.open_rate),
    }));

    return res.json({
      success: true,
      data: subjects,
    });
  } catch (err) {
    logger.error('Analytics top subjects error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching top subject lines.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /send-time-heatmap - Open rates by hour and day of week
// ---------------------------------------------------------------------------
router.get('/send-time-heatmap', authenticate, async (req, res) => {
  try {
    const conditions = ["es.status NOT IN ('queued', 'failed')"];
    const params = [];
    let idx = 1;

    if (req.query.date_from) {
      conditions.push(`es.sent_at >= $${idx++}`);
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      conditions.push(`es.sent_at <= $${idx++}`);
      params.push(req.query.date_to);
    }
    if (req.query.brand_id) {
      conditions.push(`es.brand_id = $${idx++}`);
      params.push(req.query.brand_id);
    }

    const whereClause = whereFromConditions(conditions);

    const result = await db.query(
      `SELECT
         EXTRACT(DOW FROM es.sent_at)::int                         AS day_of_week,
         EXTRACT(HOUR FROM es.sent_at)::int                        AS hour,
         COUNT(*)::int                                              AS sent,
         COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)::int      AS opened,
         CASE WHEN COUNT(*) > 0
           THEN ROUND((COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)::numeric / COUNT(*)) * 100, 2)
           ELSE 0 END                                               AS open_rate
       FROM emails_sent es
       ${whereClause}
       GROUP BY day_of_week, hour
       ORDER BY day_of_week ASC, hour ASC`,
      params
    );

    const heatmap = result.rows.map((row) => ({
      dayOfWeek: row.day_of_week,
      hour: row.hour,
      sent: row.sent,
      opened: row.opened,
      openRate: parseFloat(row.open_rate),
    }));

    return res.json({
      success: true,
      data: heatmap,
    });
  } catch (err) {
    logger.error('Analytics send time heatmap error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the send time heatmap.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /compare - Date range comparison
// ---------------------------------------------------------------------------
router.get('/compare', authenticate, async (req, res) => {
  try {
    const { period1_from, period1_to, period2_from, period2_to, brand_id } = req.query;

    if (!period1_from || !period1_to || !period2_from || !period2_to) {
      return res.status(400).json({
        success: false,
        message: 'period1_from, period1_to, period2_from, and period2_to are all required.',
      });
    }

    /**
     * Fetch aggregate stats for a date range.
     */
    async function fetchPeriodStats(dateFrom, dateTo) {
      const conditions = [
        "es.status NOT IN ('queued', 'failed')",
        `es.sent_at >= $1`,
        `es.sent_at <= $2`,
      ];
      const params = [dateFrom, dateTo];
      let idx = 3;

      if (brand_id) {
        conditions.push(`es.brand_id = $${idx++}`);
        params.push(brand_id);
      }

      const whereClause = whereFromConditions(conditions);

      const result = await db.query(
        `SELECT
           COUNT(*)::int                                            AS sent,
           COUNT(*) FILTER (WHERE es.opened_at IS NOT NULL)::int    AS opened,
           COUNT(*) FILTER (WHERE es.clicked_at IS NOT NULL)::int   AS clicked,
           COUNT(*) FILTER (WHERE es.replied_at IS NOT NULL)::int   AS replied,
           COUNT(*) FILTER (WHERE es.bounced_at IS NOT NULL)::int   AS bounced
         FROM emails_sent es
         ${whereClause}`,
        params
      );

      const row = result.rows[0];
      const sent = row.sent;

      return {
        sent,
        opened: row.opened,
        openRate: sent > 0 ? round((row.opened / sent) * 100) : 0,
        clicked: row.clicked,
        clickRate: sent > 0 ? round((row.clicked / sent) * 100) : 0,
        replied: row.replied,
        replyRate: sent > 0 ? round((row.replied / sent) * 100) : 0,
        bounced: row.bounced,
        bounceRate: sent > 0 ? round((row.bounced / sent) * 100) : 0,
      };
    }

    const [period1, period2] = await Promise.all([
      fetchPeriodStats(period1_from, period1_to),
      fetchPeriodStats(period2_from, period2_to),
    ]);

    /**
     * Compute percentage change: ((new - old) / old) * 100.
     * Returns 0 if old is 0 to avoid division by zero.
     */
    function pctChange(oldVal, newVal) {
      if (oldVal === 0) return newVal === 0 ? 0 : 100;
      return round(((newVal - oldVal) / oldVal) * 100);
    }

    const change = {
      sentPct: pctChange(period1.sent, period2.sent),
      openRatePct: pctChange(period1.openRate, period2.openRate),
      clickRatePct: pctChange(period1.clickRate, period2.clickRate),
      replyRatePct: pctChange(period1.replyRate, period2.replyRate),
      bounceRatePct: pctChange(period1.bounceRate, period2.bounceRate),
    };

    return res.json({
      success: true,
      data: {
        period1,
        period2,
        change,
      },
    });
  } catch (err) {
    logger.error('Analytics compare error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while comparing date ranges.',
    });
  }
});

module.exports = router;
