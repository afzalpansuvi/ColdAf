const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { requireRole, requirePermission } = require('../middleware/rbac');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const audit = require('../services/audit');
const { getOptimalSendWindows, adjustCampaignSchedule } = require('../services/sendTimeOptimizer');

const router = express.Router();

// All campaign routes require authentication and tenant scoping
router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'];

const VALID_LEAD_STATUSES = [
  'pending', 'queued', 'sent', 'opened', 'clicked', 'replied', 'bounced', 'failed', 'skipped',
];

/**
 * Maps a campaign DB row to a camelCase response object.
 */
function mapCampaign(c) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    isMultiBrand: c.is_multi_brand,
    multiBrandStrategy: c.multi_brand_strategy,
    multiBrandStaggerDays: c.multi_brand_stagger_days,
    leadFilter: c.lead_filter,
    scheduleStart: c.schedule_start,
    scheduleEnd: c.schedule_end,
    dailySendLimit: c.daily_send_limit,
    minDelayMinutes: c.min_delay_minutes,
    maxDelayMinutes: c.max_delay_minutes,
    sendWindowStart: c.send_window_start,
    sendWindowEnd: c.send_window_end,
    sendDays: c.send_days,
    followupCount: c.followup_count,
    followupDelays: c.followup_delays,
    autoPauseBounceRate: c.auto_pause_bounce_rate,
    autoPauseSpamRate: c.auto_pause_spam_rate,
    autoPauseEnabled: c.auto_pause_enabled,
    totalSent: c.total_sent,
    totalOpened: c.total_opened,
    totalClicked: c.total_clicked,
    totalReplied: c.total_replied,
    totalBounced: c.total_bounced,
    sendTimeOptimization: c.send_time_optimization,
    createdBy: c.created_by,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET / - List campaigns with filters, pagination, brand names, lead counts
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { status, brand_id, date_from, date_to, search } = req.query;

    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 25;
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    const conditions = [`c.organization_id = $1`];
    const params = [req.organizationId];
    let paramIndex = 2;

    if (status) {
      if (VALID_STATUSES.includes(status)) {
        conditions.push(`c.status = $${paramIndex++}`);
        params.push(status);
      }
    }

    if (brand_id) {
      conditions.push(
        `EXISTS (SELECT 1 FROM campaign_brands cb_f WHERE cb_f.campaign_id = c.id AND cb_f.brand_id = $${paramIndex++})`
      );
      params.push(brand_id);
    }

    if (date_from) {
      conditions.push(`c.created_at >= $${paramIndex++}`);
      params.push(date_from);
    }

    if (date_to) {
      conditions.push(`c.created_at <= $${paramIndex++}`);
      params.push(date_to);
    }

    if (search) {
      conditions.push(`c.name ILIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count query
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM campaigns c ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit) || 1;

    // Data query with brand names subquery and lead status counts subquery
    const offset = (page - 1) * limit;
    const dataResult = await db.query(
      `SELECT c.*,
              (
                SELECT COALESCE(json_agg(json_build_object('id', b.id, 'name', b.name)), '[]'::json)
                FROM campaign_brands cb
                JOIN brands b ON b.id = cb.brand_id
                WHERE cb.campaign_id = c.id
              ) AS brands,
              (
                SELECT COALESCE(json_object_agg(cl.status, cl.cnt), '{}'::json)
                FROM (
                  SELECT status, COUNT(*)::int AS cnt
                  FROM campaign_leads
                  WHERE campaign_id = c.id
                  GROUP BY status
                ) cl
              ) AS lead_status_counts
       FROM campaigns c
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const campaigns = dataResult.rows.map((row) => ({
      ...mapCampaign(row),
      brands: row.brands || [],
      leadStatusCounts: row.lead_status_counts || {},
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
    logger.error('List campaigns error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing campaigns.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /:id - Full campaign detail with brands, lead counts, A/B test info,
//            and recent emails sent
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch campaign
    const campaignResult = await db.query(
      `SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.',
      });
    }

    const campaign = mapCampaign(campaignResult.rows[0]);

    // Fetch brands
    const brandsResult = await db.query(
      `SELECT b.id, b.name, b.logo_url, b.primary_domain
       FROM campaign_brands cb
       JOIN brands b ON b.id = cb.brand_id
       WHERE cb.campaign_id = $1
       ORDER BY b.name ASC`,
      [id]
    );

    // Lead counts by status
    const leadCountsResult = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM campaign_leads
       WHERE campaign_id = $1
       GROUP BY status`,
      [id]
    );

    const leadStatusCounts = {};
    let totalLeads = 0;
    for (const row of leadCountsResult.rows) {
      leadStatusCounts[row.status] = row.count;
      totalLeads += row.count;
    }

    // A/B test info
    const abTestsResult = await db.query(
      `SELECT id, name, test_type, status, winner_variant_id, created_at
       FROM ab_tests
       WHERE campaign_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    // Recent emails sent (last 20)
    const recentEmailsResult = await db.query(
      `SELECT es.id, es.subject, es.status, es.sent_at, es.opened_at, es.clicked_at,
              l.full_name AS lead_name, l.email AS lead_email
       FROM emails_sent es
       JOIN leads l ON l.id = es.lead_id
       WHERE es.campaign_id = $1
       ORDER BY es.sent_at DESC
       LIMIT 20`,
      [id]
    );

    return res.json({
      success: true,
      data: {
        ...campaign,
        brands: brandsResult.rows.map((b) => ({
          id: b.id,
          name: b.name,
          logoUrl: b.logo_url,
          primaryDomain: b.primary_domain,
        })),
        leadStatusCounts,
        totalLeads,
        abTests: abTestsResult.rows,
        recentEmails: recentEmailsResult.rows,
      },
    });
  } catch (err) {
    logger.error('Get campaign error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the campaign.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST / - Create campaign (admin only)
// Uses a transaction to insert campaign + campaign_brands
// ---------------------------------------------------------------------------
router.post('/', requirePermission('campaigns.manage'), async (req, res) => {
  const client = await db.getClient();
  try {
    const {
      name,
      description,
      brandIds,
      leadFilter,
      scheduleStart,
      scheduleEnd,
      dailySendLimit,
      minDelayMinutes,
      maxDelayMinutes,
      sendWindowStart,
      sendWindowEnd,
      sendDays,
      followupCount,
      followupDelays,
      autoPauseBounceRate,
      autoPauseSpamRate,
      autoPauseEnabled,
      isMultiBrand,
      multiBrandStrategy,
      multiBrandStaggerDays,
      sendTimeOptimization,
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Campaign name is required.',
      });
    }

    if (!brandIds || !Array.isArray(brandIds) || brandIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one brand must be specified (brandIds array).',
      });
    }

    await client.query('BEGIN');

    // Insert campaign
    const campaignResult = await client.query(
      `INSERT INTO campaigns
        (name, description, status, is_multi_brand, multi_brand_strategy,
         multi_brand_stagger_days, lead_filter, schedule_start, schedule_end,
         daily_send_limit, min_delay_minutes, max_delay_minutes,
         send_window_start, send_window_end, send_days,
         followup_count, followup_delays, auto_pause_bounce_rate,
         auto_pause_spam_rate, auto_pause_enabled, send_time_optimization, created_by, organization_id)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       RETURNING *`,
      [
        name.trim(),
        description || null,
        isMultiBrand || false,
        multiBrandStrategy || null,
        multiBrandStaggerDays != null ? multiBrandStaggerDays : null,
        leadFilter ? JSON.stringify(leadFilter) : null,
        scheduleStart || null,
        scheduleEnd || null,
        dailySendLimit != null ? dailySendLimit : 50,
        minDelayMinutes != null ? minDelayMinutes : 2,
        maxDelayMinutes != null ? maxDelayMinutes : 5,
        sendWindowStart || '09:00',
        sendWindowEnd || '17:00',
        sendDays || [1, 2, 3, 4, 5],
        followupCount != null ? followupCount : 0,
        followupDelays ? JSON.stringify(followupDelays) : null,
        autoPauseBounceRate != null ? autoPauseBounceRate : 5.0,
        autoPauseSpamRate != null ? autoPauseSpamRate : 1.0,
        autoPauseEnabled != null ? autoPauseEnabled : true,
        sendTimeOptimization != null ? sendTimeOptimization : false,
        req.user.id,
        req.organizationId,
      ]
    );

    const campaign = campaignResult.rows[0];

    // Insert campaign_brands rows
    for (const brandId of brandIds) {
      await client.query(
        `INSERT INTO campaign_brands (campaign_id, brand_id) VALUES ($1, $2)`,
        [campaign.id, brandId]
      );
    }

    await client.query('COMMIT');

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'campaign.create',
      targetType: 'campaign',
      targetId: campaign.id,
      description: `Admin created campaign "${campaign.name}"`,
      metadata: { campaignName: campaign.name, brandIds },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Campaign created', { campaignId: campaign.id, name: campaign.name, createdBy: req.user.id });

    return res.status(201).json({
      success: true,
      data: mapCampaign(campaign),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Create campaign error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the campaign.',
    });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /:id - Update campaign (admin only)
// Only editable when status is draft or paused
// ---------------------------------------------------------------------------
router.put('/:id', requirePermission('campaigns.manage'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;

    // Verify campaign exists and is editable
    const campaignCheck = await client.query(
      `SELECT id, name, status FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (campaignCheck.rows.length === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.',
      });
    }

    const existing = campaignCheck.rows[0];

    if (!['draft', 'paused'].includes(existing.status)) {
      client.release();
      return res.status(400).json({
        success: false,
        message: `Campaign can only be edited when in "draft" or "paused" status. Current status: "${existing.status}".`,
      });
    }

    const {
      name,
      description,
      brandIds,
      leadFilter,
      scheduleStart,
      scheduleEnd,
      dailySendLimit,
      minDelayMinutes,
      maxDelayMinutes,
      sendWindowStart,
      sendWindowEnd,
      sendDays,
      followupCount,
      followupDelays,
      autoPauseBounceRate,
      autoPauseSpamRate,
      autoPauseEnabled,
      isMultiBrand,
      multiBrandStrategy,
      multiBrandStaggerDays,
      sendTimeOptimization,
    } = req.body;

    // Build dynamic SET clause
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }
    if (description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (isMultiBrand !== undefined) {
      setClauses.push(`is_multi_brand = $${paramIndex++}`);
      params.push(isMultiBrand);
    }
    if (multiBrandStrategy !== undefined) {
      setClauses.push(`multi_brand_strategy = $${paramIndex++}`);
      params.push(multiBrandStrategy);
    }
    if (multiBrandStaggerDays !== undefined) {
      setClauses.push(`multi_brand_stagger_days = $${paramIndex++}`);
      params.push(multiBrandStaggerDays);
    }
    if (leadFilter !== undefined) {
      setClauses.push(`lead_filter = $${paramIndex++}`);
      params.push(JSON.stringify(leadFilter));
    }
    if (scheduleStart !== undefined) {
      setClauses.push(`schedule_start = $${paramIndex++}`);
      params.push(scheduleStart);
    }
    if (scheduleEnd !== undefined) {
      setClauses.push(`schedule_end = $${paramIndex++}`);
      params.push(scheduleEnd);
    }
    if (dailySendLimit !== undefined) {
      setClauses.push(`daily_send_limit = $${paramIndex++}`);
      params.push(dailySendLimit);
    }
    if (minDelayMinutes !== undefined) {
      setClauses.push(`min_delay_minutes = $${paramIndex++}`);
      params.push(minDelayMinutes);
    }
    if (maxDelayMinutes !== undefined) {
      setClauses.push(`max_delay_minutes = $${paramIndex++}`);
      params.push(maxDelayMinutes);
    }
    if (sendWindowStart !== undefined) {
      setClauses.push(`send_window_start = $${paramIndex++}`);
      params.push(sendWindowStart);
    }
    if (sendWindowEnd !== undefined) {
      setClauses.push(`send_window_end = $${paramIndex++}`);
      params.push(sendWindowEnd);
    }
    if (sendDays !== undefined) {
      setClauses.push(`send_days = $${paramIndex++}`);
      params.push(sendDays);
    }
    if (followupCount !== undefined) {
      setClauses.push(`followup_count = $${paramIndex++}`);
      params.push(followupCount);
    }
    if (followupDelays !== undefined) {
      setClauses.push(`followup_delays = $${paramIndex++}`);
      params.push(JSON.stringify(followupDelays));
    }
    if (autoPauseBounceRate !== undefined) {
      setClauses.push(`auto_pause_bounce_rate = $${paramIndex++}`);
      params.push(autoPauseBounceRate);
    }
    if (autoPauseSpamRate !== undefined) {
      setClauses.push(`auto_pause_spam_rate = $${paramIndex++}`);
      params.push(autoPauseSpamRate);
    }
    if (autoPauseEnabled !== undefined) {
      setClauses.push(`auto_pause_enabled = $${paramIndex++}`);
      params.push(autoPauseEnabled);
    }
    if (sendTimeOptimization !== undefined) {
      setClauses.push(`send_time_optimization = $${paramIndex++}`);
      params.push(sendTimeOptimization);
    }

    if (setClauses.length === 0 && !brandIds) {
      client.release();
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update.',
      });
    }

    await client.query('BEGIN');

    // Update campaign fields if any
    if (setClauses.length > 0) {
      setClauses.push(`updated_at = NOW()`);
      params.push(id);
      const idPlaceholder = `$${paramIndex++}`;
      params.push(req.organizationId);
      const orgPlaceholder = `$${paramIndex}`;

      await client.query(
        `UPDATE campaigns SET ${setClauses.join(', ')} WHERE id = ${idPlaceholder} AND organization_id = ${orgPlaceholder}`,
        params
      );
    }

    // Update brand associations if provided
    if (brandIds && Array.isArray(brandIds)) {
      await client.query(
        `DELETE FROM campaign_brands WHERE campaign_id = $1`,
        [id]
      );

      for (const brandId of brandIds) {
        await client.query(
          `INSERT INTO campaign_brands (campaign_id, brand_id) VALUES ($1, $2)`,
          [id, brandId]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch updated campaign
    const updatedResult = await db.query(
      `SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'campaign.update',
      targetType: 'campaign',
      targetId: id,
      description: `Admin updated campaign "${existing.name}"`,
      metadata: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Campaign updated', { campaignId: id, updatedBy: req.user.id });

    return res.json({
      success: true,
      data: mapCampaign(updatedResult.rows[0]),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Update campaign error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating the campaign.',
    });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /:id/start - Start a campaign (admin only)
// Queries leads based on lead_filter, inserts campaign_leads, sets active
// ---------------------------------------------------------------------------
router.post('/:id/start', requirePermission('campaigns.manage'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;

    // Verify campaign exists and is in a startable status
    const campaignResult = await client.query(
      `SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (campaignResult.rows.length === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.',
      });
    }

    const campaign = campaignResult.rows[0];

    if (!['draft', 'scheduled'].includes(campaign.status)) {
      client.release();
      return res.status(400).json({
        success: false,
        message: `Campaign can only be started from "draft" or "scheduled" status. Current status: "${campaign.status}".`,
      });
    }

    // Fetch campaign brands
    const brandsResult = await client.query(
      `SELECT brand_id FROM campaign_brands WHERE campaign_id = $1`,
      [id]
    );

    if (brandsResult.rows.length === 0) {
      client.release();
      return res.status(400).json({
        success: false,
        message: 'Campaign has no brands assigned. Add brands before starting.',
      });
    }

    const campaignBrandIds = brandsResult.rows.map((r) => r.brand_id);

    // Build dynamic lead query based on lead_filter (JSONB)
    const leadFilter = campaign.lead_filter || {};
    const leadConditions = [`l.organization_id = $1`];
    const leadParams = [req.organizationId];
    let lpIndex = 2;

    // Filter by industries (array of strings)
    if (leadFilter.industries && Array.isArray(leadFilter.industries) && leadFilter.industries.length > 0) {
      leadConditions.push(`l.industry = ANY($${lpIndex++})`);
      leadParams.push(leadFilter.industries);
    }

    // Filter by lead types (array of strings)
    if (leadFilter.leadTypes && Array.isArray(leadFilter.leadTypes) && leadFilter.leadTypes.length > 0) {
      leadConditions.push(`l.lead_type = ANY($${lpIndex++})`);
      leadParams.push(leadFilter.leadTypes);
    }

    // Filter by date range
    if (leadFilter.dateFrom) {
      leadConditions.push(`l.created_at >= $${lpIndex++}`);
      leadParams.push(leadFilter.dateFrom);
    }

    if (leadFilter.dateTo) {
      leadConditions.push(`l.created_at <= $${lpIndex++}`);
      leadParams.push(leadFilter.dateTo);
    }

    // Filter by brand - if specified in filter, use that; otherwise use all campaign brands
    if (leadFilter.brandId) {
      leadConditions.push(`l.brand_id = $${lpIndex++}`);
      leadParams.push(leadFilter.brandId);
    } else {
      leadConditions.push(`l.brand_id = ANY($${lpIndex++})`);
      leadParams.push(campaignBrandIds);
    }

    // Exclude unsubscribed leads
    leadConditions.push(`l.unsubscribed = false`);

    const leadWhere = leadConditions.length > 0 ? `WHERE ${leadConditions.join(' AND ')}` : '';

    const leadsResult = await client.query(
      `SELECT l.id, l.brand_id FROM leads l ${leadWhere}`,
      leadParams
    );

    if (leadsResult.rows.length === 0) {
      client.release();
      return res.status(400).json({
        success: false,
        message: 'No leads match the campaign filter criteria.',
      });
    }

    await client.query('BEGIN');

    // For each lead x brand combo, insert into campaign_leads with status='pending'
    // If lead_filter has a specific brandId, pair each lead with that brand only.
    // Otherwise, pair each lead with its own brand_id from the leads table
    // (since leads are already filtered to campaign brands).
    let insertedCount = 0;

    for (const lead of leadsResult.rows) {
      await client.query(
        `INSERT INTO campaign_leads (campaign_id, lead_id, brand_id, status, followup_stage)
         VALUES ($1, $2, $3, 'pending', 0)
         ON CONFLICT DO NOTHING`,
        [id, lead.id, lead.brand_id]
      );
      insertedCount++;
    }

    // Update campaign status to active
    await client.query(
      `UPDATE campaigns SET status = 'active', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    await client.query('COMMIT');

    // If send_time_optimization is enabled, stagger queued leads to optimal windows
    if (campaign.send_time_optimization) {
      try {
        const adjusted = await adjustCampaignSchedule(id);
        logger.info('Send-time optimization applied', { campaignId: id, adjusted });
      } catch (optiErr) {
        logger.warn('Send-time optimization failed (non-fatal)', { error: optiErr.message, campaignId: id });
      }
    }

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'campaign.start',
      targetType: 'campaign',
      targetId: id,
      description: `Admin started campaign "${campaign.name}" with ${insertedCount} leads`,
      metadata: { campaignName: campaign.name, leadsEnrolled: insertedCount },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Campaign started', {
      campaignId: id,
      leadsEnrolled: insertedCount,
      startedBy: req.user.id,
    });

    return res.json({
      success: true,
      message: `Campaign started with ${insertedCount} leads enrolled.`,
      data: {
        campaignId: id,
        status: 'active',
        leadsEnrolled: insertedCount,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Start campaign error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while starting the campaign.',
    });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// POST /:id/pause - Pause a campaign (admin only)
// ---------------------------------------------------------------------------
router.post('/:id/pause', requirePermission('campaigns.manage'), async (req, res) => {
  try {
    const { id } = req.params;

    const campaignResult = await db.query(
      `SELECT id, name, status FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.',
      });
    }

    const campaign = campaignResult.rows[0];

    if (campaign.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Campaign can only be paused when active. Current status: "${campaign.status}".`,
      });
    }

    await db.query(
      `UPDATE campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'campaign.pause',
      targetType: 'campaign',
      targetId: id,
      description: `Admin paused campaign "${campaign.name}"`,
      metadata: { campaignName: campaign.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Campaign paused', { campaignId: id, pausedBy: req.user.id });

    return res.json({
      success: true,
      message: `Campaign "${campaign.name}" has been paused.`,
      data: { campaignId: id, status: 'paused' },
    });
  } catch (err) {
    logger.error('Pause campaign error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while pausing the campaign.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/resume - Resume a paused campaign (admin only)
// ---------------------------------------------------------------------------
router.post('/:id/resume', requirePermission('campaigns.manage'), async (req, res) => {
  try {
    const { id } = req.params;

    const campaignResult = await db.query(
      `SELECT id, name, status FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.',
      });
    }

    const campaign = campaignResult.rows[0];

    if (campaign.status !== 'paused') {
      return res.status(400).json({
        success: false,
        message: `Campaign can only be resumed when paused. Current status: "${campaign.status}".`,
      });
    }

    await db.query(
      `UPDATE campaigns SET status = 'active', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'campaign.resume',
      targetType: 'campaign',
      targetId: id,
      description: `Admin resumed campaign "${campaign.name}"`,
      metadata: { campaignName: campaign.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Campaign resumed', { campaignId: id, resumedBy: req.user.id });

    return res.json({
      success: true,
      message: `Campaign "${campaign.name}" has been resumed.`,
      data: { campaignId: id, status: 'active' },
    });
  } catch (err) {
    logger.error('Resume campaign error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while resuming the campaign.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/cancel - Cancel a campaign (admin only)
// ---------------------------------------------------------------------------
router.post('/:id/cancel', requirePermission('campaigns.manage'), async (req, res) => {
  try {
    const { id } = req.params;

    const campaignResult = await db.query(
      `SELECT id, name, status FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.',
      });
    }

    const campaign = campaignResult.rows[0];

    if (['cancelled', 'completed'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        message: `Campaign is already "${campaign.status}" and cannot be cancelled.`,
      });
    }

    await db.query(
      `UPDATE campaigns SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'campaign.cancel',
      targetType: 'campaign',
      targetId: id,
      description: `Admin cancelled campaign "${campaign.name}"`,
      metadata: { campaignName: campaign.name, previousStatus: campaign.status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Campaign cancelled', { campaignId: id, cancelledBy: req.user.id });

    return res.json({
      success: true,
      message: `Campaign "${campaign.name}" has been cancelled.`,
      data: { campaignId: id, status: 'cancelled' },
    });
  } catch (err) {
    logger.error('Cancel campaign error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while cancelling the campaign.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/leads - List leads for a campaign with filtering, pagination
// ---------------------------------------------------------------------------
router.get('/:id/leads', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify campaign exists
    const campaignCheck = await db.query(
      `SELECT id FROM campaigns WHERE id = $1`,
      [id]
    );

    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.',
      });
    }

    const { status } = req.query;
    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 50;
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    const conditions = [`cl.campaign_id = $1`];
    const params = [id];
    let paramIndex = 2;

    if (status) {
      if (VALID_LEAD_STATUSES.includes(status)) {
        conditions.push(`cl.status = $${paramIndex++}`);
        params.push(status);
      }
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM campaign_leads cl ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit) || 1;

    // Data
    const offset = (page - 1) * limit;
    const dataResult = await db.query(
      `SELECT cl.id AS campaign_lead_id, cl.status AS campaign_status,
              cl.followup_stage, cl.last_sent_at, cl.next_followup_at,
              cl.ab_variant_id, cl.brand_id,
              l.id AS lead_id, l.full_name, l.email, l.phone,
              l.lead_type, l.industry, l.status AS lead_status,
              b.name AS brand_name
       FROM campaign_leads cl
       JOIN leads l ON l.id = cl.lead_id
       LEFT JOIN brands b ON b.id = cl.brand_id
       ${whereClause}
       ORDER BY cl.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        leads: dataResult.rows,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    logger.error('List campaign leads error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing campaign leads.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id - Delete a draft campaign (admin only)
// Deletes campaign_brands, campaign_leads, then campaign
// ---------------------------------------------------------------------------
router.delete('/:id', requirePermission('campaigns.manage'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;

    // Verify campaign exists and is draft
    const campaignResult = await client.query(
      `SELECT id, name, status FROM campaigns WHERE id = $1`,
      [id]
    );

    if (campaignResult.rows.length === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.',
      });
    }

    const campaign = campaignResult.rows[0];

    if (campaign.status !== 'draft') {
      client.release();
      return res.status(400).json({
        success: false,
        message: `Only draft campaigns can be deleted. Current status: "${campaign.status}".`,
      });
    }

    await client.query('BEGIN');

    // Delete related records first (foreign key order)
    await client.query(`DELETE FROM campaign_brands WHERE campaign_id = $1`, [id]);
    await client.query(`DELETE FROM campaign_leads WHERE campaign_id = $1`, [id]);
    await client.query(`DELETE FROM campaigns WHERE id = $1`, [id]);

    await client.query('COMMIT');

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'campaign.delete',
      targetType: 'campaign',
      targetId: id,
      description: `Admin deleted draft campaign "${campaign.name}"`,
      metadata: { campaignName: campaign.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Campaign deleted', { campaignId: id, deletedBy: req.user.id });

    return res.json({
      success: true,
      message: `Campaign "${campaign.name}" has been deleted.`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Delete campaign error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deleting the campaign.',
    });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /:id/send-time-recommendation — optimal send windows for this campaign
// ---------------------------------------------------------------------------
router.get('/:id/send-time-recommendation', async (req, res) => {
  try {
    const { id } = req.params;

    const campaignResult = await db.query(
      `SELECT c.id,
              (SELECT brand_id FROM campaign_brands WHERE campaign_id = c.id LIMIT 1) AS brand_id
       FROM campaigns c
       WHERE c.id = $1 AND c.organization_id = $2`,
      [id, req.organizationId]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }

    const { brand_id: brandId } = campaignResult.rows[0];
    const windows = await getOptimalSendWindows(req.organizationId, brandId);

    return res.json({ success: true, data: windows });
  } catch (err) {
    logger.error('Send-time recommendation error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch send-time recommendation.' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/sequence — returns all sequence steps for a campaign
// ---------------------------------------------------------------------------
router.get('/:id/sequence', async (req, res) => {
  try {
    const { id } = req.params;

    const campaignCheck = await db.query(
      `SELECT id FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }

    const result = await db.query(
      `SELECT id, campaign_id, parent_step_id, step_order, step_type,
              condition_type, condition_value, delay_days, delay_hours,
              template_id, subject_override, branch_label,
              position_x, position_y, is_active, created_at, updated_at
       FROM sequence_steps
       WHERE campaign_id = $1
       ORDER BY step_order ASC`,
      [id]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Get sequence steps error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch sequence steps.' });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/sequence — creates/replaces all sequence steps for a campaign
// Accepts body: { steps: [ { stepOrder, stepType, conditionType, delayDays,
//   delayHours, templateId, subjectOverride, parentStepId, branchLabel } ] }
// ---------------------------------------------------------------------------
router.post('/:id/sequence', requirePermission('campaigns.manage'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { steps } = req.body;

    if (!Array.isArray(steps)) {
      return res.status(400).json({ success: false, message: 'Body must contain a "steps" array.' });
    }

    const campaignCheck = await client.query(
      `SELECT id FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (campaignCheck.rows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }

    await client.query('BEGIN');

    // Delete existing steps
    await client.query(`DELETE FROM sequence_steps WHERE campaign_id = $1`, [id]);

    const inserted = [];
    for (const step of steps) {
      const r = await client.query(
        `INSERT INTO sequence_steps
          (campaign_id, parent_step_id, step_order, step_type, condition_type,
           condition_value, delay_days, delay_hours, template_id,
           subject_override, branch_label, position_x, position_y, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          id,
          step.parentStepId || null,
          step.stepOrder ?? 0,
          step.stepType || 'email',
          step.conditionType || 'no_action',
          step.conditionValue || null,
          step.delayDays ?? 0,
          step.delayHours ?? 0,
          step.templateId || null,
          step.subjectOverride || null,
          step.branchLabel || null,
          step.positionX ?? 0,
          step.positionY ?? 0,
          step.isActive !== false,
        ]
      );
      inserted.push(r.rows[0]);
    }

    // Enable sequences on the campaign
    await client.query(
      `UPDATE campaigns SET use_sequences = TRUE, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    logger.info('Sequence steps saved', { campaignId: id, stepCount: inserted.length, savedBy: req.user.id });

    return res.json({ success: true, data: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Save sequence steps error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to save sequence steps.' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /:id/sequence/:stepId — update a single sequence step
// ---------------------------------------------------------------------------
router.put('/:id/sequence/:stepId', requirePermission('campaigns.manage'), async (req, res) => {
  try {
    const { id, stepId } = req.params;

    const campaignCheck = await db.query(
      `SELECT id FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }

    const stepCheck = await db.query(
      `SELECT id FROM sequence_steps WHERE id = $1 AND campaign_id = $2`,
      [stepId, id]
    );

    if (stepCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sequence step not found.' });
    }

    const {
      stepOrder, stepType, conditionType, conditionValue,
      delayDays, delayHours, templateId, subjectOverride,
      branchLabel, parentStepId, positionX, positionY, isActive,
    } = req.body;

    const setClauses = [];
    const params = [];
    let idx = 1;

    if (stepOrder !== undefined) { setClauses.push(`step_order = $${idx++}`); params.push(stepOrder); }
    if (stepType !== undefined) { setClauses.push(`step_type = $${idx++}`); params.push(stepType); }
    if (conditionType !== undefined) { setClauses.push(`condition_type = $${idx++}`); params.push(conditionType); }
    if (conditionValue !== undefined) { setClauses.push(`condition_value = $${idx++}`); params.push(conditionValue); }
    if (delayDays !== undefined) { setClauses.push(`delay_days = $${idx++}`); params.push(delayDays); }
    if (delayHours !== undefined) { setClauses.push(`delay_hours = $${idx++}`); params.push(delayHours); }
    if (templateId !== undefined) { setClauses.push(`template_id = $${idx++}`); params.push(templateId); }
    if (subjectOverride !== undefined) { setClauses.push(`subject_override = $${idx++}`); params.push(subjectOverride); }
    if (branchLabel !== undefined) { setClauses.push(`branch_label = $${idx++}`); params.push(branchLabel); }
    if (parentStepId !== undefined) { setClauses.push(`parent_step_id = $${idx++}`); params.push(parentStepId); }
    if (positionX !== undefined) { setClauses.push(`position_x = $${idx++}`); params.push(positionX); }
    if (positionY !== undefined) { setClauses.push(`position_y = $${idx++}`); params.push(positionY); }
    if (isActive !== undefined) { setClauses.push(`is_active = $${idx++}`); params.push(isActive); }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update.' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(stepId);

    const result = await db.query(
      `UPDATE sequence_steps SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Update sequence step error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to update sequence step.' });
  }
});

module.exports = router;
