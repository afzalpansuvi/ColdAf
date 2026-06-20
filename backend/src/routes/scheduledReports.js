const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireAdmin } = require('../middleware/rbac');
const { sanitizeBody } = require('../middleware/validation');
const audit = require('../services/audit');

// ═══════════════════════════════════════════════════════════════
//  Scheduled Reports Routes
// ═══════════════════════════════════════════════════════════════

// GET /api/reports/scheduled — List scheduled reports
router.get('/', authenticate, tenantScope, requireOrg, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, description, report_type, frequency, send_time,
              format, is_active, last_sent_at, next_send_at, send_count,
              white_label_enabled, recipient_emails
       FROM scheduled_reports
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [req.organizationId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Scheduled reports fetch failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/reports/scheduled — Create scheduled report
router.post('/', authenticate, tenantScope, requireOrg, requireAdmin, sanitizeBody, async (req, res) => {
  try {
    const {
      name, description, reportType, frequency, dayOfWeek, dayOfMonth,
      sendTime, timezone, recipientEmails, format,
      whiteLabelEnabled, whiteLabelLogoUrl, whiteLabelPrimaryColor,
      filterBrandIds, filterCampaignIds, filterDateRange,
    } = req.body;

    if (!name || !reportType || !frequency) {
      return res.status(400).json({ success: false, message: 'name, reportType, and frequency are required.' });
    }

    // Calculate next send time
    const nextSendAt = calculateNextSend(frequency, dayOfWeek, dayOfMonth, sendTime, timezone);

    const result = await db.query(
      `INSERT INTO scheduled_reports (
         organization_id, created_by, name, description, report_type,
         frequency, day_of_week, day_of_month, send_time, timezone,
         recipient_emails, format, filter_brand_ids, filter_campaign_ids,
         filter_date_range, white_label_enabled, white_label_logo_url,
         white_label_primary_color, next_send_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        req.organizationId, req.user.id, name, description, reportType,
        frequency, dayOfWeek, dayOfMonth, sendTime || '09:00:00', timezone || 'UTC',
        recipientEmails || [], format || 'pdf', filterBrandIds || [], filterCampaignIds || [],
        filterDateRange || 'last_7_days', whiteLabelEnabled || false, whiteLabelLogoUrl,
        whiteLabelPrimaryColor || '#3B82F6', nextSendAt,
      ]
    );

    audit.log({
      action: 'report.schedule.create',
      actorId: req.user.id,
      organizationId: req.organizationId,
      targetType: 'scheduled_report',
      targetId: result.rows[0].id,
    });

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Scheduled report creation failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/reports/scheduled/:id — Update scheduled report
router.put('/:id', authenticate, tenantScope, requireOrg, requireAdmin, sanitizeBody, async (req, res) => {
  try {
    const updates = req.body;
    const allowedFields = [
      'name', 'description', 'report_type', 'frequency', 'day_of_week',
      'day_of_month', 'send_time', 'timezone', 'recipient_emails', 'format',
      'is_active', 'white_label_enabled', 'white_label_logo_url',
      'white_label_primary_color', 'filter_brand_ids', 'filter_campaign_ids',
      'filter_date_range',
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update.' });
    }

    // Recalculate next send if schedule changed
    if (updates.frequency || updates.day_of_week || updates.day_of_month || updates.send_time) {
      const current = await db.query(
        `SELECT frequency, day_of_week, day_of_month, send_time, timezone
         FROM scheduled_reports WHERE id = $1 AND organization_id = $2`,
        [req.params.id, req.organizationId]
      );
      if (current.rows.length > 0) {
        const report = current.rows[0];
        const nextSendAt = calculateNextSend(
          updates.frequency || report.frequency,
          updates.day_of_week !== undefined ? updates.day_of_week : report.day_of_week,
          updates.day_of_month !== undefined ? updates.day_of_month : report.day_of_month,
          updates.send_time || report.send_time,
          updates.timezone || report.timezone
        );
        setClauses.push(`next_send_at = $${paramIndex}`);
        values.push(nextSendAt);
        paramIndex++;
      }
    }

    setClauses.push('updated_at = NOW()');
    values.push(req.params.id, req.organizationId);

    const result = await db.query(
      `UPDATE scheduled_reports
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Scheduled report update failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/reports/scheduled/:id — Delete scheduled report
router.delete('/:id', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM scheduled_reports WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [req.params.id, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    return res.json({ success: true, message: 'Scheduled report deleted.' });
  } catch (err) {
    logger.error('Scheduled report deletion failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/reports/scheduled/:id/send-now — Send report immediately
router.post('/:id/send-now', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    const report = await db.query(
      `SELECT * FROM scheduled_reports WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.organizationId]
    );

    if (report.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    const reportService = require('../services/scheduledReportService');
    await reportService.sendReport(report.rows[0]);

    return res.json({ success: true, message: 'Report sent.' });
  } catch (err) {
    logger.error('Report send now failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/scheduled/:id/delivery-logs — Get delivery history
router.get('/:id/delivery-logs', authenticate, tenantScope, requireOrg, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, sent_at, status, recipient_email, file_url, file_size_bytes
       FROM report_delivery_logs
       WHERE scheduled_report_id = $1 AND organization_id = $2
       ORDER BY sent_at DESC
       LIMIT 50`,
      [req.params.id, req.organizationId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Delivery logs fetch failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Utility: Calculate next send time
function calculateNextSend(frequency, dayOfWeek, dayOfMonth, sendTime, timezone) {
  const now = new Date();
  const [hours, minutes] = (sendTime || '09:00').split(':');

  let nextDate = new Date(now);
  nextDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  if (frequency === 'daily') {
    if (nextDate <= now) nextDate.setDate(nextDate.getDate() + 1);
  } else if (frequency === 'weekly') {
    const targetDay = dayOfWeek !== undefined ? dayOfWeek : 1; // Monday default
    const daysUntilTarget = (targetDay - now.getDay() + 7) % 7;
    nextDate.setDate(now.getDate() + daysUntilTarget);
    if (nextDate <= now) nextDate.setDate(nextDate.getDate() + 7);
  } else if (frequency === 'biweekly') {
    const targetDay = dayOfWeek !== undefined ? dayOfWeek : 1;
    const daysUntilTarget = (targetDay - now.getDay() + 7) % 7;
    nextDate.setDate(now.getDate() + daysUntilTarget);
    if (nextDate <= now) nextDate.setDate(nextDate.getDate() + 14);
  } else if (frequency === 'monthly') {
    const targetDay = dayOfMonth !== undefined ? dayOfMonth : 1;
    nextDate.setDate(targetDay);
    if (nextDate <= now) nextDate.setMonth(nextDate.getMonth() + 1);
  }

  return nextDate;
}

module.exports = router;
