const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../utils/logger');
const { pollAllSheets } = require('../services/googleSheets');
const { checkAllAccounts } = require('../services/replyTracker');
const { runAgentCheck } = require('../services/aiAgent');
const { addEmailToQueue } = require('./emailWorker');
const { generateEmail } = require('../services/emailGenerator');
const { progressWarmup } = require('../services/warmupManager');
const { checkAllAccounts: checkAllBlacklists } = require('../services/blacklistChecker');
const { processSequenceSteps } = require('./sequenceProcessor');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetches a value from system_settings. Returns defaultValue if not found.
 */
async function getSetting(key, defaultValue) {
  try {
    const result = await db.query(
      'SELECT value FROM system_settings WHERE key = $1 LIMIT 1',
      [key]
    );
    if (result.rows.length === 0) return defaultValue;
    // system_settings.value is JSONB, so it is already parsed by pg driver
    const raw = result.rows[0].value;
    // Unwrap JSON strings (e.g. stored as '"09:00"' -> '09:00')
    if (typeof raw === 'string') return raw;
    return raw;
  } catch (err) {
    logger.warn(`Failed to read setting "${key}", using default`, { error: err.message });
    return defaultValue;
  }
}

/**
 * Returns the three-letter lowercase day abbreviation for a JS Date.
 */
function getDayAbbrev(date) {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[date.getDay()];
}

/**
 * Checks whether the current time falls within the campaign's send window.
 *
 * @param {Object} campaign - Campaign row with send_window_start, send_window_end, send_days
 * @returns {boolean}
 */
function isWithinSendWindow(campaign) {
  const now = new Date();
  const today = getDayAbbrev(now);

  // Check send_days
  const sendDays = (campaign.send_days || 'mon,tue,wed,thu,fri')
    .toLowerCase()
    .split(',')
    .map((d) => d.trim());

  if (!sendDays.includes(today)) {
    return false;
  }

  // Check time window
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (campaign.send_window_start || '09:00').split(':').map(Number);
  const [endH, endM] = (campaign.send_window_end || '17:00').split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/**
 * Generates a random delay in milliseconds between min and max minutes.
 */
function randomDelay(minMinutes, maxMinutes) {
  const min = (minMinutes || 3) * 60 * 1000;
  const max = (maxMinutes || 9) * 60 * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Scheduled Task Runners
// ---------------------------------------------------------------------------

/**
 * Google Sheets polling task.
 */
async function runSheetsPoll() {
  try {
    await pollAllSheets();
  } catch (err) {
    logger.error('Scheduled Google Sheets poll failed', { error: err.message });
  }
}

/**
 * Reply checking (IMAP) task.
 */
async function runReplyCheck() {
  try {
    await checkAllAccounts();
  } catch (err) {
    logger.error('Scheduled reply check failed', { error: err.message });
  }
}

/**
 * SMTP health check task.
 * Verifies connectivity for every active SMTP account.
 */
async function runSmtpHealthChecks() {
  try {
    const result = await db.query(
      `SELECT id, email_address, provider, smtp_host, smtp_port, smtp_username,
              smtp_password_encrypted, use_tls, api_key_encrypted
       FROM smtp_accounts
       WHERE is_active = TRUE`
    );

    if (result.rows.length === 0) {
      logger.debug('No active SMTP accounts for health check');
      return;
    }

    logger.info('Starting SMTP health checks', { accountCount: result.rows.length });

    for (const account of result.rows) {
      try {
        // For raw SMTP accounts, attempt a nodemailer verify
        if (account.provider === 'smtp' && account.smtp_host) {
          const nodemailer = require('nodemailer');
          const { decrypt } = require('../utils/encryption');

          const transportConfig = {
            host: account.smtp_host,
            port: account.smtp_port || 587,
            secure: (account.smtp_port || 587) === 465,
            connectionTimeout: 15000,
            greetingTimeout: 10000,
          };

          if (account.use_tls && transportConfig.port !== 465) {
            transportConfig.requireTLS = true;
          }

          const auth = {};
          if (account.smtp_username) auth.user = account.smtp_username;
          if (account.smtp_password_encrypted) {
            auth.pass = decrypt(account.smtp_password_encrypted);
          }
          if (auth.user || auth.pass) {
            transportConfig.auth = auth;
          }

          const transport = nodemailer.createTransport(transportConfig);

          try {
            await transport.verify();

            await db.query(
              `UPDATE smtp_accounts
               SET health_status = 'healthy',
                   last_health_check_at = NOW(),
                   last_health_check_result = $1,
                   updated_at = NOW()
               WHERE id = $2`,
              [JSON.stringify({ success: true, checkedAt: new Date().toISOString() }), account.id]
            );

            logger.debug('SMTP health check passed', { accountId: account.id, email: account.email_address });
          } catch (verifyErr) {
            await db.query(
              `UPDATE smtp_accounts
               SET health_status = 'degraded',
                   last_health_check_at = NOW(),
                   last_health_check_result = $1,
                   updated_at = NOW()
               WHERE id = $2`,
              [
                JSON.stringify({
                  success: false,
                  error: verifyErr.message,
                  checkedAt: new Date().toISOString(),
                }),
                account.id,
              ]
            );

            logger.warn('SMTP health check failed', {
              accountId: account.id,
              email: account.email_address,
              error: verifyErr.message,
            });
          } finally {
            transport.close();
          }
        } else {
          // For API-based providers (sendgrid, mailgun), mark as healthy if configured
          const hasKey = account.api_key_encrypted ? true : false;
          const status = hasKey ? 'healthy' : 'unknown';

          await db.query(
            `UPDATE smtp_accounts
             SET health_status = $1,
                 last_health_check_at = NOW(),
                 last_health_check_result = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [
              status,
              JSON.stringify({
                success: hasKey,
                provider: account.provider,
                note: hasKey ? 'API key present' : 'No API key configured',
                checkedAt: new Date().toISOString(),
              }),
              account.id,
            ]
          );
        }
      } catch (acctErr) {
        logger.error('Error during SMTP health check for account', {
          accountId: account.id,
          error: acctErr.message,
        });

        await db.query(
          `UPDATE smtp_accounts
           SET health_status = 'failed',
               last_health_check_at = NOW(),
               last_health_check_result = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [
            JSON.stringify({ success: false, error: acctErr.message, checkedAt: new Date().toISOString() }),
            account.id,
          ]
        );
      }
    }

    logger.info('SMTP health checks complete');
  } catch (err) {
    logger.error('Fatal error in runSmtpHealthChecks', { error: err.message });
  }
}

/**
 * AI agent monitoring task.
 */
async function runAiAgentCheck() {
  try {
    await runAgentCheck();
  } catch (err) {
    logger.error('Scheduled AI agent check failed', { error: err.message });
  }
}

/**
 * Campaign processor: sends pending initial emails and follow-ups.
 * Scoped by organization — checks org limits (trial expiry, email quotas) before processing.
 */
async function runCampaignProcessor() {
  try {
    // ── Fetch active campaigns with org context ───────────────────────
    const campaignResult = await db.query(
      `SELECT c.*, cb.brand_id,
              o.id AS org_id, o.plan, o.trial_ends_at, o.is_active AS org_active,
              o.stripe_status AS org_stripe_status,
              o.max_emails_per_month, o.emails_sent_this_month
       FROM campaigns c
       JOIN campaign_brands cb ON cb.campaign_id = c.id
       LEFT JOIN organizations o ON o.id = c.organization_id
       WHERE c.status = 'active'`
    );

    if (campaignResult.rows.length === 0) {
      return; // Nothing to process
    }

    for (const campaign of campaignResult.rows) {
      try {
        // Check send window
        if (!isWithinSendWindow(campaign)) {
          continue;
        }

        // ── Org-level guards ────────────────────────────────────────
        // Skip campaigns from inactive or over-limit organizations
        if (campaign.org_id) {
          if (!campaign.org_active) {
            logger.debug('Skipping campaign — org is inactive', {
              campaignId: campaign.id,
              orgId: campaign.org_id,
            });
            continue;
          }

          // Check trial expiry
          if (campaign.plan === 'trial' && campaign.trial_ends_at && new Date(campaign.trial_ends_at) < new Date()) {
            logger.debug('Skipping campaign — org trial expired', {
              campaignId: campaign.id,
              orgId: campaign.org_id,
            });
            continue;
          }

          // Dunning: pause sends while invoice is unpaid
          if (['past_due', 'unpaid'].includes(campaign.org_stripe_status)) {
            logger.debug('Skipping campaign — org payment past due', {
              campaignId: campaign.id,
              orgId: campaign.org_id,
              status: campaign.org_stripe_status,
            });
            continue;
          }

          // Check email quota (unlimited plans use the 999999 sentinel)
          if (campaign.max_emails_per_month < 999999 && campaign.emails_sent_this_month >= campaign.max_emails_per_month) {
            logger.debug('Skipping campaign — org email limit reached', {
              campaignId: campaign.id,
              orgId: campaign.org_id,
              sent: campaign.emails_sent_this_month,
              limit: campaign.max_emails_per_month,
            });
            continue;
          }
        }

        const brandId = campaign.brand_id;

        // Fetch the brand for email generation
        const brandResult = await db.query(
          `SELECT * FROM brands WHERE id = $1 AND is_active = TRUE`,
          [brandId]
        );

        if (brandResult.rows.length === 0) {
          logger.warn('Campaign has no active brand, skipping', {
            campaignId: campaign.id,
            brandId,
          });
          continue;
        }

        const brand = brandResult.rows[0];

        // ── Process pending leads (initial emails) ───────────────────
        const pendingResult = await db.query(
          `SELECT cl.id AS campaign_lead_id, cl.lead_id, cl.brand_id, cl.ab_variant_id,
                  l.full_name, l.email, l.industry, l.lead_type, l.project_details
           FROM campaign_leads cl
           JOIN leads l ON l.id = cl.lead_id
           WHERE cl.campaign_id = $1
             AND cl.status = 'pending'
             AND l.unsubscribed = FALSE
           ORDER BY cl.created_at ASC
           LIMIT 20`,
          [campaign.id]
        );

        for (const pending of pendingResult.rows) {
          try {
            // Pick an SMTP account for this brand (round-robin by lowest sends_today)
            const smtpResult = await db.query(
              `SELECT id, email_address, display_name, daily_send_limit, sends_today
               FROM smtp_accounts
               WHERE brand_id = $1
                 AND is_active = TRUE
                 AND health_status != 'failed'
                 AND sends_today < daily_send_limit
               ORDER BY sends_today ASC
               LIMIT 1`,
              [brandId]
            );

            if (smtpResult.rows.length === 0) {
              logger.warn('No available SMTP accounts for brand, skipping campaign batch', {
                campaignId: campaign.id,
                brandId,
              });
              break; // No SMTP capacity; skip remaining leads for this campaign
            }

            const smtpAccount = smtpResult.rows[0];

            // Generate the email
            const emailContent = await generateEmail({
              lead: {
                id: pending.lead_id,
                full_name: pending.full_name,
                email: pending.email,
                industry: pending.industry,
                lead_type: pending.lead_type,
                project_details: pending.project_details,
              },
              brand,
              campaignName: campaign.name,
              followupNumber: 0,
            });

            // Insert into emails_sent
            const emailInsert = await db.query(
              `INSERT INTO emails_sent
                (campaign_id, campaign_lead_id, lead_id, brand_id, smtp_account_id,
                 ab_variant_id, from_email, from_name, to_email,
                 subject, body_html, body_text, followup_number, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 'queued')
               RETURNING id`,
              [
                campaign.id,
                pending.campaign_lead_id,
                pending.lead_id,
                brandId,
                smtpAccount.id,
                pending.ab_variant_id || null,
                smtpAccount.email_address,
                smtpAccount.display_name,
                pending.email,
                emailContent.subject,
                emailContent.bodyHtml,
                emailContent.bodyText,
              ]
            );

            const emailId = emailInsert.rows[0].id;

            // Update campaign_lead status to 'queued'
            await db.query(
              `UPDATE campaign_leads
               SET status = 'queued', updated_at = NOW()
               WHERE id = $1`,
              [pending.campaign_lead_id]
            );

            // Add to email queue with randomized delay
            const delay = randomDelay(campaign.min_delay_minutes, campaign.max_delay_minutes);

            await addEmailToQueue({
              emailId,
              campaignId: campaign.id,
              leadId: pending.lead_id,
              brandId,
              smtpAccountId: smtpAccount.id,
              campaignLeadId: pending.campaign_lead_id,
            }, delay);

            logger.debug('Queued initial email', {
              emailId,
              campaignId: campaign.id,
              leadId: pending.lead_id,
              delayMs: delay,
            });
          } catch (leadErr) {
            logger.error('Error processing pending lead', {
              campaignLeadId: pending.campaign_lead_id,
              campaignId: campaign.id,
              error: leadErr.message,
            });
            // Continue with next lead
          }
        }

        // ── Process follow-ups ─────────────────────────────────────────
        const followupResult = await db.query(
          `SELECT cl.id AS campaign_lead_id, cl.lead_id, cl.brand_id,
                  cl.followup_stage, cl.ab_variant_id,
                  l.full_name, l.email, l.industry, l.lead_type, l.project_details
           FROM campaign_leads cl
           JOIN leads l ON l.id = cl.lead_id
           WHERE cl.campaign_id = $1
             AND cl.next_followup_at <= NOW()
             AND cl.status = 'sent'
             AND l.unsubscribed = FALSE
           ORDER BY cl.next_followup_at ASC
           LIMIT 20`,
          [campaign.id]
        );

        for (const followup of followupResult.rows) {
          try {
            // Get previous email subject for context
            const prevEmailResult = await db.query(
              `SELECT subject FROM emails_sent
               WHERE campaign_id = $1 AND lead_id = $2
               ORDER BY created_at DESC
               LIMIT 1`,
              [campaign.id, followup.lead_id]
            );

            const previousSubject = prevEmailResult.rows.length > 0
              ? prevEmailResult.rows[0].subject
              : '';

            // Pick an SMTP account
            const smtpResult = await db.query(
              `SELECT id, email_address, display_name, daily_send_limit, sends_today
               FROM smtp_accounts
               WHERE brand_id = $1
                 AND is_active = TRUE
                 AND health_status != 'failed'
                 AND sends_today < daily_send_limit
               ORDER BY sends_today ASC
               LIMIT 1`,
              [brandId]
            );

            if (smtpResult.rows.length === 0) {
              logger.warn('No available SMTP accounts for follow-up, skipping', {
                campaignId: campaign.id,
                brandId,
              });
              break;
            }

            const smtpAccount = smtpResult.rows[0];
            const followupNumber = (followup.followup_stage || 0) + 1;

            // Generate follow-up email
            const emailContent = await generateEmail({
              lead: {
                id: followup.lead_id,
                full_name: followup.full_name,
                email: followup.email,
                industry: followup.industry,
                lead_type: followup.lead_type,
                project_details: followup.project_details,
              },
              brand,
              campaignName: campaign.name,
              followupNumber,
              previousSubject,
            });

            // Insert into emails_sent
            const emailInsert = await db.query(
              `INSERT INTO emails_sent
                (campaign_id, campaign_lead_id, lead_id, brand_id, smtp_account_id,
                 ab_variant_id, from_email, from_name, to_email,
                 subject, body_html, body_text, followup_number, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'queued')
               RETURNING id`,
              [
                campaign.id,
                followup.campaign_lead_id,
                followup.lead_id,
                brandId,
                smtpAccount.id,
                followup.ab_variant_id || null,
                smtpAccount.email_address,
                smtpAccount.display_name,
                followup.email,
                emailContent.subject,
                emailContent.bodyHtml,
                emailContent.bodyText,
                followupNumber,
              ]
            );

            const emailId = emailInsert.rows[0].id;

            // Update campaign_lead status back to queued for the follow-up
            await db.query(
              `UPDATE campaign_leads
               SET status = 'queued', updated_at = NOW()
               WHERE id = $1`,
              [followup.campaign_lead_id]
            );

            // Add to email queue with randomized delay
            const delay = randomDelay(campaign.min_delay_minutes, campaign.max_delay_minutes);

            await addEmailToQueue({
              emailId,
              campaignId: campaign.id,
              leadId: followup.lead_id,
              brandId,
              smtpAccountId: smtpAccount.id,
              campaignLeadId: followup.campaign_lead_id,
            }, delay);

            logger.debug('Queued follow-up email', {
              emailId,
              campaignId: campaign.id,
              leadId: followup.lead_id,
              followupNumber,
              delayMs: delay,
            });
          } catch (fuErr) {
            logger.error('Error processing follow-up', {
              campaignLeadId: followup.campaign_lead_id,
              campaignId: campaign.id,
              error: fuErr.message,
            });
            // Continue with next follow-up
          }
        }
      } catch (campaignErr) {
        logger.error('Error processing campaign', {
          campaignId: campaign.id,
          error: campaignErr.message,
        });
        // Continue with next campaign
      }
    }
  } catch (err) {
    logger.error('Fatal error in campaign processor', { error: err.message });
  }
}

/**
 * Daily reset: resets sends_today to 0 for all SMTP accounts.
 */
async function runDailyReset() {
  try {
    const result = await db.query(
      `UPDATE smtp_accounts
       SET sends_today = 0,
           sends_today_date = CURRENT_DATE,
           updated_at = NOW()
       RETURNING id`
    );

    logger.info('Daily SMTP send counters reset', {
      accountsReset: result.rowCount,
    });
  } catch (err) {
    logger.error('Failed to reset daily send counters', { error: err.message });
  }
}

async function runWarmupProgression() {
  try {
    await progressWarmup();
  } catch (err) {
    logger.error('Scheduled warmup progression failed', { error: err.message });
  }
}

async function runBlacklistChecks() {
  try {
    await checkAllBlacklists();
  } catch (err) {
    logger.error('Scheduled blacklist check failed', { error: err.message });
  }
}

/**
 * Monthly usage reset: resets emails_sent_this_month and phone_minutes_this_month
 * for all organizations where a full calendar month has elapsed since last reset.
 */
async function runMonthlyUsageReset() {
  try {
    const result = await db.query(
      `UPDATE organizations
       SET emails_sent_this_month = 0,
           phone_minutes_this_month = 0,
           usage_reset_at = NOW(),
           updated_at = NOW()
       WHERE usage_reset_at < date_trunc('month', NOW())
       RETURNING id, name`
    );

    if (result.rowCount > 0) {
      logger.info('Monthly usage counters reset', {
        organizationsReset: result.rowCount,
        orgIds: result.rows.map(r => r.id),
      });
    } else {
      logger.debug('No organizations needed usage reset');
    }
  } catch (err) {
    logger.error('Failed to reset monthly usage counters', { error: err.message });
  }
}

/**
 * Trial expiry check: marks expired trial organizations as read-only
 * and creates notifications for their admins.
 */
async function runTrialExpiryCheck() {
  try {
    // Find orgs whose trial just expired (trial_ends_at in the past, still on 'trial' plan)
    const result = await db.query(
      `SELECT o.id, o.name, o.trial_ends_at, o.owner_id
       FROM organizations o
       WHERE o.plan = 'trial'
         AND o.trial_ends_at IS NOT NULL
         AND o.trial_ends_at < NOW()`
    );

    for (const org of result.rows) {
      const daysExpired = Math.floor((Date.now() - new Date(org.trial_ends_at).getTime()) / (1000 * 60 * 60 * 24));

      // Day 12 warning (3 days before expiry) - handled in frontend via banner
      // Day 15+: trial fully expired - org goes read-only
      // We don't deactivate the org (is_active stays true so they can still view data)
      // The checkUsageLimit middleware blocks mutation requests for expired trials

      // Create notification for org owner about trial expiry
      if (daysExpired <= 1) {
        // Only notify on the first day of expiry to avoid spam
        const { createNotification } = require('../services/notifications');
        await createNotification({
          userId: org.owner_id,
          type: 'trial_expired',
          title: 'Your free trial has expired',
          message: `Your trial for "${org.name}" has ended. Upgrade to Starter ($5/mo) or Pro ($99/mo) to continue sending emails and making calls.`,
          metadata: {
            organizationId: org.id,
            trialEndsAt: org.trial_ends_at,
          },
        });

        logger.info('Trial expired notification sent', {
          orgId: org.id,
          orgName: org.name,
          ownerId: org.owner_id,
        });
      }
    }

    if (result.rows.length > 0) {
      logger.info('Trial expiry check complete', { expiredOrgs: result.rows.length });
    }
  } catch (err) {
    logger.error('Trial expiry check failed', { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Scheduler Initialization
// ---------------------------------------------------------------------------

/**
 * Reads configured intervals from system_settings and starts all cron jobs.
 * Returns an object with references to the scheduled tasks for testing/cleanup.
 */
async function startScheduler() {
  logger.info('Initializing scheduler worker...');

  const tasks = {};

  // ── Read intervals from system_settings ──────────────────────────────
  const sheetsPollIntervalSec = parseInt(await getSetting('sheets_poll_interval_seconds', 60), 10) || 60;
  const replyPollIntervalMin = parseInt(await getSetting('reply_poll_interval_minutes', 5), 10) || 5;
  const smtpHealthIntervalHours = parseInt(await getSetting('smtp_health_check_interval_hours', 6), 10) || 6;
  const aiAgentIntervalHours = parseInt(await getSetting('ai_agent_interval_hours', 2), 10) || 2;

  // ── (a) Google Sheets polling ────────────────────────────────────────
  // node-cron supports seconds: "*/N * * * * *" (six-field format)
  // For intervals under 60s, we use the seconds field.
  // For 60s exactly, run every minute.
  let sheetsCronExpr;
  if (sheetsPollIntervalSec < 60) {
    sheetsCronExpr = `*/${sheetsPollIntervalSec} * * * * *`;
  } else {
    const intervalMinutes = Math.max(1, Math.round(sheetsPollIntervalSec / 60));
    sheetsCronExpr = `*/${intervalMinutes} * * * *`;
  }

  tasks.sheetsPoll = cron.schedule(sheetsCronExpr, async () => {
    logger.debug('Cron: Google Sheets poll triggered');
    await runSheetsPoll();
  }, { scheduled: true });

  logger.info(`Scheduler: Google Sheets poll every ${sheetsPollIntervalSec}s`);

  // ── (b) Reply checking (IMAP) ───────────────────────────────────────
  tasks.replyCheck = cron.schedule(`*/${replyPollIntervalMin} * * * *`, async () => {
    logger.debug('Cron: Reply check triggered');
    await runReplyCheck();
  }, { scheduled: true });

  logger.info(`Scheduler: Reply check every ${replyPollIntervalMin}m`);

  // ── (c) SMTP health checks ──────────────────────────────────────────
  tasks.smtpHealthCheck = cron.schedule(`0 */${smtpHealthIntervalHours} * * *`, async () => {
    logger.debug('Cron: SMTP health check triggered');
    await runSmtpHealthChecks();
  }, { scheduled: true });

  logger.info(`Scheduler: SMTP health check every ${smtpHealthIntervalHours}h`);

  // ── (d) AI agent check ──────────────────────────────────────────────
  tasks.aiAgentCheck = cron.schedule(`0 */${aiAgentIntervalHours} * * *`, async () => {
    logger.debug('Cron: AI agent check triggered');
    await runAiAgentCheck();
  }, { scheduled: true });

  logger.info(`Scheduler: AI agent check every ${aiAgentIntervalHours}h`);

  // ── (e) Campaign processor - every minute ───────────────────────────
  tasks.campaignProcessor = cron.schedule('* * * * *', async () => {
    await runCampaignProcessor();
    await processSequenceSteps();
  }, { scheduled: true });

  logger.info('Scheduler: Campaign processor every 1m');

  // ── (f) Daily reset - midnight ──────────────────────────────────────
  tasks.dailyReset = cron.schedule('0 0 * * *', async () => {
    logger.info('Cron: Daily reset triggered');
    await runDailyReset();
  }, { scheduled: true });

  logger.info('Scheduler: Daily reset at midnight');

  // ── (g) Warmup progression - daily at 00:05 (after daily reset) ────
  tasks.warmupProgression = cron.schedule('5 0 * * *', async () => {
    logger.debug('Cron: Warmup progression triggered');
    await runWarmupProgression();
  }, { scheduled: true });
  logger.info('Scheduler: Warmup progression daily at 00:05');

  // ── (h) Blacklist checks - every 12 hours ──────────────────────────
  tasks.blacklistCheck = cron.schedule('0 */12 * * *', async () => {
    logger.debug('Cron: Blacklist check triggered');
    await runBlacklistChecks();
  }, { scheduled: true });
  logger.info('Scheduler: Blacklist check every 12h');

  // ── (i) Monthly usage reset - 1st of month at 00:10 ──────────────
  tasks.monthlyUsageReset = cron.schedule('10 0 1 * *', async () => {
    logger.info('Cron: Monthly usage reset triggered');
    await runMonthlyUsageReset();
  }, { scheduled: true });
  logger.info('Scheduler: Monthly usage reset on the 1st at 00:10');

  // ── (j) Trial expiry check - daily at 06:00 ──────────────────────
  tasks.trialExpiryCheck = cron.schedule('0 6 * * *', async () => {
    logger.debug('Cron: Trial expiry check triggered');
    await runTrialExpiryCheck();
  }, { scheduled: true });
  logger.info('Scheduler: Trial expiry check daily at 06:00');

  logger.info('Scheduler worker initialized successfully');

  return tasks;
}

module.exports = { startScheduler };
