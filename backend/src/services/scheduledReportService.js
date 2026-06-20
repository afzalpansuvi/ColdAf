const db = require('../config/database');
const logger = require('../utils/logger');
const emailSender = require('./emailSender');

/**
 * Scheduled Report Service
 *
 * Generates and sends white-label client reports on recurring schedules.
 * Addresses TABLE-STAKES #3 from competitive research (quick win, no competitor has it).
 */

class ScheduledReportService {
  /**
   * Process all due reports and send them.
   * Called by the scheduler worker.
   */
  async processDueReports() {
    logger.debug('Processing due scheduled reports...');

    const dueReports = await db.query(
      `SELECT * FROM scheduled_reports
       WHERE is_active = TRUE
         AND next_send_at <= NOW()`
    );

    let sentCount = 0;
    let failedCount = 0;

    for (const report of dueReports.rows) {
      try {
        await this.sendReport(report);
        sentCount++;
      } catch (err) {
        failedCount++;
        logger.error('Scheduled report failed', { reportId: report.id, error: err.message });
      }
    }

    logger.info('Scheduled reports processed', { sent: sentCount, failed: failedCount });
    return { sent: sentCount, failed: failedCount };
  }

  /**
   * Generate and send a single report.
   */
  async sendReport(report) {
    logger.info('Generating scheduled report', { reportId: report.id, type: report.report_type });

    // Generate report data based on type
    const reportData = await this.generateReportData(report);

    // Generate PDF/CSV content (placeholder - in production would use a PDF library)
    const fileContent = JSON.stringify(reportData, null, 2);
    const fileName = `report-${report.id}-${Date.now()}.json`;

    // Send to each recipient
    for (const email of report.recipient_emails) {
      try {
        await this.deliverReport(report, email, fileContent, fileName);
      } catch (err) {
        logger.error('Report delivery failed', { reportId: report.id, email, error: err.message });
      }
    }

    // Update report status
    const nextSendAt = this.calculateNextSend(
      report.frequency,
      report.day_of_week,
      report.day_of_month,
      report.send_time,
      report.timezone
    );

    await db.query(
      `UPDATE scheduled_reports
       SET last_sent_at = NOW(),
           last_sent_status = 'sent',
           next_send_at = $1,
           send_count = send_count + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [nextSendAt, report.id]
    );

    logger.info('Scheduled report sent', { reportId: report.id, recipients: report.recipient_emails.length });
  }

  /**
   * Generate report data based on report type.
   */
  async generateReportData(report) {
    const orgId = report.organization_id;
    const dateRange = this.getDateRange(report.filter_date_range, report.filter_date_from, report.filter_date_to);

    switch (report.report_type) {
      case 'campaign_summary':
        return this.generateCampaignSummary(orgId, dateRange, report.filter_campaign_ids);
      case 'brand_performance':
        return this.generateBrandPerformance(orgId, dateRange, report.filter_brand_ids);
      case 'smtp_health':
        return this.generateSmtpHealth(orgId);
      case 'lead_activity':
        return this.generateLeadActivity(orgId, dateRange);
      case 'replies':
        return this.generateRepliesReport(orgId, dateRange);
      default:
        return this.generateCampaignSummary(orgId, dateRange);
    }
  }

  /**
   * Generate campaign summary report.
   */
  async generateCampaignSummary(orgId, dateRange, campaignIds) {
    let campaignFilter = '';
    const params = [orgId, dateRange.from, dateRange.to];

    if (campaignIds && campaignIds.length > 0) {
      campaignFilter = `AND c.id = ANY($4::uuid[])`;
      params.push(campaignIds);
    }

    const campaigns = await db.query(
      `SELECT c.id, c.name, c.status, c.created_at,
              COUNT(DISTINCT cl.lead_id) AS leads_count,
              COUNT(DISTINCT es.id) FILTER (WHERE es.status != 'pending') AS emails_sent,
              COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL) AS opens,
              COUNT(DISTINCT es.id) FILTER (WHERE es.clicked_at IS NOT NULL) AS clicks,
              COUNT(DISTINCT es.id) FILTER (WHERE es.replied_at IS NOT NULL) AS replies,
              COUNT(DISTINCT es.id) FILTER (WHERE es.bounced_at IS NOT NULL) AS bounces
       FROM campaigns c
       LEFT JOIN campaign_leads cl ON c.id = cl.campaign_id
       LEFT JOIN emails_sent es ON c.id = es.campaign_id AND es.sent_at BETWEEN $2 AND $3
       WHERE c.organization_id = $1 ${campaignFilter}
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      params
    );

    const totals = await db.query(
      `SELECT
         COUNT(DISTINCT es.id) FILTER (WHERE es.status != 'pending') AS total_sent,
         COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL) AS total_opens,
         COUNT(DISTINCT es.id) FILTER (WHERE es.clicked_at IS NOT NULL) AS total_clicks,
         COUNT(DISTINCT es.id) FILTER (WHERE es.replied_at IS NOT NULL) AS total_replies,
         COUNT(DISTINCT es.id) FILTER (WHERE es.bounced_at IS NOT NULL) AS total_bounces
       FROM emails_sent es
       WHERE es.organization_id = $1 AND es.sent_at BETWEEN $2 AND $3`,
      [orgId, dateRange.from, dateRange.to]
    );

    return {
      type: 'campaign_summary',
      generated_at: new Date().toISOString(),
      date_range: dateRange,
      summary: totals.rows[0],
      campaigns: campaigns.rows,
    };
  }

  /**
   * Generate brand performance report.
   */
  async generateBrandPerformance(orgId, dateRange, brandIds) {
    let brandFilter = '';
    const params = [orgId, dateRange.from, dateRange.to];

    if (brandIds && brandIds.length > 0) {
      brandFilter = `AND b.id = ANY($4::uuid[])`;
      params.push(brandIds);
    }

    const brands = await db.query(
      `SELECT b.id, b.name, b.primary_domain,
              COUNT(DISTINCT c.id) AS campaigns,
              COUNT(DISTINCT sa.id) AS smtp_accounts,
              COUNT(DISTINCT es.id) FILTER (WHERE es.status != 'pending') AS emails_sent,
              COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL) AS opens,
              COUNT(DISTINCT es.id) FILTER (WHERE es.replied_at IS NOT NULL) AS replies
       FROM brands b
       LEFT JOIN campaigns c ON b.id = ANY(c.brand_ids) AND c.organization_id = $1
       LEFT JOIN smtp_accounts sa ON b.id = sa.brand_id AND sa.organization_id = $1
       LEFT JOIN emails_sent es ON es.organization_id = $1 AND es.sent_at BETWEEN $2 AND $3
       WHERE b.organization_id = $1 ${brandFilter}
       GROUP BY b.id
       ORDER BY emails_sent DESC`,
      params
    );

    return {
      type: 'brand_performance',
      generated_at: new Date().toISOString(),
      date_range: dateRange,
      brands: brands.rows,
    };
  }

  /**
   * Generate SMTP health report.
   */
  async generateSmtpHealth(orgId) {
    const accounts = await db.query(
      `SELECT id, email_address, display_name, provider, health_status,
              last_health_check_at, daily_emails_sent, daily_emails_limit,
              bounce_count, spam_count, warmup_score
       FROM smtp_accounts
       WHERE organization_id = $1
       ORDER BY health_status DESC, email_address`,
      [orgId]
    );

    return {
      type: 'smtp_health',
      generated_at: new Date().toISOString(),
      accounts: accounts.rows,
    };
  }

  /**
   * Generate lead activity report.
   */
  async generateLeadActivity(orgId, dateRange) {
    const leads = await db.query(
      `SELECT l.id, l.email, l.first_name, l.last_name, l.company, l.status,
              COUNT(DISTINCT es.id) AS emails_received,
              COUNT(DISTINCT es.id) FILTER (WHERE es.opened_at IS NOT NULL) AS opens,
              COUNT(DISTINCT es.id) FILTER (WHERE es.replied_at IS NOT NULL) AS replies,
              MAX(es.sent_at) AS last_email_at
       FROM leads l
       LEFT JOIN emails_sent es ON l.id = es.lead_id AND es.sent_at BETWEEN $2 AND $3
       WHERE l.organization_id = $1
       GROUP BY l.id
       ORDER BY emails_received DESC
       LIMIT 100`,
      [orgId, dateRange.from, dateRange.to]
    );

    return {
      type: 'lead_activity',
      generated_at: new Date().toISOString(),
      date_range: dateRange,
      leads: leads.rows,
    };
  }

  /**
   * Generate replies report.
   */
  async generateRepliesReport(orgId, dateRange) {
    const replies = await db.query(
      `SELECT rm.id, rm.lead_id, l.email, l.first_name, l.last_name,
              rm.subject, rm.body_text, rm.sentiment, rm.status,
              rm.created_at, c.name AS campaign_name
       FROM reply_messages rm
       JOIN leads l ON rm.lead_id = l.id
       LEFT JOIN campaigns c ON rm.campaign_id = c.id
       WHERE rm.organization_id = $1
         AND rm.created_at BETWEEN $2 AND $3
       ORDER BY rm.created_at DESC
       LIMIT 100`,
      [orgId, dateRange.from, dateRange.to]
    );

    return {
      type: 'replies',
      generated_at: new Date().toISOString(),
      date_range: dateRange,
      replies: replies.rows,
    };
  }

  /**
   * Deliver a report to a recipient.
   */
  async deliverReport(report, recipientEmail, fileContent, fileName) {
    const subject = report.white_label_enabled
      ? `${report.name}`
      : `[ColdAF] ${report.name}`;

    const body = report.white_label_enabled
      ? `Your scheduled report is attached.\n\nThis report was generated automatically.`
      : `Your ColdAF scheduled report is attached.\n\nReport: ${report.name}\nType: ${report.report_type}\nFrequency: ${report.frequency}\n\nThis report was generated automatically.`;

    // In production, this would use the emailSender service with attachment
    // For now, log the delivery
    logger.info('Report delivery prepared', {
      reportId: report.id,
      recipient: recipientEmail,
      subject,
      fileName,
    });

    // Log delivery
    await db.query(
      `INSERT INTO report_delivery_logs (
         organization_id, scheduled_report_id, status, recipient_email,
         subject, file_url, file_size_bytes
       )
       VALUES ($1, $2, 'sent', $3, $4, $5, $6)`,
      [report.organization_id, report.id, recipientEmail, subject, fileName, Buffer.byteLength(fileContent)]
    );
  }

  /**
   * Get date range from filter string.
   */
  getDateRange(filterDateRange, customFrom, customTo) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filterDateRange) {
      case 'last_7_days':
        return {
          from: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
          to: now,
        };
      case 'last_30_days':
        return {
          from: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
          to: now,
        };
      case 'last_month':
        return {
          from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
        };
      case 'this_month':
        return {
          from: new Date(now.getFullYear(), now.getMonth(), 1),
          to: now,
        };
      case 'custom':
        return {
          from: customFrom ? new Date(customFrom) : new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
          to: customTo ? new Date(customTo) : now,
        };
      default:
        return {
          from: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
          to: now,
        };
    }
  }

  /**
   * Calculate next send time for a report.
   */
  calculateNextSend(frequency, dayOfWeek, dayOfMonth, sendTime, timezone) {
    const now = new Date();
    const [hours, minutes] = (sendTime || '09:00').split(':');

    let nextDate = new Date(now);
    nextDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    if (frequency === 'daily') {
      if (nextDate <= now) nextDate.setDate(nextDate.getDate() + 1);
    } else if (frequency === 'weekly') {
      const targetDay = dayOfWeek !== undefined ? dayOfWeek : 1;
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
}

module.exports = new ScheduledReportService();
