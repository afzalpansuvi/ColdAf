const Imap = require('imap');
const { simpleParser } = require('mailparser');
const db = require('../config/database');
const logger = require('../utils/logger');
const { decrypt } = require('../utils/encryption');
const { createNotification, triggerEventNotifications } = require('./notifications');

// ---------------------------------------------------------------------------
// OOO Detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the subject or body text matches common out-of-office patterns.
 *
 * @param {string} subject
 * @param {string} bodyText
 * @returns {boolean}
 */
function detectOutOfOffice(subject = '', bodyText = '') {
  const oooPatterns = [
    /out of (the )?office/i,
    /on (annual )?leave/i,
    /away from (the )?office/i,
    /automatic(ally)? reply/i,
    /auto[\s-]?reply/i,
    /i('m| am) currently (out|away|unavailable)/i,
    /away until/i,
    /returning (on|around)/i,
    /back (on|in the office)/i,
    /holiday (from|until)/i,
  ];
  const text = `${subject} ${bodyText}`;
  return oooPatterns.some(p => p.test(text));
}

/**
 * Attempts to extract a return date from an OOO email body.
 * Returns a Date if found and parseable, otherwise null.
 *
 * @param {string} bodyText
 * @returns {Date|null}
 */
function extractReturnDate(bodyText = '') {
  const datePatterns = [
    /returning (?:on |around )?(\w+ \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?)/i,
    /back (?:on |in the office )?(\w+ \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?)/i,
    /return(?:ing)? (?:on )?(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i,
  ];
  for (const pattern of datePatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// AI Suggested Reply Generation
// ---------------------------------------------------------------------------

/**
 * Generates a short suggested reply using the AI provider based on sentiment.
 * Returns null on failure or if no prompt is defined for the given sentiment.
 *
 * @param {string} originalSubject
 * @param {string} replyText
 * @param {string} sentiment
 * @param {Object|null} brand  - Brand row (may include calendly_link, ai_system_prompt)
 * @param {string|null} organizationId
 * @returns {Promise<string|null>}
 */
async function generateSuggestedReply(originalSubject, replyText, sentiment, brand, organizationId) {
  const prompts = {
    interested: `The prospect replied with interest to a cold email. Write a brief, friendly reply (2-3 sentences) that:
1. Acknowledges their interest warmly
2. Suggests booking a quick call${brand && brand.calendly_link ? ` using this link: ${brand.calendly_link}` : ''}
3. Ends with a clear call to action

Prospect's reply: "${replyText}"
Keep the response professional and concise.`,

    objection: `The prospect raised an objection in response to a cold email. Write a brief, empathetic reply (2-3 sentences) that:
1. Acknowledges their concern without being defensive
2. Briefly addresses the objection
3. Keeps the door open

Brand context: ${brand && brand.ai_system_prompt ? brand.ai_system_prompt.slice(0, 200) : ''}
Prospect's objection: "${replyText}"`,

    not_interested: `Write a short, gracious reply (1-2 sentences) to someone who said they're not interested in a cold email. Be respectful, thank them, and leave the door open for the future.
Their reply: "${replyText}"`,
  };

  const prompt = prompts[sentiment];
  if (!prompt) return null;

  try {
    const { generateCompletion } = require('./aiProvider');
    const response = await generateCompletion({
      model: 'claude-haiku-3-5',
      systemPrompt: 'You write concise, professional cold-email follow-up replies. Return only the reply text with no preamble.',
      userPrompt: prompt,
      maxTokens: 200,
      organizationId: organizationId || null,
    });
    return (response.text || '').trim() || null;
  } catch (err) {
    logger.warn('Failed to generate reply suggestion', { error: err.message });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Opens an IMAP connection using decrypted credentials from the SMTP account.
 *
 * @param {Object} smtpAccount - smtp_accounts row with IMAP fields
 * @returns {Promise<Imap>} Connected IMAP client
 */
function connectImap(smtpAccount) {
  return new Promise((resolve, reject) => {
    let password;
    try {
      password = decrypt(smtpAccount.imap_password_encrypted);
    } catch (err) {
      return reject(new Error(`Failed to decrypt IMAP password for account ${smtpAccount.id}: ${err.message}`));
    }

    const imap = new Imap({
      user: smtpAccount.imap_username,
      password,
      host: smtpAccount.imap_host,
      port: smtpAccount.imap_port || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 30000,
      authTimeout: 15000,
    });

    imap.once('ready', () => resolve(imap));
    imap.once('error', (err) => reject(err));
    imap.connect();
  });
}

/**
 * Opens a mailbox (folder) on the IMAP connection.
 *
 * @param {Imap} imap      - Connected IMAP client
 * @param {string} boxName - Mailbox name (e.g. 'INBOX')
 * @param {boolean} readOnly - Whether to open read-only
 * @returns {Promise<Object>} Mailbox info
 */
function openBox(imap, boxName, readOnly = false) {
  return new Promise((resolve, reject) => {
    imap.openBox(boxName, readOnly, (err, box) => {
      if (err) return reject(err);
      resolve(box);
    });
  });
}

/**
 * Searches for messages matching the given criteria.
 *
 * @param {Imap} imap       - Connected IMAP client
 * @param {Array} criteria  - IMAP search criteria
 * @returns {Promise<number[]>} Array of message UIDs
 */
function searchMessages(imap, criteria) {
  return new Promise((resolve, reject) => {
    imap.search(criteria, (err, uids) => {
      if (err) return reject(err);
      resolve(uids || []);
    });
  });
}

/**
 * Fetches and parses a single message by UID.
 *
 * @param {Imap} imap - Connected IMAP client
 * @param {number} uid - Message UID
 * @returns {Promise<Object>} Parsed email object from mailparser
 */
function fetchMessage(imap, uid) {
  return new Promise((resolve, reject) => {
    const fetch = imap.fetch([uid], { bodies: '', struct: true });
    let rawBuffer = Buffer.alloc(0);

    fetch.on('message', (msg) => {
      msg.on('body', (stream) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          rawBuffer = Buffer.concat(chunks);
        });
      });
    });

    fetch.once('error', (err) => reject(err));
    fetch.once('end', async () => {
      if (rawBuffer.length === 0) {
        return resolve(null);
      }
      try {
        const parsed = await simpleParser(rawBuffer);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Marks a message as seen (read) on the IMAP server.
 *
 * @param {Imap} imap - Connected IMAP client
 * @param {number} uid - Message UID
 * @returns {Promise<void>}
 */
function markAsSeen(imap, uid) {
  return new Promise((resolve, reject) => {
    imap.addFlags([uid], ['\\Seen'], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Safely closes and destroys an IMAP connection.
 *
 * @param {Imap} imap - IMAP client
 */
function disconnectImap(imap) {
  try {
    imap.end();
  } catch (_) {
    try {
      imap.destroy();
    } catch (__) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extracts a short text snippet from an email body.
 *
 * @param {string} text - Plain text body
 * @param {number} maxLen - Maximum snippet length
 * @returns {string}
 */
function getSnippet(text, maxLen = 150) {
  if (!text) return '';
  const cleaned = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.substring(0, maxLen) + '...';
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Checks for new replies on a single SMTP account's IMAP inbox.
 * For each UNSEEN message:
 *  1. Parses the email
 *  2. Tries to match it to an outbound email via In-Reply-To header or sender address
 *  3. Records the reply and updates all related tables
 *  4. Creates notifications and triggers webhooks
 *  5. Marks the message as seen on IMAP
 *
 * @param {Object} smtpAccount - Full smtp_accounts row
 * @returns {Promise<{ processed: number, errors: number }>}
 */
async function checkReplies(smtpAccount) {
  let imap;
  let processed = 0;
  let errors = 0;

  try {
    imap = await connectImap(smtpAccount);
    await openBox(imap, 'INBOX', false);

    const unseenUids = await searchMessages(imap, ['UNSEEN']);

    if (unseenUids.length === 0) {
      logger.debug('No unseen messages found', { accountId: smtpAccount.id });
      disconnectImap(imap);
      return { processed: 0, errors: 0 };
    }

    logger.info('Found unseen messages', {
      accountId: smtpAccount.id,
      count: unseenUids.length,
    });

    for (const uid of unseenUids) {
      try {
        const parsed = await fetchMessage(imap, uid);
        if (!parsed) {
          logger.warn('Empty message fetched, skipping', { uid, accountId: smtpAccount.id });
          continue;
        }

        const fromAddress = parsed.from && parsed.from.value && parsed.from.value[0]
          ? parsed.from.value[0].address
          : null;
        const fromName = parsed.from && parsed.from.value && parsed.from.value[0]
          ? parsed.from.value[0].name || fromAddress
          : 'Unknown';
        const toAddress = parsed.to && parsed.to.value && parsed.to.value[0]
          ? parsed.to.value[0].address
          : smtpAccount.email_address;
        const inReplyTo = parsed.inReplyTo || null;
        const messageId = parsed.messageId || null;
        const subject = parsed.subject || '(no subject)';
        const bodyHtml = parsed.html || null;
        const bodyText = parsed.text || null;

        if (!fromAddress) {
          logger.warn('Message has no from address, skipping', { uid, accountId: smtpAccount.id });
          await markAsSeen(imap, uid);
          continue;
        }

        // --- Attempt to match to an outbound email ---
        let matchedEmail = null;

        // Strategy 1: Match by In-Reply-To header against message_id in emails_sent
        if (inReplyTo) {
          const replyToResult = await db.query(
            `SELECT es.id, es.lead_id, es.campaign_id, es.brand_id, es.smtp_account_id,
                    l.full_name AS lead_name, l.email AS lead_email
             FROM emails_sent es
             JOIN leads l ON l.id = es.lead_id
             WHERE es.message_id = $1
             LIMIT 1`,
            [inReplyTo]
          );

          if (replyToResult.rows.length > 0) {
            matchedEmail = replyToResult.rows[0];
          }
        }

        // Strategy 2: Match from address against lead emails
        if (!matchedEmail && fromAddress) {
          const leadMatchResult = await db.query(
            `SELECT es.id, es.lead_id, es.campaign_id, es.brand_id, es.smtp_account_id,
                    l.full_name AS lead_name, l.email AS lead_email
             FROM emails_sent es
             JOIN leads l ON l.id = es.lead_id
             WHERE l.email = $1
             ORDER BY es.sent_at DESC
             LIMIT 1`,
            [fromAddress.toLowerCase()]
          );

          if (leadMatchResult.rows.length > 0) {
            matchedEmail = leadMatchResult.rows[0];
          }
        }

        if (!matchedEmail) {
          // Could not match this reply to any outbound email — skip but mark seen
          logger.debug('Unmatched inbound email, skipping', {
            from: fromAddress,
            subject,
            accountId: smtpAccount.id,
          });
          await markAsSeen(imap, uid);
          continue;
        }

        const orgId = smtpAccount.organization_id || null;

        // --- OOO detection: handle before general classification ---
        if (detectOutOfOffice(subject, bodyText || '')) {
          const returnDate = extractReturnDate(bodyText || '');
          const resumeAt = returnDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          // Insert reply_messages row with sentiment 'ooo'
          await db.query(
            `INSERT INTO reply_messages
              (email_id, lead_id, campaign_id, brand_id, smtp_account_id,
               direction, from_email, to_email, subject, body_html, body_text,
               message_id, in_reply_to, sentiment, is_read, organization_id)
             VALUES ($1, $2, $3, $4, $5, 'inbound', $6, $7, $8, $9, $10, $11, $12, 'ooo', FALSE, $13)`,
            [
              matchedEmail.id,
              matchedEmail.lead_id,
              matchedEmail.campaign_id,
              matchedEmail.brand_id,
              matchedEmail.smtp_account_id,
              fromAddress,
              toAddress,
              subject,
              bodyHtml,
              bodyText,
              messageId,
              inReplyTo,
              orgId,
            ]
          );

          // Update campaign_leads: pause sequence until return date
          await db.query(
            `UPDATE campaign_leads SET status = 'ooo', next_followup_at = $1, updated_at = NOW()
             WHERE lead_id = $2 AND campaign_id = $3`,
            [resumeAt, matchedEmail.lead_id, matchedEmail.campaign_id]
          );

          await markAsSeen(imap, uid);
          processed++;
          logger.info(`OOO reply from ${fromAddress}. Resuming sequence at ${resumeAt.toISOString()}`, {
            leadId: matchedEmail.lead_id,
            campaignId: matchedEmail.campaign_id,
          });
          continue;
        }

        // --- Insert reply_messages record (with organization scope) ---
        const insertResult = await db.query(
          `INSERT INTO reply_messages
            (email_id, lead_id, campaign_id, brand_id, smtp_account_id,
             direction, from_email, to_email, subject, body_html, body_text,
             message_id, in_reply_to, is_read, organization_id)
           VALUES ($1, $2, $3, $4, $5, 'inbound', $6, $7, $8, $9, $10, $11, $12, FALSE, $13)
           RETURNING id`,
          [
            matchedEmail.id,
            matchedEmail.lead_id,
            matchedEmail.campaign_id,
            matchedEmail.brand_id,
            matchedEmail.smtp_account_id,
            fromAddress,
            toAddress,
            subject,
            bodyHtml,
            bodyText,
            messageId,
            inReplyTo,
            orgId,
          ]
        );

        const replyMessageId = insertResult.rows[0]?.id || null;

        // --- Classify reply sentiment with AI (uses org's own API key) ---
        let classifiedSentiment = null;
        try {
          const { generateCompletion } = require('./aiProvider');
          const sentimentResult = await generateCompletion({
            model: 'claude-haiku-3-5',
            systemPrompt: 'Classify this email reply into exactly one category. Return ONLY the category name, nothing else. Categories: interested, meeting_booked, not_interested, out_of_office, unsubscribe_request, wrong_person, auto_reply',
            userPrompt: `Subject: ${subject}\n\nBody:\n${bodyText || '(no text content)'}`,
            maxTokens: 20,
            organizationId: orgId,
          });
          const sentiment = (sentimentResult.text || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
          const validSentiments = ['interested', 'meeting_booked', 'not_interested', 'out_of_office', 'unsubscribe_request', 'wrong_person', 'auto_reply'];
          if (validSentiments.includes(sentiment)) {
            classifiedSentiment = sentiment;
            logger.debug('Reply sentiment classified', { sentiment, leadId: matchedEmail.lead_id });
          }
        } catch (sentimentErr) {
          logger.warn('Failed to classify reply sentiment', { error: sentimentErr.message, leadId: matchedEmail.lead_id });
          // Non-critical - continue processing
        }

        // --- Generate AI suggested reply ---
        let suggestedResponse = null;
        if (classifiedSentiment) {
          try {
            // Fetch brand for context (calendly link, system prompt)
            let brand = null;
            if (matchedEmail.brand_id) {
              const brandRes = await db.query(
                `SELECT calendly_link, ai_system_prompt FROM brands WHERE id = $1 LIMIT 1`,
                [matchedEmail.brand_id]
              );
              brand = brandRes.rows[0] || null;
            }
            suggestedResponse = await generateSuggestedReply(subject, bodyText || '', classifiedSentiment, brand, orgId);
          } catch (suggErr) {
            logger.warn('Failed to generate suggested reply', { error: suggErr.message, leadId: matchedEmail.lead_id });
          }
        }

        // --- Persist sentiment and suggested_response ---
        if (replyMessageId && (classifiedSentiment || suggestedResponse)) {
          const setParts = [];
          const updateParams = [];
          let pIdx = 1;
          if (classifiedSentiment) {
            setParts.push(`sentiment = $${pIdx++}`);
            updateParams.push(classifiedSentiment);
          }
          if (suggestedResponse) {
            setParts.push(`suggested_response = $${pIdx++}`);
            updateParams.push(suggestedResponse);
          }
          updateParams.push(replyMessageId);
          await db.query(
            `UPDATE reply_messages SET ${setParts.join(', ')} WHERE id = $${pIdx}`,
            updateParams
          );
        }

        // --- Update emails_sent status to 'replied' ---
        await db.query(
          `UPDATE emails_sent
           SET status = 'replied', replied_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status != 'replied'`,
          [matchedEmail.id]
        );

        // --- Update campaign_leads status to 'replied' ---
        await db.query(
          `UPDATE campaign_leads
           SET status = 'replied', next_followup_at = NULL, updated_at = NOW()
           WHERE campaign_id = $1 AND lead_id = $2`,
          [matchedEmail.campaign_id, matchedEmail.lead_id]
        );

        // --- Update lead status to 'replied' ---
        await db.query(
          `UPDATE leads
           SET status = 'replied', updated_at = NOW()
           WHERE id = $1`,
          [matchedEmail.lead_id]
        );

        // --- Increment campaign total_replied ---
        await db.query(
          `UPDATE campaigns
           SET total_replied = COALESCE(total_replied, 0) + 1, updated_at = NOW()
           WHERE id = $1`,
          [matchedEmail.campaign_id]
        );

        // --- Update lead score for reply ---
        await db.query(
          'UPDATE leads SET score = COALESCE(score, 0) + 5, updated_at = NOW() WHERE id = $1',
          [matchedEmail.lead_id]
        );

        // --- Create notification for all users ---
        const snippet = getSnippet(bodyText);
        const notifTitle = `New reply from ${matchedEmail.lead_name || fromAddress}`;
        const notifMessage = snippet
          ? `${matchedEmail.lead_name || fromAddress} replied: ${snippet}`
          : `${matchedEmail.lead_name || fromAddress} replied to your email.`;

        await createNotification({
          userId: null, // Broadcast to all admins
          type: 'reply_received',
          title: notifTitle,
          message: notifMessage,
          metadata: {
            leadId: matchedEmail.lead_id,
            leadEmail: matchedEmail.lead_email,
            leadName: matchedEmail.lead_name,
            campaignId: matchedEmail.campaign_id,
            emailId: matchedEmail.id,
            snippet,
          },
        });

        // --- Trigger event notifications (Discord, webhooks) ---
        await triggerEventNotifications('reply_received', {
          leadEmail: matchedEmail.lead_email,
          leadName: matchedEmail.lead_name,
          campaignId: matchedEmail.campaign_id,
          brandId: matchedEmail.brand_id,
          snippet,
        });

        // --- Mark as seen on IMAP ---
        await markAsSeen(imap, uid);

        processed++;

        logger.info('Reply processed', {
          from: fromAddress,
          leadId: matchedEmail.lead_id,
          campaignId: matchedEmail.campaign_id,
          emailId: matchedEmail.id,
          accountId: smtpAccount.id,
        });
      } catch (msgErr) {
        errors++;
        logger.error('Error processing message', {
          uid,
          accountId: smtpAccount.id,
          error: msgErr.message,
          stack: msgErr.stack,
        });
        // Continue with next message
      }
    }

    disconnectImap(imap);
  } catch (err) {
    if (imap) {
      disconnectImap(imap);
    }
    logger.error('IMAP connection error for reply tracking', {
      accountId: smtpAccount.id,
      email: smtpAccount.email_address,
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }

  return { processed, errors };
}

/**
 * Checks replies across all active SMTP accounts that have IMAP configured.
 * Processes each account sequentially to avoid overwhelming IMAP servers.
 *
 * @returns {Promise<{ totalProcessed: number, totalErrors: number, accountsChecked: number }>}
 */
async function checkAllAccounts() {
  let totalProcessed = 0;
  let totalErrors = 0;
  let accountsChecked = 0;

  try {
    // Query all active SMTP accounts with IMAP configured (include org context)
    const accountsResult = await db.query(
      `SELECT sa.id, sa.brand_id, sa.email_address, sa.display_name, sa.provider,
              sa.smtp_host, sa.smtp_port, sa.smtp_username, sa.smtp_password_encrypted, sa.use_tls,
              sa.imap_host, sa.imap_port, sa.imap_username, sa.imap_password_encrypted,
              sa.api_key_encrypted, sa.organization_id
       FROM smtp_accounts sa
       LEFT JOIN organizations o ON o.id = sa.organization_id
       WHERE sa.is_active = TRUE
         AND sa.imap_host IS NOT NULL
         AND sa.imap_host != ''
         AND sa.imap_username IS NOT NULL
         AND sa.imap_username != ''
         AND sa.imap_password_encrypted IS NOT NULL
         AND sa.imap_password_encrypted != ''
         AND (o.is_active = TRUE OR sa.organization_id IS NULL)`
    );

    if (accountsResult.rows.length === 0) {
      logger.debug('No IMAP-configured accounts found for reply tracking');
      return { totalProcessed: 0, totalErrors: 0, accountsChecked: 0 };
    }

    logger.info('Starting reply check across accounts', {
      accountCount: accountsResult.rows.length,
    });

    for (const account of accountsResult.rows) {
      try {
        const result = await checkReplies(account);
        totalProcessed += result.processed;
        totalErrors += result.errors;
        accountsChecked++;

        if (result.processed > 0) {
          logger.info('Account reply check complete', {
            accountId: account.id,
            email: account.email_address,
            processed: result.processed,
            errors: result.errors,
          });
        }
      } catch (accountErr) {
        totalErrors++;
        logger.error('Failed to check replies for account', {
          accountId: account.id,
          email: account.email_address,
          error: accountErr.message,
        });
        // Continue with next account
      }
    }

    logger.info('Reply check complete', {
      accountsChecked,
      totalProcessed,
      totalErrors,
    });
  } catch (err) {
    logger.error('Fatal error in checkAllAccounts', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }

  return { totalProcessed, totalErrors, accountsChecked };
}

module.exports = {
  checkReplies,
  checkAllAccounts,
};
