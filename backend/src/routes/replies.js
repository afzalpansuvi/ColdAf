const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const audit = require('../services/audit');
const { sendEmail } = require('../services/emailSender');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');

const router = express.Router();

// All reply routes require authentication
router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// GET / - List replies with filters and pagination
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { brand_id, campaign_id, direction, is_read, date_from, date_to } = req.query;

    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 25;
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    const conditions = ['rm.organization_id = $1'];
    const params = [req.organizationId];
    let paramIndex = 2;

    if (brand_id) {
      conditions.push(`rm.brand_id = $${paramIndex++}`);
      params.push(brand_id);
    }

    if (campaign_id) {
      conditions.push(`rm.campaign_id = $${paramIndex++}`);
      params.push(campaign_id);
    }

    if (direction && (direction === 'inbound' || direction === 'outbound')) {
      conditions.push(`rm.direction = $${paramIndex++}`);
      params.push(direction);
    }

    if (is_read !== undefined && is_read !== '') {
      const isReadBool = is_read === 'true' || is_read === '1';
      conditions.push(`rm.is_read = $${paramIndex++}`);
      params.push(isReadBool);
    }

    if (date_from) {
      conditions.push(`rm.created_at >= $${paramIndex++}`);
      params.push(date_from);
    }

    if (date_to) {
      conditions.push(`rm.created_at <= $${paramIndex++}`);
      params.push(date_to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM reply_messages rm ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit) || 1;

    // Data query with joins
    const offset = (page - 1) * limit;
    const dataResult = await db.query(
      `SELECT rm.id, rm.email_id, rm.lead_id, rm.campaign_id, rm.brand_id,
              rm.smtp_account_id, rm.direction, rm.from_email, rm.to_email,
              rm.subject, rm.body_html, rm.body_text, rm.message_id,
              rm.in_reply_to, rm.sent_by_user_id, rm.is_read, rm.sentiment,
              rm.suggested_response, rm.created_at,
              l.full_name AS lead_name, l.email AS lead_email,
              b.name AS brand_name
       FROM reply_messages rm
       LEFT JOIN leads l ON l.id = rm.lead_id
       LEFT JOIN brands b ON b.id = rm.brand_id
       ${whereClause}
       ORDER BY rm.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const replies = dataResult.rows.map((r) => ({
      id: r.id,
      emailId: r.email_id,
      leadId: r.lead_id,
      campaignId: r.campaign_id,
      brandId: r.brand_id,
      smtpAccountId: r.smtp_account_id,
      direction: r.direction,
      fromEmail: r.from_email,
      toEmail: r.to_email,
      subject: r.subject,
      bodyHtml: r.body_html,
      bodyText: r.body_text,
      messageId: r.message_id,
      inReplyTo: r.in_reply_to,
      sentByUserId: r.sent_by_user_id,
      isRead: r.is_read,
      sentiment: r.sentiment,
      suggestedResponse: r.suggested_response,
      createdAt: r.created_at,
      leadName: r.lead_name,
      leadEmail: r.lead_email,
      brandName: r.brand_name,
    }));

    return res.json({
      success: true,
      data: {
        replies,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    logger.error('List replies error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing replies.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /unread-count - Return count of unread inbound replies
// ---------------------------------------------------------------------------
router.get('/unread-count', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM reply_messages
       WHERE direction = 'inbound' AND is_read = FALSE AND organization_id = $1`,
      [req.organizationId]
    );

    return res.json({
      success: true,
      data: { unreadCount: result.rows[0].count },
    });
  } catch (err) {
    logger.error('Unread count error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching unread count.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /thread/:leadId - Get full conversation thread for a lead
// ---------------------------------------------------------------------------
router.get('/thread/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;

    // Verify the lead exists within this organization
    const leadCheck = await db.query(
      `SELECT id, full_name, email FROM leads WHERE id = $1 AND organization_id = $2`,
      [leadId, req.organizationId]
    );

    if (leadCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found.',
      });
    }

    const lead = leadCheck.rows[0];

    // Fetch original outbound emails sent to this lead
    const emailsSentResult = await db.query(
      `SELECT es.id, es.campaign_id, es.brand_id, es.smtp_account_id,
              es.subject, es.body_html, es.body_text, es.message_id,
              es.status, es.sent_at, es.opened_at, es.clicked_at, es.replied_at,
              b.name AS brand_name,
              sa.email_address AS from_email
       FROM emails_sent es
       LEFT JOIN brands b ON b.id = es.brand_id
       LEFT JOIN smtp_accounts sa ON sa.id = es.smtp_account_id
       WHERE es.lead_id = $1 AND es.organization_id = $2
       ORDER BY es.sent_at ASC`,
      [leadId, req.organizationId]
    );

    // Fetch all reply messages (both inbound and outbound)
    const repliesResult = await db.query(
      `SELECT rm.id, rm.email_id, rm.campaign_id, rm.brand_id,
              rm.smtp_account_id, rm.direction, rm.from_email, rm.to_email,
              rm.subject, rm.body_html, rm.body_text, rm.message_id,
              rm.in_reply_to, rm.sent_by_user_id, rm.is_read,
              rm.sentiment, rm.suggested_response, rm.created_at,
              b.name AS brand_name
       FROM reply_messages rm
       LEFT JOIN brands b ON b.id = rm.brand_id
       WHERE rm.lead_id = $1 AND rm.organization_id = $2
       ORDER BY rm.created_at ASC`,
      [leadId, req.organizationId]
    );

    // Build a unified thread ordered by date
    const thread = [];

    // Add original emails
    for (const email of emailsSentResult.rows) {
      thread.push({
        type: 'email_sent',
        id: email.id,
        campaignId: email.campaign_id,
        brandId: email.brand_id,
        brandName: email.brand_name,
        direction: 'outbound',
        fromEmail: email.from_email,
        toEmail: lead.email,
        subject: email.subject,
        bodyHtml: email.body_html,
        bodyText: email.body_text,
        messageId: email.message_id,
        status: email.status,
        sentAt: email.sent_at,
        openedAt: email.opened_at,
        clickedAt: email.clicked_at,
        repliedAt: email.replied_at,
        date: email.sent_at,
      });
    }

    // Add reply messages
    for (const reply of repliesResult.rows) {
      thread.push({
        type: 'reply',
        id: reply.id,
        emailId: reply.email_id,
        campaignId: reply.campaign_id,
        brandId: reply.brand_id,
        brandName: reply.brand_name,
        direction: reply.direction,
        fromEmail: reply.from_email,
        toEmail: reply.to_email,
        subject: reply.subject,
        bodyHtml: reply.body_html,
        bodyText: reply.body_text,
        messageId: reply.message_id,
        inReplyTo: reply.in_reply_to,
        sentByUserId: reply.sent_by_user_id,
        isRead: reply.is_read,
        sentiment: reply.sentiment,
        suggestedResponse: reply.suggested_response,
        date: reply.created_at,
      });
    }

    // Sort the unified thread by date ascending
    thread.sort((a, b) => new Date(a.date) - new Date(b.date));

    return res.json({
      success: true,
      data: {
        lead: {
          id: lead.id,
          name: lead.full_name,
          email: lead.email,
        },
        thread,
      },
    });
  } catch (err) {
    logger.error('Get thread error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the conversation thread.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id/read - Mark a single reply as read
// ---------------------------------------------------------------------------
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE reply_messages
       SET is_read = TRUE
       WHERE id = $1 AND organization_id = $2
       RETURNING id, is_read`,
      [id, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reply not found.',
      });
    }

    return res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        isRead: result.rows[0].is_read,
      },
    });
  } catch (err) {
    logger.error('Mark reply read error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while marking the reply as read.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /mark-all-read - Mark all unread replies as read
// Optionally filtered by brand_id
// ---------------------------------------------------------------------------
router.put('/mark-all-read', async (req, res) => {
  try {
    const { brand_id } = req.query;

    let sql = `UPDATE reply_messages SET is_read = TRUE WHERE is_read = FALSE AND direction = 'inbound' AND organization_id = $1`;
    const params = [req.organizationId];
    let paramIndex = 2;

    if (brand_id) {
      sql += ` AND brand_id = $${paramIndex++}`;
      params.push(brand_id);
    }

    const result = await db.query(sql, params);

    return res.json({
      success: true,
      data: {
        updatedCount: result.rowCount,
      },
    });
  } catch (err) {
    logger.error('Mark all read error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while marking replies as read.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /send - Send a reply from the dashboard
// ---------------------------------------------------------------------------
router.post('/send', async (req, res) => {
  try {
    const { leadId, brandId, smtpAccountId, subject, bodyHtml, bodyText, inReplyTo } = req.body;

    // Validation
    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: 'leadId is required.',
      });
    }

    if (!smtpAccountId) {
      return res.status(400).json({
        success: false,
        message: 'smtpAccountId is required.',
      });
    }

    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        message: 'subject is required.',
      });
    }

    if (!bodyHtml && !bodyText) {
      return res.status(400).json({
        success: false,
        message: 'Either bodyHtml or bodyText is required.',
      });
    }

    // Fetch the lead
    const leadResult = await db.query(
      `SELECT id, full_name, email FROM leads WHERE id = $1 AND organization_id = $2`,
      [leadId, req.organizationId]
    );

    if (leadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found.',
      });
    }

    const lead = leadResult.rows[0];

    // Fetch the SMTP account with all credentials
    const smtpResult = await db.query(
      `SELECT id, brand_id, email_address, display_name, provider,
              smtp_host, smtp_port, smtp_username, smtp_password_encrypted,
              use_tls, api_key_encrypted
       FROM smtp_accounts
       WHERE id = $1 AND is_active = TRUE AND organization_id = $2`,
      [smtpAccountId, req.organizationId]
    );

    if (smtpResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SMTP account not found or is inactive.',
      });
    }

    const smtpAccount = smtpResult.rows[0];

    // Determine the campaign_id from the most recent email to this lead if available
    let campaignId = null;
    if (inReplyTo) {
      const emailLookup = await db.query(
        `SELECT campaign_id FROM emails_sent WHERE message_id = $1 AND organization_id = $2 LIMIT 1`,
        [inReplyTo, req.organizationId]
      );
      if (emailLookup.rows.length > 0) {
        campaignId = emailLookup.rows[0].campaign_id;
      }
    }

    if (!campaignId) {
      const recentEmail = await db.query(
        `SELECT campaign_id FROM emails_sent WHERE lead_id = $1 AND organization_id = $2 ORDER BY sent_at DESC LIMIT 1`,
        [leadId, req.organizationId]
      );
      if (recentEmail.rows.length > 0) {
        campaignId = recentEmail.rows[0].campaign_id;
      }
    }

    // Build custom headers for threading
    const customHeaders = {};
    if (inReplyTo) {
      customHeaders['In-Reply-To'] = inReplyTo;
      customHeaders['References'] = inReplyTo;
    }

    // Send the email
    const sendResult = await sendEmail({
      smtpAccount,
      to: lead.email,
      from: smtpAccount.email_address,
      fromName: smtpAccount.display_name,
      subject: subject.trim(),
      bodyHtml: bodyHtml || null,
      bodyText: bodyText || null,
      replyTo: smtpAccount.email_address,
      customHeaders,
    });

    if (!sendResult.success) {
      return res.status(500).json({
        success: false,
        message: `Failed to send reply: ${sendResult.error}`,
      });
    }

    // Insert into reply_messages with direction='outbound'
    const insertResult = await db.query(
      `INSERT INTO reply_messages
        (email_id, lead_id, campaign_id, brand_id, smtp_account_id,
         direction, from_email, to_email, subject, body_html, body_text,
         message_id, in_reply_to, sent_by_user_id, is_read, organization_id)
       VALUES (
         (SELECT id FROM emails_sent WHERE lead_id = $1 AND campaign_id = $2 ORDER BY sent_at DESC LIMIT 1),
         $1, $2, $3, $4, 'outbound', $5, $6, $7, $8, $9, $10, $11, $12, TRUE, $13
       )
       RETURNING id, created_at`,
      [
        leadId,
        campaignId,
        brandId || smtpAccount.brand_id || null,
        smtpAccountId,
        smtpAccount.email_address,
        lead.email,
        subject.trim(),
        bodyHtml || null,
        bodyText || null,
        sendResult.messageId || null,
        inReplyTo || null,
        req.user.id,
        req.organizationId,
      ]
    );

    const replyRecord = insertResult.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'reply.send',
      targetType: 'reply',
      targetId: replyRecord.id,
      description: `User sent reply to ${lead.email} (${lead.full_name})`,
      metadata: {
        leadId,
        leadEmail: lead.email,
        campaignId,
        brandId: brandId || smtpAccount.brand_id,
        smtpAccountId,
        subject: subject.trim(),
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Reply sent from dashboard', {
      replyId: replyRecord.id,
      leadId,
      to: lead.email,
      smtpAccountId,
      sentBy: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: replyRecord.id,
        messageId: sendResult.messageId,
        createdAt: replyRecord.created_at,
      },
    });
  } catch (err) {
    logger.error('Send reply error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while sending the reply.',
    });
  }
});

module.exports = router;
