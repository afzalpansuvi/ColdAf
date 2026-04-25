const express = require('express');
const nodemailer = require('nodemailer');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const audit = require('../services/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { createNotification } = require('../services/notifications');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');

const router = express.Router();

// All SMTP routes require authentication + admin role
router.use(authenticate);
router.use(tenantScope);
router.use(requireRole('admin'));

// Masked placeholder used for password fields in responses and update detection
const MASKED_VALUE = '*****';

// ---------------------------------------------------------------------------
// GET /health-summary - Count of healthy, degraded, failed, unknown accounts
// (defined before /:id to avoid route collision)
// ---------------------------------------------------------------------------
router.get('/health-summary', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE health_status = 'healthy')::int  AS healthy,
        COUNT(*) FILTER (WHERE health_status = 'degraded')::int AS degraded,
        COUNT(*) FILTER (WHERE health_status = 'failed')::int   AS failed,
        COUNT(*) FILTER (WHERE health_status IS NULL OR health_status NOT IN ('healthy', 'degraded', 'failed'))::int AS unknown
      FROM smtp_accounts
      WHERE organization_id = $1
        AND (is_active = TRUE OR health_status IN ('degraded', 'failed'))
    `, [req.organizationId]);

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    logger.error('SMTP health summary error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the health summary.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET / - List all SMTP accounts (joined with brand name)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT sa.id, sa.brand_id, b.name AS brand_name,
             sa.email_address, sa.display_name, sa.provider,
             sa.smtp_host, sa.smtp_port, sa.smtp_username, sa.use_tls,
             sa.imap_host, sa.imap_port, sa.imap_username,
             sa.health_status, sa.last_health_check_at,
             sa.daily_send_limit, sa.sends_today, sa.sends_today_date,
             sa.is_active, sa.created_at, sa.updated_at
      FROM smtp_accounts sa
      LEFT JOIN brands b ON b.id = sa.brand_id
      WHERE sa.organization_id = $1
      ORDER BY sa.created_at DESC
    `, [req.organizationId]);

    return res.json({
      success: true,
      data: result.rows.map((sa) => ({
        id: sa.id,
        brandId: sa.brand_id,
        brandName: sa.brand_name,
        emailAddress: sa.email_address,
        displayName: sa.display_name,
        provider: sa.provider,
        smtpHost: sa.smtp_host,
        smtpPort: sa.smtp_port,
        smtpUsername: sa.smtp_username,
        useTls: sa.use_tls,
        imapHost: sa.imap_host,
        imapPort: sa.imap_port,
        imapUsername: sa.imap_username,
        healthStatus: sa.health_status,
        lastHealthCheckAt: sa.last_health_check_at,
        dailySendLimit: sa.daily_send_limit,
        sendsToday: sa.sends_today,
        sendsTodayDate: sa.sends_today_date,
        isActive: sa.is_active,
        createdAt: sa.created_at,
        updatedAt: sa.updated_at,
      })),
    });
  } catch (err) {
    logger.error('List SMTP accounts error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing SMTP accounts.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /:id - Get a single SMTP account (passwords masked)
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      SELECT sa.*, b.name AS brand_name
      FROM smtp_accounts sa
      LEFT JOIN brands b ON b.id = sa.brand_id
      WHERE sa.id = $1 AND sa.organization_id = $2
    `, [id, req.organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SMTP account not found.',
      });
    }

    const sa = result.rows[0];

    return res.json({
      success: true,
      data: {
        id: sa.id,
        brandId: sa.brand_id,
        brandName: sa.brand_name,
        emailAddress: sa.email_address,
        displayName: sa.display_name,
        provider: sa.provider,
        smtpHost: sa.smtp_host,
        smtpPort: sa.smtp_port,
        smtpUsername: sa.smtp_username,
        smtpPassword: sa.smtp_password_encrypted ? MASKED_VALUE : null,
        apiKey: sa.api_key_encrypted ? MASKED_VALUE : null,
        useTls: sa.use_tls,
        imapHost: sa.imap_host,
        imapPort: sa.imap_port,
        imapUsername: sa.imap_username,
        imapPassword: sa.imap_password_encrypted ? MASKED_VALUE : null,
        healthStatus: sa.health_status,
        lastHealthCheckAt: sa.last_health_check_at,
        lastHealthCheckResult: sa.last_health_check_result,
        dailySendLimit: sa.daily_send_limit,
        sendsToday: sa.sends_today,
        sendsTodayDate: sa.sends_today_date,
        isActive: sa.is_active,
        createdAt: sa.created_at,
        updatedAt: sa.updated_at,
      },
    });
  } catch (err) {
    logger.error('Get SMTP account error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the SMTP account.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST / - Create a new SMTP account
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const {
      emailAddress,
      displayName,
      provider,
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
      apiKey,
      useTls,
      imapHost,
      imapPort,
      imapUsername,
      imapPassword,
      brandId,
      dailySendLimit,
      isActive,
    } = req.body;

    // Validation
    if (!emailAddress || !emailAddress.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.',
      });
    }

    if (!provider || !['smtp', 'sendgrid', 'mailgun'].includes(provider)) {
      return res.status(400).json({
        success: false,
        message: 'Provider must be one of: smtp, sendgrid, mailgun.',
      });
    }

    if (!brandId) {
      return res.status(400).json({
        success: false,
        message: 'Brand ID is required.',
      });
    }

    // Validate brand exists within this organization
    const brandCheck = await db.query(`SELECT id FROM brands WHERE id = $1 AND organization_id = $2`, [brandId, req.organizationId]);
    if (brandCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The specified brand does not exist.',
      });
    }

    // Check for duplicate email address within this organization
    const existing = await db.query(
      `SELECT id FROM smtp_accounts WHERE email_address = $1 AND organization_id = $2`,
      [emailAddress.trim().toLowerCase(), req.organizationId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An SMTP account with this email address already exists.',
      });
    }

    // Encrypt sensitive fields
    const smtpPasswordEncrypted = smtpPassword ? encrypt(smtpPassword) : null;
    const apiKeyEncrypted = apiKey ? encrypt(apiKey) : null;
    const imapPasswordEncrypted = imapPassword ? encrypt(imapPassword) : null;

    const result = await db.query(
      `INSERT INTO smtp_accounts
        (email_address, display_name, provider, smtp_host, smtp_port,
         smtp_username, smtp_password_encrypted, api_key_encrypted, use_tls,
         imap_host, imap_port, imap_username, imap_password_encrypted,
         brand_id, daily_send_limit, is_active, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        emailAddress.trim().toLowerCase(),
        displayName || null,
        provider,
        smtpHost || null,
        smtpPort || null,
        smtpUsername || null,
        smtpPasswordEncrypted,
        apiKeyEncrypted,
        useTls != null ? useTls : true,
        imapHost || null,
        imapPort || null,
        imapUsername || null,
        imapPasswordEncrypted,
        brandId,
        dailySendLimit != null ? dailySendLimit : 50,
        isActive != null ? isActive : true,
        req.organizationId,
      ]
    );

    const account = result.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'smtp_account.create',
      targetType: 'smtp_account',
      targetId: account.id,
      description: `Admin created SMTP account "${account.email_address}" (${provider})`,
      metadata: { emailAddress: account.email_address, provider, brandId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('SMTP account created', {
      accountId: account.id,
      emailAddress: account.email_address,
      createdBy: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: account.id,
        brandId: account.brand_id,
        emailAddress: account.email_address,
        displayName: account.display_name,
        provider: account.provider,
        smtpHost: account.smtp_host,
        smtpPort: account.smtp_port,
        smtpUsername: account.smtp_username,
        smtpPassword: account.smtp_password_encrypted ? MASKED_VALUE : null,
        apiKey: account.api_key_encrypted ? MASKED_VALUE : null,
        useTls: account.use_tls,
        imapHost: account.imap_host,
        imapPort: account.imap_port,
        imapUsername: account.imap_username,
        imapPassword: account.imap_password_encrypted ? MASKED_VALUE : null,
        healthStatus: account.health_status,
        dailySendLimit: account.daily_send_limit,
        isActive: account.is_active,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      },
    });
  } catch (err) {
    logger.error('Create SMTP account error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the SMTP account.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id - Update an SMTP account
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      emailAddress,
      displayName,
      provider,
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
      apiKey,
      useTls,
      imapHost,
      imapPort,
      imapUsername,
      imapPassword,
      brandId,
      dailySendLimit,
      isActive,
    } = req.body;

    // Verify account exists within this organization
    const accountCheck = await db.query(
      `SELECT id, email_address FROM smtp_accounts WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SMTP account not found.',
      });
    }

    const existingAccount = accountCheck.rows[0];

    // Build dynamic SET clause
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    if (emailAddress !== undefined) {
      setClauses.push(`email_address = $${paramIndex++}`);
      params.push(emailAddress.trim().toLowerCase());
    }

    if (displayName !== undefined) {
      setClauses.push(`display_name = $${paramIndex++}`);
      params.push(displayName);
    }

    if (provider !== undefined) {
      if (!['smtp', 'sendgrid', 'mailgun'].includes(provider)) {
        return res.status(400).json({
          success: false,
          message: 'Provider must be one of: smtp, sendgrid, mailgun.',
        });
      }
      setClauses.push(`provider = $${paramIndex++}`);
      params.push(provider);
    }

    if (smtpHost !== undefined) {
      setClauses.push(`smtp_host = $${paramIndex++}`);
      params.push(smtpHost);
    }

    if (smtpPort !== undefined) {
      setClauses.push(`smtp_port = $${paramIndex++}`);
      params.push(smtpPort);
    }

    if (smtpUsername !== undefined) {
      setClauses.push(`smtp_username = $${paramIndex++}`);
      params.push(smtpUsername);
    }

    // Only encrypt password if provided and not the masked value
    if (smtpPassword !== undefined && smtpPassword !== MASKED_VALUE) {
      setClauses.push(`smtp_password_encrypted = $${paramIndex++}`);
      params.push(smtpPassword ? encrypt(smtpPassword) : null);
    }

    if (apiKey !== undefined && apiKey !== MASKED_VALUE) {
      setClauses.push(`api_key_encrypted = $${paramIndex++}`);
      params.push(apiKey ? encrypt(apiKey) : null);
    }

    if (useTls !== undefined) {
      setClauses.push(`use_tls = $${paramIndex++}`);
      params.push(useTls);
    }

    if (imapHost !== undefined) {
      setClauses.push(`imap_host = $${paramIndex++}`);
      params.push(imapHost);
    }

    if (imapPort !== undefined) {
      setClauses.push(`imap_port = $${paramIndex++}`);
      params.push(imapPort);
    }

    if (imapUsername !== undefined) {
      setClauses.push(`imap_username = $${paramIndex++}`);
      params.push(imapUsername);
    }

    if (imapPassword !== undefined && imapPassword !== MASKED_VALUE) {
      setClauses.push(`imap_password_encrypted = $${paramIndex++}`);
      params.push(imapPassword ? encrypt(imapPassword) : null);
    }

    if (brandId !== undefined) {
      // Validate brand exists within this organization
      const brandCheck = await db.query(`SELECT id FROM brands WHERE id = $1 AND organization_id = $2`, [brandId, req.organizationId]);
      if (brandCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'The specified brand does not exist.',
        });
      }
      setClauses.push(`brand_id = $${paramIndex++}`);
      params.push(brandId);
    }

    if (dailySendLimit !== undefined) {
      setClauses.push(`daily_send_limit = $${paramIndex++}`);
      params.push(dailySendLimit);
    }

    if (isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update.',
      });
    }

    setClauses.push(`updated_at = NOW()`);

    params.push(id);
    const idPlaceholder = `$${paramIndex++}`;
    params.push(req.organizationId);
    const orgPlaceholder = `$${paramIndex}`;

    const updateResult = await db.query(
      `UPDATE smtp_accounts
       SET ${setClauses.join(', ')}
       WHERE id = ${idPlaceholder} AND organization_id = ${orgPlaceholder}
       RETURNING *`,
      params
    );

    const account = updateResult.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'smtp_account.update',
      targetType: 'smtp_account',
      targetId: id,
      description: `Admin updated SMTP account "${existingAccount.email_address}"`,
      metadata: { updatedFields: Object.keys(req.body).filter((k) => !['smtpPassword', 'apiKey', 'imapPassword'].includes(k)) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('SMTP account updated', { accountId: id, updatedBy: req.user.id });

    return res.json({
      success: true,
      data: {
        id: account.id,
        brandId: account.brand_id,
        emailAddress: account.email_address,
        displayName: account.display_name,
        provider: account.provider,
        smtpHost: account.smtp_host,
        smtpPort: account.smtp_port,
        smtpUsername: account.smtp_username,
        smtpPassword: account.smtp_password_encrypted ? MASKED_VALUE : null,
        apiKey: account.api_key_encrypted ? MASKED_VALUE : null,
        useTls: account.use_tls,
        imapHost: account.imap_host,
        imapPort: account.imap_port,
        imapUsername: account.imap_username,
        imapPassword: account.imap_password_encrypted ? MASKED_VALUE : null,
        healthStatus: account.health_status,
        lastHealthCheckAt: account.last_health_check_at,
        dailySendLimit: account.daily_send_limit,
        isActive: account.is_active,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      },
    });
  } catch (err) {
    logger.error('Update SMTP account error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating the SMTP account.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id - Deactivate an SMTP account (soft delete)
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const accountCheck = await db.query(
      `SELECT id, email_address, is_active FROM smtp_accounts WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SMTP account not found.',
      });
    }

    const account = accountCheck.rows[0];

    if (!account.is_active) {
      return res.status(400).json({
        success: false,
        message: 'SMTP account is already deactivated.',
      });
    }

    await db.query(
      `UPDATE smtp_accounts SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'smtp_account.deactivate',
      targetType: 'smtp_account',
      targetId: id,
      description: `Admin deactivated SMTP account "${account.email_address}"`,
      metadata: { emailAddress: account.email_address },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('SMTP account deactivated', { accountId: id, deactivatedBy: req.user.id });

    return res.json({
      success: true,
      message: `SMTP account "${account.email_address}" has been deactivated.`,
    });
  } catch (err) {
    logger.error('Deactivate SMTP account error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deactivating the SMTP account.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/health-check - Trigger manual health check for one account
// ---------------------------------------------------------------------------
router.post('/:id/health-check', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the full account record (need encrypted creds for SMTP verify)
    const accountResult = await db.query(
      `SELECT * FROM smtp_accounts WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SMTP account not found.',
      });
    }

    const account = accountResult.rows[0];
    const previousStatus = account.health_status;

    const healthResult = {
      checkedAt: new Date().toISOString(),
      smtpVerify: null,
      bounceRate: null,
      spamComplaintRate: null,
      errors: [],
    };

    // -----------------------------------------------------------------------
    // (a) SMTP connection verification (only for provider = 'smtp')
    // -----------------------------------------------------------------------
    if (account.provider === 'smtp') {
      try {
        const transportConfig = {
          host: account.smtp_host,
          port: account.smtp_port || 587,
          secure: account.smtp_port === 465,
          auth: {},
        };

        if (account.use_tls && account.smtp_port !== 465) {
          transportConfig.requireTLS = true;
        }

        if (account.smtp_username) {
          transportConfig.auth.user = account.smtp_username;
        }
        if (account.smtp_password_encrypted) {
          transportConfig.auth.pass = decrypt(account.smtp_password_encrypted);
        }

        // If no auth credentials, remove the auth object
        if (!transportConfig.auth.user && !transportConfig.auth.pass) {
          delete transportConfig.auth;
        }

        const transport = nodemailer.createTransport(transportConfig);
        await transport.verify();
        transport.close();

        healthResult.smtpVerify = { success: true };
      } catch (smtpErr) {
        healthResult.smtpVerify = { success: false, error: smtpErr.message };
        healthResult.errors.push(`SMTP verify failed: ${smtpErr.message}`);
      }
    } else {
      // For sendgrid/mailgun we skip SMTP verify (API-based providers)
      healthResult.smtpVerify = { success: true, note: 'Skipped for API-based provider' };
    }

    // -----------------------------------------------------------------------
    // (b) Bounce rate from emails_sent table (last 7 days)
    // -----------------------------------------------------------------------
    try {
      const bounceResult = await db.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'bounced')::int AS bounced
        FROM emails_sent
        WHERE smtp_account_id = $1
          AND sent_at >= NOW() - INTERVAL '7 days'
      `, [id]);

      const { total, bounced } = bounceResult.rows[0];
      const bounceRate = total > 0 ? ((bounced / total) * 100).toFixed(2) : 0;

      healthResult.bounceRate = {
        total,
        bounced,
        rate: parseFloat(bounceRate),
      };

      if (parseFloat(bounceRate) > 5) {
        healthResult.errors.push(`High bounce rate: ${bounceRate}% (${bounced}/${total})`);
      }
    } catch (bounceErr) {
      logger.warn('Failed to check bounce rate', { accountId: id, error: bounceErr.message });
      healthResult.bounceRate = { error: bounceErr.message };
    }

    // -----------------------------------------------------------------------
    // (c) Spam complaint rate from email_events table (last 7 days)
    // -----------------------------------------------------------------------
    try {
      const spamResult = await db.query(`
        SELECT
          COUNT(DISTINCT ee.email_sent_id)::int AS total_emails,
          COUNT(DISTINCT ee.email_sent_id) FILTER (WHERE ee.event_type = 'spam_complaint')::int AS spam_complaints
        FROM email_events ee
        JOIN emails_sent es ON es.id = ee.email_sent_id
        WHERE es.smtp_account_id = $1
          AND ee.occurred_at >= NOW() - INTERVAL '7 days'
      `, [id]);

      const { total_emails, spam_complaints } = spamResult.rows[0];
      const spamRate = total_emails > 0 ? ((spam_complaints / total_emails) * 100).toFixed(2) : 0;

      healthResult.spamComplaintRate = {
        totalEmails: total_emails,
        spamComplaints: spam_complaints,
        rate: parseFloat(spamRate),
      };

      if (parseFloat(spamRate) > 0.1) {
        healthResult.errors.push(`High spam complaint rate: ${spamRate}% (${spam_complaints}/${total_emails})`);
      }
    } catch (spamErr) {
      logger.warn('Failed to check spam complaint rate', { accountId: id, error: spamErr.message });
      healthResult.spamComplaintRate = { error: spamErr.message };
    }

    // -----------------------------------------------------------------------
    // (d) Determine new health status
    // -----------------------------------------------------------------------
    let newStatus = 'healthy';

    if (healthResult.errors.length > 0) {
      // SMTP verify failure = failed; high rates = degraded
      const smtpFailed = healthResult.smtpVerify && !healthResult.smtpVerify.success;
      newStatus = smtpFailed ? 'failed' : 'degraded';
    }

    // -----------------------------------------------------------------------
    // (e) Update smtp_accounts with the result
    // -----------------------------------------------------------------------
    await db.query(
      `UPDATE smtp_accounts
       SET health_status = $1,
           last_health_check_at = NOW(),
           last_health_check_result = $2,
           updated_at = NOW()
       WHERE id = $3 AND organization_id = $4`,
      [newStatus, JSON.stringify(healthResult), id, req.organizationId]
    );

    // -----------------------------------------------------------------------
    // (f) If degraded or failed, notify admins
    // -----------------------------------------------------------------------
    if (newStatus === 'degraded' || newStatus === 'failed') {
      const severity = newStatus === 'failed' ? 'FAILED' : 'DEGRADED';
      await createNotification({
        userId: null, // null = all admins
        type: `smtp_${newStatus}`,
        title: `SMTP Account ${severity}: ${account.email_address}`,
        message: `SMTP account "${account.email_address}" health check returned status: ${newStatus}. Issues: ${healthResult.errors.join('; ')}`,
        metadata: {
          smtpAccountId: id,
          emailAddress: account.email_address,
          healthStatus: newStatus,
          errors: healthResult.errors,
        },
      });
    }

    // -----------------------------------------------------------------------
    // (g) If failed, auto-pause the account
    // -----------------------------------------------------------------------
    if (newStatus === 'failed') {
      await db.query(
        `UPDATE smtp_accounts SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
        [id, req.organizationId]
      );
      healthResult.autoPaused = true;
      logger.warn('SMTP account auto-paused due to failed health check', {
        accountId: id,
        emailAddress: account.email_address,
      });
    }

    // -----------------------------------------------------------------------
    // (h) Audit log
    // -----------------------------------------------------------------------
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'smtp_account.health_check',
      targetType: 'smtp_account',
      targetId: id,
      description: `Health check on SMTP account "${account.email_address}": ${newStatus}`,
      metadata: {
        previousStatus,
        newStatus,
        bounceRate: healthResult.bounceRate,
        spamComplaintRate: healthResult.spamComplaintRate,
        smtpVerify: healthResult.smtpVerify ? healthResult.smtpVerify.success : null,
        autoPaused: healthResult.autoPaused || false,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('SMTP health check completed', {
      accountId: id,
      emailAddress: account.email_address,
      previousStatus,
      newStatus,
    });

    return res.json({
      success: true,
      data: {
        accountId: id,
        emailAddress: account.email_address,
        previousStatus,
        currentStatus: newStatus,
        autoPaused: healthResult.autoPaused || false,
        details: healthResult,
      },
    });
  } catch (err) {
    logger.error('SMTP health check error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred during the health check.',
    });
  }
});

module.exports = router;
