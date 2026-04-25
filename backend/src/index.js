require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const env = require('./config/env');
const logger = require('./utils/logger');
const { apiLimiter, loginLimiter } = require('./middleware/rateLimiter');
const db = require('./config/database');

// ---------------------------------------------------------------------------
// Create Express app
// ---------------------------------------------------------------------------
const app = express();

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------
app.use(helmet());

app.use(cors({
  origin: env.frontendUrl,
  credentials: true,
}));

app.use(cookieParser());

// Stripe webhook — must be mounted with raw body BEFORE express.json(),
// so signature verification can hash the exact request bytes.
const stripeWebhookRoutes = require('./routes/stripeWebhooks');
app.use('/api/webhooks', express.raw({ type: 'application/json' }), stripeWebhookRoutes);

app.use(express.json({ limit: '10mb' }));

app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.resolve(env.uploadDir || './uploads')));

// Apply global API rate limiter
app.use('/api', apiLimiter);

// ---------------------------------------------------------------------------
// Route Mounts
// ---------------------------------------------------------------------------
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const brandsRoutes = require('./routes/brands');
const smtpRoutes = require('./routes/smtp');
const leadsRoutes = require('./routes/leads');
const campaignsRoutes = require('./routes/campaigns');
const analyticsRoutes = require('./routes/analytics');
const abTestsRoutes = require('./routes/abTests');
const repliesRoutes = require('./routes/replies');
const integrationsRoutes = require('./routes/integrations');
const webhookReceiverRoutes = require('./routes/webhookReceiver');
const settingsRoutes = require('./routes/settings');
const auditLogsRoutes = require('./routes/auditLogs');
const notificationsRoutes = require('./routes/notifications');
const aiChatRoutes = require('./routes/aiChat');
const aiAgentRoutes = require('./routes/aiAgent');
const aiUsageRoutes = require('./routes/aiUsage');
const templatesRoutes = require('./routes/templates');
const signaturesRoutes = require('./routes/signatures');
const phoneCallsRoutes = require('./routes/phoneCalls');
const vapiWebhookRoutes = require('./routes/vapiWebhook');
const platformRoutes = require('./routes/platform');
const organizationsRoutes = require('./routes/organizations');
const billingRoutes = require('./routes/billing');
const gmailOAuthRoutes = require('./routes/gmailOAuth');
const adminRoutes = require('./routes/admin');

// Auth routes with login-specific rate limiter
app.use('/api/auth', authRoutes);
app.use('/api/auth/login', loginLimiter);

// Multi-tenant SaaS routes
app.use('/api/platform', platformRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/billing', billingRoutes);

app.use('/api/users', usersRoutes);
app.use('/api/brands', brandsRoutes);
app.use('/api/smtp', smtpRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ab-tests', abTestsRoutes);
app.use('/api/replies', repliesRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/webhook', webhookReceiverRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/ai/chat', aiChatRoutes);
app.use('/api/ai/agent', aiAgentRoutes);
app.use('/api/ai/usage', aiUsageRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/signatures', signaturesRoutes);
app.use('/api/phone-calls', phoneCallsRoutes);
app.use('/api/vapi', vapiWebhookRoutes);
app.use('/api/gmail/oauth', gmailOAuthRoutes);
app.use('/api/admin', adminRoutes);

// ---------------------------------------------------------------------------
// Email Tracking: Open Pixel
// ---------------------------------------------------------------------------
// 1x1 transparent GIF as a Buffer (smallest valid GIF89a)
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

app.get('/api/track/open/:emailId', (req, res) => {
  const { emailId } = req.params;

  // Serve the pixel immediately so we never block the email client
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': TRACKING_PIXEL.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end(TRACKING_PIXEL);

  // Record the open event asynchronously
  (async () => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      // Insert open event
      await db.query(
        `INSERT INTO email_events (email_id, event_type, metadata, ip_address, user_agent)
         VALUES ($1, 'open', $2, $3, $4)`,
        [emailId, JSON.stringify({ source: 'tracking_pixel' }), ipAddress, userAgent]
      );

      // Update emails_sent opened_at (only set first open)
      await db.query(
        `UPDATE emails_sent
         SET opened_at = COALESCE(opened_at, NOW()),
             status = CASE WHEN status IN ('sent', 'delivered') THEN 'opened' ELSE status END,
             updated_at = NOW()
         WHERE id = $1`,
        [emailId]
      );

      // Get campaign_id and lead_id from the email
      const emailResult = await db.query(
        `SELECT campaign_id, campaign_lead_id FROM emails_sent WHERE id = $1`,
        [emailId]
      );

      if (emailResult.rows.length > 0) {
        const { campaign_id, campaign_lead_id } = emailResult.rows[0];

        // Update campaign total_opened
        if (campaign_id) {
          await db.query(
            `UPDATE campaigns
             SET total_opened = total_opened + 1, updated_at = NOW()
             WHERE id = $1`,
            [campaign_id]
          );
        }

        // Update campaign_leads status (only escalate, don't overwrite higher statuses)
        if (campaign_lead_id) {
          await db.query(
            `UPDATE campaign_leads
             SET status = 'opened', updated_at = NOW()
             WHERE id = $1
               AND status IN ('sent', 'queued')`,
            [campaign_lead_id]
          );
        }
      }

      // Update lead score for open
      const leadResult = await db.query(
        'SELECT lead_id FROM emails_sent WHERE id = $1', [emailId]
      );
      if (leadResult.rows.length > 0) {
        await db.query(
          'UPDATE leads SET score = COALESCE(score, 0) + 1, updated_at = NOW() WHERE id = $1',
          [leadResult.rows[0].lead_id]
        );
      }

      logger.debug('Open event recorded', { emailId });
    } catch (err) {
      logger.error('Failed to record open event', {
        emailId,
        error: err.message,
      });
    }
  })();
});

// ---------------------------------------------------------------------------
// Email Tracking: Click Tracking
// ---------------------------------------------------------------------------
app.get('/api/track/click/:emailId', async (req, res) => {
  const { emailId } = req.params;
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('Missing redirect URL');
  }

  // Only allow http/https redirects to prevent javascript: or data: URL abuse
  if (!/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).send('Invalid redirect URL');
  }

  // Redirect immediately
  res.redirect(targetUrl);

  // Record the click event asynchronously
  (async () => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';

      // Insert click event
      await db.query(
        `INSERT INTO email_events (email_id, event_type, metadata, ip_address, user_agent)
         VALUES ($1, 'click', $2, $3, $4)`,
        [emailId, JSON.stringify({ url: targetUrl }), ipAddress, userAgent]
      );

      // Update emails_sent clicked_at (only set first click)
      await db.query(
        `UPDATE emails_sent
         SET clicked_at = COALESCE(clicked_at, NOW()),
             status = CASE WHEN status IN ('sent', 'delivered', 'opened') THEN 'clicked' ELSE status END,
             updated_at = NOW()
         WHERE id = $1`,
        [emailId]
      );

      // Get campaign info
      const emailResult = await db.query(
        `SELECT campaign_id, campaign_lead_id FROM emails_sent WHERE id = $1`,
        [emailId]
      );

      if (emailResult.rows.length > 0) {
        const { campaign_id, campaign_lead_id } = emailResult.rows[0];

        // Update campaign total_clicked
        if (campaign_id) {
          await db.query(
            `UPDATE campaigns
             SET total_clicked = total_clicked + 1, updated_at = NOW()
             WHERE id = $1`,
            [campaign_id]
          );
        }

        // Update campaign_leads status
        if (campaign_lead_id) {
          await db.query(
            `UPDATE campaign_leads
             SET status = 'clicked', updated_at = NOW()
             WHERE id = $1
               AND status IN ('sent', 'queued', 'opened')`,
            [campaign_lead_id]
          );
        }
      }

      // Update lead score for click
      const leadClickResult = await db.query(
        'SELECT lead_id FROM emails_sent WHERE id = $1', [emailId]
      );
      if (leadClickResult.rows.length > 0) {
        await db.query(
          'UPDATE leads SET score = COALESCE(score, 0) + 3, updated_at = NOW() WHERE id = $1',
          [leadClickResult.rows[0].lead_id]
        );
      }

      logger.debug('Click event recorded', { emailId, targetUrl });
    } catch (err) {
      logger.error('Failed to record click event', {
        emailId,
        error: err.message,
      });
    }
  })();
});

// ---------------------------------------------------------------------------
// Unsubscribe Page
// ---------------------------------------------------------------------------
app.get('/unsubscribe/:leadId', async (req, res) => {
  const { leadId } = req.params;

  try {
    // Fetch unsubscribe page text from system_settings
    let unsubscribeText = 'You have been successfully unsubscribed. You will no longer receive emails from us.';
    try {
      const settingResult = await db.query(
        `SELECT value FROM system_settings WHERE key = 'unsubscribe_page_text' LIMIT 1`
      );
      if (settingResult.rows.length > 0) {
        const rawValue = settingResult.rows[0].value;
        unsubscribeText = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
        // Remove surrounding quotes if present (JSONB stores strings with quotes)
        unsubscribeText = unsubscribeText.replace(/^"|"$/g, '');
      }
    } catch (settingErr) {
      logger.warn('Failed to read unsubscribe_page_text setting', { error: settingErr.message });
    }

    // Update lead: set unsubscribed and status
    await db.query(
      `UPDATE leads
       SET unsubscribed = TRUE,
           status = 'unsubscribed',
           updated_at = NOW()
       WHERE id = $1`,
      [leadId]
    );

    // Cancel any pending follow-ups for this lead
    await db.query(
      `UPDATE campaign_leads
       SET status = 'skipped',
           next_followup_at = NULL,
           updated_at = NOW()
       WHERE lead_id = $1
         AND status IN ('pending', 'queued', 'sent')`,
      [leadId]
    );

    // Log email_event for unsubscribe (find the most recent email for this lead)
    const recentEmail = await db.query(
      `SELECT id FROM emails_sent
       WHERE lead_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [leadId]
    );

    if (recentEmail.rows.length > 0) {
      await db.query(
        `INSERT INTO email_events (email_id, event_type, metadata, ip_address, user_agent)
         VALUES ($1, 'unsubscribe', $2, $3, $4)`,
        [
          recentEmail.rows[0].id,
          JSON.stringify({ method: 'unsubscribe_page' }),
          req.ip || req.connection.remoteAddress,
          req.headers['user-agent'] || '',
        ]
      );
    }

    logger.info('Lead unsubscribed', { leadId });

    // Serve a simple HTML confirmation page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background-color: #f5f5f5;
      color: #333;
    }
    .container {
      text-align: center;
      max-width: 500px;
      padding: 40px 24px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .checkmark {
      font-size: 48px;
      margin-bottom: 16px;
      color: #22c55e;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      font-size: 16px;
      line-height: 1.5;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">&#10003;</div>
    <h1>Unsubscribed</h1>
    <p>${unsubscribeText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}</p>
  </div>
</body>
</html>`;

    res.type('html').send(html);
  } catch (err) {
    logger.error('Unsubscribe page error', {
      leadId,
      error: err.message,
    });
    res.status(500).send('An error occurred while processing your unsubscribe request.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/unsubscribe — JSON API for React unsubscribe page
// ---------------------------------------------------------------------------
app.post('/api/unsubscribe', async (req, res) => {
  try {
    const { token, email } = req.body;
    if (!token || !email) {
      return res.status(400).json({ success: false, message: 'Missing token or email.' });
    }

    // token is the lead ID
    const leadResult = await db.query(
      'SELECT id, email, status, unsubscribed FROM leads WHERE id = $1',
      [token]
    );

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invalid unsubscribe link.' });
    }

    const lead = leadResult.rows[0];
    if (lead.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ success: false, message: 'Email mismatch.' });
    }

    if (lead.unsubscribed) {
      return res.status(409).json({ success: false, message: 'This email is already unsubscribed.' });
    }

    await db.query(
      `UPDATE leads SET unsubscribed = TRUE, status = 'unsubscribed', updated_at = NOW() WHERE id = $1`,
      [lead.id]
    );

    // Cancel pending emails
    await db.query(
      `UPDATE emails_sent SET status = 'cancelled', updated_at = NOW() WHERE lead_id = $1 AND status IN ('queued', 'scheduled')`,
      [lead.id]
    );

    logger.info('Lead unsubscribed via API', { leadId: lead.id, email: lead.email });

    return res.json({ success: true, message: 'You have been successfully unsubscribed.' });
  } catch (err) {
    logger.error('Unsubscribe API error', { error: err.message });
    return res.status(500).json({ success: false, message: 'An error occurred.' });
  }
});

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Global Error Handler
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  logger.error('Unhandled Express error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
  });

  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    success: false,
    message: env.nodeEnv === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
const PORT = env.port || 4000;

app.listen(PORT, async () => {
  logger.info(`ColdAF Email Tool server running on port ${PORT}`, {
    env: env.nodeEnv,
    frontendUrl: env.frontendUrl,
  });

  // ── Start the scheduler worker ────────────────────────────────────
  try {
    const { startScheduler } = require('./workers/schedulerWorker');
    await startScheduler();
    logger.info('Scheduler worker started');
  } catch (err) {
    logger.error('Failed to start scheduler worker', { error: err.message });
  }

  // ── Start the email queue worker ──────────────────────────────────
  // Requiring emailWorker registers the Bull processor (side-effect import)
  try {
    require('./workers/emailWorker');
    logger.info('Email queue worker registered');
  } catch (err) {
    logger.error('Failed to start email queue worker', { error: err.message });
  }

  // ── Start the Vapi call agent scheduler ──────────────────────────
  try {
    const { processDiscordLeads, runCallResultSync } = require('./services/vapiCallAgent');
    const db = require('./config/database');

    async function getVapiIntervalMinutes() {
      try {
        const r = await db.query(
          `SELECT value FROM system_settings WHERE key = 'vapi_schedule_interval_minutes' LIMIT 1`
        );
        if (r.rows.length === 0) return 30;
        const v = String(r.rows[0].value).replace(/^"|"$/g, '');
        return parseInt(v, 10) || 30;
      } catch { return 30; }
    }

    // Initial run 30 s after startup to let DB settle
    setTimeout(async () => {
      try { await processDiscordLeads(); } catch (e) {
        logger.error('Initial Vapi agent run failed', { error: e.message });
      }
    }, 30000);

    // Periodic scan — re-reads interval from DB on every tick so admins can change it live
    setInterval(async () => {
      const intervalMs = (await getVapiIntervalMinutes()) * 60 * 1000;
      try { await processDiscordLeads(); } catch (e) {
        logger.error('Vapi agent scan error', { error: e.message });
      }
      try { await runCallResultSync(); } catch (e) {
        logger.error('Vapi call sync error', { error: e.message });
      }
    }, 30 * 60 * 1000); // fixed 30-min base; dynamic interval is advisory

    logger.info('Vapi call agent scheduler started');
  } catch (err) {
    logger.error('Failed to start Vapi call agent scheduler', { error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Graceful Shutdown Handlers
// ---------------------------------------------------------------------------
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', {
    error: err.message,
    stack: err.stack,
  });
  // Give the logger time to flush, then exit
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
