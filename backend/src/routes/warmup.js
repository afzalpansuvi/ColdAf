const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireAdmin } = require('../middleware/rbac');
const { sanitizeBody } = require('../middleware/validation');
const warmupService = require('../services/warmupService');
const audit = require('../services/audit');

// ═══════════════════════════════════════════════════════════════
//  Warmup Campaign Routes
// ═══════════════════════════════════════════════════════════════

// GET /api/warmup — List warmup campaigns for org
router.get('/', authenticate, tenantScope, requireOrg, async (req, res) => {
  try {
    const campaigns = await warmupService.getCampaigns(req.organizationId);
    return res.json({ success: true, data: campaigns });
  } catch (err) {
    logger.error('Failed to fetch warmup campaigns', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/warmup/:id — Get single campaign with stats
router.get('/:id', authenticate, tenantScope, requireOrg, async (req, res) => {
  try {
    const campaign = await warmupService.getCampaign(req.params.id, req.organizationId);
    return res.json({ success: true, data: campaign });
  } catch (err) {
    logger.error('Failed to fetch warmup campaign', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/warmup — Create new warmup campaign
router.post('/', authenticate, tenantScope, requireOrg, requireAdmin, sanitizeBody, async (req, res) => {
  try {
    const { smtpAccountId, name, config } = req.body;

    if (!smtpAccountId) {
      return res.status(400).json({ success: false, message: 'smtpAccountId is required.' });
    }

    // Verify SMTP account belongs to this org
    const smtpCheck = await db.query(
      `SELECT id FROM smtp_accounts WHERE id = $1 AND organization_id = $2`,
      [smtpAccountId, req.organizationId]
    );
    if (smtpCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'SMTP account not found in this organization.' });
    }

    // Check if campaign already exists for this SMTP account
    const existing = await db.query(
      `SELECT id FROM warmup_campaigns WHERE smtp_account_id = $1 AND organization_id = $2`,
      [smtpAccountId, req.organizationId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A warmup campaign already exists for this SMTP account. Delete it first or use the existing one.',
      });
    }

    const campaign = await warmupService.createCampaign({
      organizationId: req.organizationId,
      smtpAccountId,
      name: name || 'Warmup Campaign',
      config,
    });

    audit.log({
      action: 'warmup.create',
      actorId: req.user.id,
      organizationId: req.organizationId,
      targetType: 'warmup_campaign',
      targetId: campaign.id,
      metadata: { smtpAccountId, name: campaign.name },
    });

    return res.status(201).json({ success: true, data: campaign });
  } catch (err) {
    logger.error('Failed to create warmup campaign', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/warmup/:id/start — Start a warmup campaign
router.post('/:id/start', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    const campaign = await warmupService.startCampaign(req.params.id, req.organizationId);
    return res.json({ success: true, data: campaign });
  } catch (err) {
    logger.error('Failed to start warmup campaign', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/warmup/:id/pause — Pause a warmup campaign
router.post('/:id/pause', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    const campaign = await warmupService.pauseCampaign(req.params.id, req.organizationId);
    return res.json({ success: true, data: campaign });
  } catch (err) {
    logger.error('Failed to pause warmup campaign', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/warmup/:id — Delete a warmup campaign
router.delete('/:id', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    const result = await warmupService.deleteCampaign(req.params.id, req.organizationId);
    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Failed to delete warmup campaign', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/warmup/stats/overview — Organization-wide warmup stats
router.get('/stats/overview', authenticate, tenantScope, requireOrg, async (req, res) => {
  try {
    const stats = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active') AS active_campaigns,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed_campaigns,
         COUNT(*) FILTER (WHERE status = 'paused') AS paused_campaigns,
         COALESCE(SUM(emails_sent_total), 0) AS total_emails_sent,
         COALESCE(SUM(emails_replied_total), 0) AS total_replies_received,
         COALESCE(AVG(health_score), 0) AS avg_health_score
       FROM warmup_campaigns
       WHERE organization_id = $1`,
      [req.organizationId]
    );

    return res.json({ success: true, data: stats.rows[0] });
  } catch (err) {
    logger.error('Failed to fetch warmup stats', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
