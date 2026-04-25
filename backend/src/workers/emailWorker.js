const { emailQueue } = require('../config/redis');
const db = require('../config/database');
const env = require('../config/env');
const logger = require('../utils/logger');
const { decrypt } = require('../utils/encryption');
const emailSender = require('../services/emailSender');
const { createNotification } = require('../services/notifications');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_RETRIES = 3;
const REQUEUE_DELAY_MS = 30 * 60 * 1000; // 30 minutes
const WORKER_CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// Helper: today's date as YYYY-MM-DD in UTC
// ---------------------------------------------------------------------------
function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Main job processor
// ---------------------------------------------------------------------------
emailQueue.process(WORKER_CONCURRENCY, async (job) => {
  const { emailId, campaignId, leadId, brandId, smtpAccountId, campaignLeadId } = job.data;

  const jobTag = `[email:${emailId}]`;

  logger.info(`${jobTag} Processing email send job`, {
    emailId,
    campaignId,
    leadId,
    smtpAccountId,
    attempt: job.attemptsMade + 1,
  });

  // ── (a) Fetch the email record ─────────────────────────────────────
  const emailResult = await db.query(
    `SELECT * FROM emails_sent WHERE id = $1`,
    [emailId]
  );

  if (emailResult.rows.length === 0) {
    logger.error(`${jobTag} Email record not found, discarding job`, { emailId });
    return; // discard job (don't throw, that would retry)
  }

  const emailRecord = emailResult.rows[0];

  // If already sent / failed, skip
  if (emailRecord.status === 'sent' || emailRecord.status === 'delivered') {
    logger.warn(`${jobTag} Email already sent, skipping`, { status: emailRecord.status });
    return;
  }
  if (emailRecord.status === 'failed') {
    logger.warn(`${jobTag} Email already marked failed, skipping`);
    return;
  }

  // ── (b) Fetch and validate the SMTP account ───────────────────────
  const smtpResult = await db.query(
    `SELECT * FROM smtp_accounts WHERE id = $1`,
    [smtpAccountId]
  );

  if (smtpResult.rows.length === 0) {
    logger.error(`${jobTag} SMTP account not found`, { smtpAccountId });
    await markEmailFailed(emailId, campaignLeadId, campaignId, 'SMTP account not found');
    return;
  }

  const smtpAccount = smtpResult.rows[0];

  if (!smtpAccount.is_active) {
    logger.warn(`${jobTag} SMTP account is inactive, failing email`, { smtpAccountId });
    await markEmailFailed(emailId, campaignLeadId, campaignId, 'SMTP account is inactive');
    return;
  }

  // Gmail-specific: if OAuth token is expired/revoked, try rotating to another
  // Gmail account in the campaign's pool before giving up.
  if (smtpAccount.provider === 'gmail' && smtpAccount.oauth_status === 'expired') {
    const replacement = await emailSender.pickRotationAccount(campaignId);
    if (replacement && replacement.id !== smtpAccountId) {
      logger.warn(`${jobTag} Gmail account expired, rotating to ${replacement.id}`);
      await db.query(
        `UPDATE emails_sent SET smtp_account_id = $1, updated_at = NOW() WHERE id = $2`,
        [replacement.id, emailId]
      );
      await addEmailToQueue({ ...job.data, smtpAccountId: replacement.id }, 1000);
      return;
    }
    await markEmailFailed(
      emailId,
      campaignLeadId,
      campaignId,
      'Gmail OAuth expired — user must reconnect'
    );
    return;
  }

  // ── (c) Reset daily counter if the date has rolled over ────────────
  const today = todayDateString();
  const accountDate = smtpAccount.sends_today_date
    ? new Date(smtpAccount.sends_today_date).toISOString().slice(0, 10)
    : null;

  if (accountDate !== today) {
    await db.query(
      `UPDATE smtp_accounts
       SET sends_today = 0, sends_today_date = $1, updated_at = NOW()
       WHERE id = $2`,
      [today, smtpAccountId]
    );
    smtpAccount.sends_today = 0;
    smtpAccount.sends_today_date = today;
    logger.debug(`${jobTag} Reset daily send counter for SMTP account`, { smtpAccountId });
  }

  // ── (d) Check daily send limit ────────────────────────────────────
  if (smtpAccount.sends_today >= smtpAccount.daily_send_limit) {
    logger.warn(`${jobTag} SMTP account daily limit reached (${smtpAccount.sends_today}/${smtpAccount.daily_send_limit})`, {
      smtpAccountId,
    });

    // Try rotating to another account in the campaign's pool before re-queuing
    const replacement = await emailSender.pickRotationAccount(campaignId);
    if (replacement && replacement.id !== smtpAccountId) {
      logger.info(`${jobTag} Rotating to account ${replacement.id}`);
      await db.query(
        `UPDATE emails_sent SET smtp_account_id = $1, updated_at = NOW() WHERE id = $2`,
        [replacement.id, emailId]
      );
      await addEmailToQueue({ ...job.data, smtpAccountId: replacement.id }, 1000);
      return;
    }

    // No rotation available — re-queue with a 30-minute delay
    await addEmailToQueue(job.data, REQUEUE_DELAY_MS);
    return;
  }

  // ── (e) Send the email ─────────────────────────────────────────────
  const unsubscribeUrl = `${env.backendUrl}/api/leads/unsubscribe/${leadId}`;

  const sendResult = await emailSender.sendEmail({
    smtpAccount,
    to: emailRecord.to_email,
    from: emailRecord.from_email,
    fromName: emailRecord.from_name,
    subject: emailRecord.subject,
    bodyHtml: emailRecord.body_html,
    bodyText: emailRecord.body_text,
    replyTo: emailRecord.from_email,
    customHeaders: {},
    unsubscribeUrl,
  });

  if (sendResult.success) {
    // ── (f) Handle success ───────────────────────────────────────────
    await handleSendSuccess({
      emailId,
      campaignId,
      leadId,
      smtpAccountId,
      campaignLeadId,
      messageId: sendResult.messageId,
      emailRecord,
      jobTag,
    });
  } else {
    // ── (g) Handle failure ───────────────────────────────────────────
    await handleSendFailure({
      emailId,
      campaignId,
      leadId,
      smtpAccountId,
      campaignLeadId,
      errorMessage: sendResult.error,
      emailRecord,
      attemptsMade: job.attemptsMade,
      jobTag,
    });
  }
});

// ---------------------------------------------------------------------------
// Success handler
// ---------------------------------------------------------------------------
async function handleSendSuccess({ emailId, campaignId, leadId, smtpAccountId, campaignLeadId, messageId, emailRecord, jobTag }) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Update emails_sent -> 'sent'
    await client.query(
      `UPDATE emails_sent
       SET status = 'sent',
           sent_at = NOW(),
           message_id = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [messageId, emailId]
    );

    // (sends_today is incremented by emailSender.sendEmail after successful dispatch)

    // Update campaign total_sent
    await client.query(
      `UPDATE campaigns
       SET total_sent = total_sent + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [campaignId]
    );

    // ── Increment organization monthly email usage counter ──────────
    // Look up the org from the email record's organization_id (set at queue time)
    // or fall back to the campaign's org
    const orgResult = await client.query(
      `SELECT organization_id FROM campaigns WHERE id = $1`,
      [campaignId]
    );
    const orgId = orgResult.rows[0]?.organization_id;

    if (orgId) {
      // Increment org usage counter
      await client.query(
        `UPDATE organizations
         SET emails_sent_this_month = emails_sent_this_month + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [orgId]
      );

      // Record usage event for billing audit trail
      await client.query(
        `INSERT INTO usage_events (organization_id, event_type, quantity, metadata)
         VALUES ($1, 'email_sent', 1, $2)`,
        [orgId, JSON.stringify({ emailId, campaignId, leadId, smtpAccountId })]
      );
    }

    // Update campaign_leads status and last_sent_at
    if (campaignLeadId) {
      await client.query(
        `UPDATE campaign_leads
         SET status = 'sent',
             last_sent_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [campaignLeadId]
      );

      // Calculate next_followup_at if follow-ups are configured
      await scheduleNextFollowup(client, campaignLeadId, campaignId, emailRecord.followup_number);
    }

    // Update lead status to 'sent' (only escalate; don't overwrite higher statuses)
    await client.query(
      `UPDATE leads
       SET status = 'sent',
           updated_at = NOW()
       WHERE id = $1
         AND status IN ('new', 'queued')`,
      [leadId]
    );

    await client.query('COMMIT');

    logger.info(`${jobTag} Email sent successfully`, {
      emailId,
      messageId,
      to: emailRecord.to_email,
      organizationId: orgId || 'unknown',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(`${jobTag} Failed to update DB after successful send`, {
      error: err.message,
      emailId,
    });
    throw err; // Let Bull retry
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Follow-up scheduling helper
// ---------------------------------------------------------------------------
async function scheduleNextFollowup(client, campaignLeadId, campaignId, currentFollowupNumber) {
  // Fetch the campaign's followup config
  const campaignResult = await client.query(
    `SELECT followup_count, followup_delays FROM campaigns WHERE id = $1`,
    [campaignId]
  );

  if (campaignResult.rows.length === 0) return;

  const campaign = campaignResult.rows[0];
  const maxFollowups = campaign.followup_count || 0;
  const followupDelays = campaign.followup_delays || [];

  const nextStage = (currentFollowupNumber || 0) + 1;

  // If we've exhausted all follow-ups, nothing more to schedule
  if (nextStage > maxFollowups) {
    return;
  }

  // followup_delays is a JSON array like [3, 5] meaning 3 days, 5 days
  // Index is 0-based: delay for followup #1 is at index 0, #2 at index 1, etc.
  const delayIndex = nextStage - 1;
  const delayDays = (Array.isArray(followupDelays) && followupDelays[delayIndex])
    ? parseInt(followupDelays[delayIndex], 10)
    : 3; // default 3 days if not specified

  const nextFollowupAt = new Date();
  nextFollowupAt.setDate(nextFollowupAt.getDate() + delayDays);

  await client.query(
    `UPDATE campaign_leads
     SET followup_stage = $1,
         next_followup_at = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [nextStage, nextFollowupAt.toISOString(), campaignLeadId]
  );

  logger.debug('Scheduled next follow-up', {
    campaignLeadId,
    nextStage,
    delayDays,
    nextFollowupAt: nextFollowupAt.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Failure handler
// ---------------------------------------------------------------------------
async function handleSendFailure({ emailId, campaignId, leadId, smtpAccountId, campaignLeadId, errorMessage, emailRecord, attemptsMade, jobTag }) {
  const retryCount = (emailRecord.retry_count || 0) + 1;

  if (retryCount >= MAX_RETRIES) {
    // Retries exhausted - mark as permanently failed
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Mark email as failed
      await client.query(
        `UPDATE emails_sent
         SET status = 'failed',
             error_message = $1,
             retry_count = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [errorMessage, retryCount, emailId]
      );

      // Mark campaign_lead as failed
      if (campaignLeadId) {
        await client.query(
          `UPDATE campaign_leads
           SET status = 'failed',
               updated_at = NOW()
           WHERE id = $1`,
          [campaignLeadId]
        );
      }

      await client.query('COMMIT');

      logger.error(`${jobTag} Email permanently failed after ${retryCount} attempts`, {
        emailId,
        errorMessage,
        to: emailRecord.to_email,
      });

      // Create an admin notification
      await createNotification({
        userId: null, // all admins
        type: 'email_send_failed',
        title: `Email Send Failed: ${emailRecord.to_email}`,
        message: `Email to ${emailRecord.to_email} (campaign: ${campaignId}) failed after ${retryCount} attempts. Error: ${errorMessage}`,
        metadata: {
          emailId,
          campaignId,
          leadId,
          smtpAccountId,
          toEmail: emailRecord.to_email,
          error: errorMessage,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`${jobTag} Failed to update DB after send failure`, {
        error: err.message,
        emailId,
      });
    } finally {
      client.release();
    }
  } else {
    // Increment retry count and let Bull handle the next retry via its built-in
    // exponential backoff (configured in the queue defaults).
    await db.query(
      `UPDATE emails_sent
       SET retry_count = $1,
           error_message = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [retryCount, errorMessage, emailId]
    );

    logger.warn(`${jobTag} Email send attempt failed, will retry`, {
      emailId,
      retryCount,
      maxRetries: MAX_RETRIES,
      errorMessage,
    });

    // Throw so Bull's own retry mechanism kicks in
    throw new Error(`Send failed (attempt ${retryCount}/${MAX_RETRIES}): ${errorMessage}`);
  }
}

// ---------------------------------------------------------------------------
// Mark email as failed (used for non-retryable errors like missing account)
// ---------------------------------------------------------------------------
async function markEmailFailed(emailId, campaignLeadId, campaignId, errorMessage) {
  try {
    await db.query(
      `UPDATE emails_sent
       SET status = 'failed',
           error_message = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [errorMessage, emailId]
    );

    if (campaignLeadId) {
      await db.query(
        `UPDATE campaign_leads
         SET status = 'failed',
             updated_at = NOW()
         WHERE id = $1`,
        [campaignLeadId]
      );
    }

    await createNotification({
      userId: null,
      type: 'email_send_failed',
      title: 'Email Send Failed',
      message: `Email ${emailId} failed: ${errorMessage}`,
      metadata: { emailId, campaignId, error: errorMessage },
    });
  } catch (err) {
    logger.error('Failed to mark email as failed in DB', {
      error: err.message,
      emailId,
    });
  }
}

// ---------------------------------------------------------------------------
// Queue event handlers
// ---------------------------------------------------------------------------
emailQueue.on('completed', (job, result) => {
  logger.debug('Email job completed', {
    jobId: job.id,
    emailId: job.data.emailId,
  });
});

emailQueue.on('failed', (job, err) => {
  logger.error('Email job failed', {
    jobId: job.id,
    emailId: job.data.emailId,
    error: err.message,
    attemptsMade: job.attemptsMade,
  });
});

emailQueue.on('stalled', (job) => {
  logger.warn('Email job stalled', {
    jobId: job.id,
    emailId: job.data ? job.data.emailId : 'unknown',
  });
});

emailQueue.on('error', (err) => {
  logger.error('Email queue error', { error: err.message });
});

// ---------------------------------------------------------------------------
// Public: add an email job to the queue
// ---------------------------------------------------------------------------

/**
 * Adds an email send job to the Bull queue.
 *
 * @param {Object} emailData - Job payload: { emailId, campaignId, leadId, brandId, smtpAccountId, campaignLeadId }
 * @param {number} [delay]   - Optional delay in milliseconds before the job becomes processable
 * @returns {Promise<import('bull').Job>}
 */
async function addEmailToQueue(emailData, delay) {
  if (!emailData || !emailData.emailId) {
    throw new Error('addEmailToQueue requires emailData with at least emailId');
  }

  const jobOpts = {};

  if (delay && delay > 0) {
    jobOpts.delay = delay;
  }

  // Use emailId as the job ID to prevent duplicate queue entries for the same email
  jobOpts.jobId = `email-${emailData.emailId}`;

  // If re-queuing (e.g. daily limit hit), remove any duplicate-ID restriction
  // by appending a timestamp so the new delayed job is accepted.
  if (delay && delay > 0) {
    jobOpts.jobId = `email-${emailData.emailId}-${Date.now()}`;
  }

  const job = await emailQueue.add(emailData, jobOpts);

  logger.debug('Email job added to queue', {
    jobId: job.id,
    emailId: emailData.emailId,
    delay: delay || 0,
  });

  return job;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  addEmailToQueue,
  emailQueue,
};
