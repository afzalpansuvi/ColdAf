'use strict';

const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { tenantScope } = require('../middleware/tenantScope');
const { runFullCheck } = require('../services/deliverabilityChecker');

const router = express.Router();

// All deliverability routes require auth + tenant scope + admin role
// (matches the pattern used in smtp.js)
router.use(authenticate);
router.use(tenantScope);
router.use(requireRole('admin'));

// ---------------------------------------------------------------------------
// GET /:id/deliverability — latest check for this SMTP account
// ---------------------------------------------------------------------------
router.get('/:id/deliverability', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify account belongs to this organisation
    const accountCheck = await db.query(
      `SELECT id, email_address FROM smtp_accounts WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'SMTP account not found.' });
    }

    const result = await db.query(
      `SELECT * FROM smtp_deliverability_checks
       WHERE smtp_account_id = $1
       ORDER BY checked_at DESC
       LIMIT 1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      data: {
        id: row.id,
        smtpAccountId: row.smtp_account_id,
        checkedAt: row.checked_at,
        spf: row.spf_valid,
        dkim: row.dkim_valid,
        dmarc: row.dmarc_valid,
        spfRecord: row.spf_record,
        dmarcRecord: row.dmarc_record,
        blacklist: row.blacklist_status,
        spamScore: row.spam_score != null ? parseFloat(row.spam_score) : null,
        spamLevel: row.spam_level,
        spamFlags: row.spam_flags,
      },
    });
  } catch (err) {
    logger.error('Get deliverability check error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the deliverability check.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/deliverability/check — trigger a new deliverability check
// ---------------------------------------------------------------------------
router.post('/:id/deliverability/check', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify account belongs to this organisation
    const accountCheck = await db.query(
      `SELECT id, email_address FROM smtp_accounts WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'SMTP account not found.' });
    }

    const checkResult = await runFullCheck(id, req.organizationId);

    return res.json({ success: true, data: checkResult });
  } catch (err) {
    logger.error('Run deliverability check error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while running the deliverability check.',
    });
  }
});

module.exports = router;
