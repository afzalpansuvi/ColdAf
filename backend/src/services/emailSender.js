const nodemailer = require('nodemailer');
const db = require('../config/database');
const env = require('../config/env');
const logger = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/encryption');

// Prevent email header injection by stripping CR, LF, and tab characters.
const sanitizeHeader = (v) => String(v ?? '').replace(/[\r\n\t]/g, ' ').trim();

// ---------------------------------------------------------------------------
// Transport / client cache (keyed by smtp account id) to avoid recreating
// connections on every send.
// ---------------------------------------------------------------------------
const transportCache = new Map();

/**
 * Creates (and caches) a nodemailer SMTP transport for the given account.
 *
 * @param {Object} smtpAccount - smtp_accounts row
 * @returns {import('nodemailer').Transporter}
 */
function createSmtpTransport(smtpAccount) {
  // Return cached transport if present
  if (transportCache.has(smtpAccount.id)) {
    return transportCache.get(smtpAccount.id);
  }

  const host = smtpAccount.smtp_host;
  const port = smtpAccount.smtp_port || 587;
  const secure = port === 465; // true for implicit TLS on port 465

  const transportConfig = {
    host,
    port,
    secure,
    pool: true,           // keep connections alive for reuse
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 30000, // 30 s
    greetingTimeout: 15000,
    socketTimeout: 60000,
  };

  // STARTTLS for non-465 ports when TLS is enabled
  if (smtpAccount.use_tls && !secure) {
    transportConfig.requireTLS = true;
  }

  // Auth credentials
  const auth = {};
  if (smtpAccount.smtp_username) {
    auth.user = smtpAccount.smtp_username;
  }
  if (smtpAccount.smtp_password_encrypted) {
    auth.pass = decrypt(smtpAccount.smtp_password_encrypted);
  }
  if (auth.user || auth.pass) {
    transportConfig.auth = auth;
  }

  const transport = nodemailer.createTransport(transportConfig);

  // Cache it
  transportCache.set(smtpAccount.id, transport);

  // If the pool emits an idle event after inactivity, close & remove it
  transport.on('idle', () => {
    // The pool will self-manage, but we can log for debugging
    logger.debug('SMTP transport pool idle', { accountId: smtpAccount.id });
  });

  return transport;
}

/**
 * Sends an email through the appropriate provider (smtp, sendgrid, mailgun).
 *
 * @param {Object}  params
 * @param {Object}  params.smtpAccount    - Full smtp_accounts row (with encrypted fields)
 * @param {string}  params.to             - Recipient email
 * @param {string}  params.from           - Sender email address
 * @param {string}  params.fromName       - Sender display name
 * @param {string}  params.subject        - Email subject
 * @param {string}  params.bodyHtml       - HTML body
 * @param {string}  params.bodyText       - Plain-text body
 * @param {string}  [params.replyTo]      - Reply-To address (defaults to from)
 * @param {Object}  [params.customHeaders]- Extra headers to attach
 * @param {string}  [params.unsubscribeUrl] - One-click unsubscribe URL
 * @returns {Promise<{ messageId: string|null, success: boolean, error: string|null }>}
 */
async function sendEmail({
  smtpAccount,
  to,
  from,
  fromName,
  subject,
  bodyHtml,
  bodyText,
  replyTo,
  customHeaders = {},
  unsubscribeUrl,
}) {
  if (!smtpAccount || !smtpAccount.provider) {
    return { messageId: null, success: false, error: 'Invalid SMTP account: missing provider' };
  }
  if (!to || !from || !subject) {
    return { messageId: null, success: false, error: 'Missing required fields: to, from, or subject' };
  }

  const provider = smtpAccount.provider;

  try {
    let result;

    switch (provider) {
      case 'smtp':
        result = await sendViaSMTP({ smtpAccount, to, from, fromName, subject, bodyHtml, bodyText, replyTo, customHeaders, unsubscribeUrl });
        break;
      case 'sendgrid':
        result = await sendViaSendGrid({ smtpAccount, to, from, fromName, subject, bodyHtml, bodyText, replyTo, customHeaders, unsubscribeUrl });
        break;
      case 'mailgun':
        result = await sendViaMailgun({ smtpAccount, to, from, fromName, subject, bodyHtml, bodyText, replyTo, customHeaders, unsubscribeUrl });
        break;
      case 'gmail':
        result = await sendViaGmail({ smtpAccount, to, from, fromName, subject, bodyHtml, bodyText, replyTo, customHeaders, unsubscribeUrl });
        break;
      default:
        return { messageId: null, success: false, error: `Unsupported provider: ${provider}` };
    }

    // Increment per-account daily counter on any successful send
    if (result && result.success) {
      try {
        await db.query(
          `UPDATE smtp_accounts
              SET sends_today = CASE
                    WHEN sends_today_date = CURRENT_DATE THEN sends_today + 1
                    ELSE 1
                  END,
                  sends_today_date = CURRENT_DATE,
                  updated_at = NOW()
            WHERE id = $1`,
          [smtpAccount.id]
        );
      } catch (counterErr) {
        logger.warn('Failed to increment sends_today', { error: counterErr.message, accountId: smtpAccount.id });
      }
    }

    logger.debug('Email sent successfully', {
      provider,
      to,
      messageId: result.messageId,
      accountId: smtpAccount.id,
    });

    return result;
  } catch (err) {
    logger.error('Email send failed', {
      provider,
      to,
      accountId: smtpAccount.id,
      error: err.message,
    });
    return { messageId: null, success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Provider-specific senders
// ---------------------------------------------------------------------------

/**
 * Sends via a raw SMTP server through nodemailer.
 */
async function sendViaSMTP({ smtpAccount, to, from, fromName, subject, bodyHtml, bodyText, replyTo, customHeaders, unsubscribeUrl }) {
  const transport = createSmtpTransport(smtpAccount);

  const headers = { ...customHeaders };

  // List-Unsubscribe (RFC 2369) - critical for deliverability
  if (unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  // --- Inject brand email signature if configured ---
  let finalBodyHtml = bodyHtml;
  try {
    if (smtpAccount.brand_id) {
      const sigResult = await db.query(
        'SELECT html_content FROM email_signatures WHERE brand_id = $1 AND is_default = true LIMIT 1',
        [smtpAccount.brand_id]
      );
      if (sigResult.rows.length > 0 && sigResult.rows[0].html_content) {
        finalBodyHtml = bodyHtml + '<br/><br/>' + sigResult.rows[0].html_content;
      }
    }
  } catch (sigErr) {
    // Non-critical, continue with original body
  }

  const mailOptions = {
    from: sanitizeHeader(fromName) ? `"${sanitizeHeader(fromName)}" <${from}>` : from,
    to,
    replyTo: sanitizeHeader(replyTo) || from,
    subject: sanitizeHeader(subject),
    html: finalBodyHtml,
    text: bodyText,
    headers,
  };

  const info = await transport.sendMail(mailOptions);

  return {
    messageId: info.messageId || null,
    success: true,
    error: null,
  };
}

/**
 * Sends via the SendGrid v3 API using @sendgrid/mail.
 */
async function sendViaSendGrid({ smtpAccount, to, from, fromName, subject, bodyHtml, bodyText, replyTo, customHeaders, unsubscribeUrl }) {
  // Lazy-require so the module is only loaded when actually needed
  const sgMail = require('@sendgrid/mail');

  // Decrypt the API key stored on the account; fall back to env-level key
  let apiKey;
  if (smtpAccount.api_key_encrypted) {
    apiKey = decrypt(smtpAccount.api_key_encrypted);
  } else {
    apiKey = env.sendgrid.apiKey;
  }

  if (!apiKey) {
    throw new Error('SendGrid API key not configured for this SMTP account');
  }

  sgMail.setApiKey(apiKey);

  const headers = { ...customHeaders };
  if (unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  // --- Inject brand email signature if configured ---
  let finalBodyHtml = bodyHtml;
  try {
    if (smtpAccount.brand_id) {
      const sigResult = await db.query(
        'SELECT html_content FROM email_signatures WHERE brand_id = $1 AND is_default = true LIMIT 1',
        [smtpAccount.brand_id]
      );
      if (sigResult.rows.length > 0 && sigResult.rows[0].html_content) {
        finalBodyHtml = bodyHtml + '<br/><br/>' + sigResult.rows[0].html_content;
      }
    }
  } catch (sigErr) {
    // Non-critical, continue with original body
  }

  const msg = {
    to,
    from: {
      email: from,
      name: sanitizeHeader(fromName) || undefined,
    },
    replyTo: sanitizeHeader(replyTo) || from,
    subject: sanitizeHeader(subject),
    html: finalBodyHtml,
    text: bodyText,
    headers,
    trackingSettings: {
      clickTracking: { enable: false },  // We handle our own tracking
      openTracking: { enable: false },
    },
  };

  const [response] = await sgMail.send(msg);

  // SendGrid returns the message ID in the x-message-id header
  const messageId = (response && response.headers && response.headers['x-message-id']) || null;

  return {
    messageId,
    success: true,
    error: null,
  };
}

/**
 * Sends via the Mailgun API using mailgun.js.
 */
async function sendViaMailgun({ smtpAccount, to, from, fromName, subject, bodyHtml, bodyText, replyTo, customHeaders, unsubscribeUrl }) {
  const formData = require('form-data');
  const Mailgun = require('mailgun.js');

  // Decrypt the API key; fall back to env-level key
  let apiKey;
  if (smtpAccount.api_key_encrypted) {
    apiKey = decrypt(smtpAccount.api_key_encrypted);
  } else {
    apiKey = env.mailgun.apiKey;
  }

  if (!apiKey) {
    throw new Error('Mailgun API key not configured for this SMTP account');
  }

  // Determine the sending domain. Prefer the SMTP account's primary domain
  // extracted from the from address, then fall back to the env-level domain.
  const domain = env.mailgun.domain || from.split('@')[1];

  if (!domain) {
    throw new Error('Mailgun domain not configured');
  }

  const mailgun = new Mailgun(formData);
  const mg = mailgun.client({
    username: 'api',
    key: apiKey,
  });

  const senderAddress = sanitizeHeader(fromName) ? `${sanitizeHeader(fromName)} <${from}>` : from;

  const headers = { ...customHeaders };
  if (unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  // --- Inject brand email signature if configured ---
  let finalBodyHtml = bodyHtml;
  try {
    if (smtpAccount.brand_id) {
      const sigResult = await db.query(
        'SELECT html_content FROM email_signatures WHERE brand_id = $1 AND is_default = true LIMIT 1',
        [smtpAccount.brand_id]
      );
      if (sigResult.rows.length > 0 && sigResult.rows[0].html_content) {
        finalBodyHtml = bodyHtml + '<br/><br/>' + sigResult.rows[0].html_content;
      }
    }
  } catch (sigErr) {
    // Non-critical, continue with original body
  }

  const msgData = {
    from: senderAddress,
    to: [to],
    subject: sanitizeHeader(subject),
    html: finalBodyHtml,
    text: bodyText,
    'h:Reply-To': sanitizeHeader(replyTo) || from,
    'o:tracking-clicks': 'no',
    'o:tracking-opens': 'no',
  };

  // Attach custom headers with h: prefix
  for (const [key, value] of Object.entries(headers)) {
    msgData[`h:${key}`] = value;
  }

  const response = await mg.messages.create(domain, msgData);

  return {
    messageId: (response && response.id) ? response.id.replace(/[<>]/g, '') : null,
    success: true,
    error: null,
  };
}

/**
 * Sends via Gmail using OAuth2 (primary) via nodemailer's native OAuth2 transport.
 * Falls back to XOAUTH2 refresh handled by nodemailer.
 */
async function sendViaGmail({ smtpAccount, to, from, fromName, subject, bodyHtml, bodyText, replyTo, customHeaders, unsubscribeUrl }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Gmail OAuth not configured: missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET');
  }
  if (!smtpAccount.oauth_refresh_token) {
    throw new Error('Gmail account missing refresh token — user must reconnect');
  }

  const refreshToken = decrypt(smtpAccount.oauth_refresh_token);
  const accessToken = smtpAccount.oauth_access_token
    ? decrypt(smtpAccount.oauth_access_token)
    : undefined;

  const gmailEmail = smtpAccount.oauth_email || smtpAccount.email_address;

  // Build a fresh transport per send; nodemailer handles token refresh internally.
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: gmailEmail,
      clientId,
      clientSecret,
      refreshToken,
      accessToken,
    },
  });

  const headers = { ...customHeaders };
  if (unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  // --- Inject brand email signature if configured ---
  let finalBodyHtml = bodyHtml;
  try {
    if (smtpAccount.brand_id) {
      const sigResult = await db.query(
        'SELECT html_content FROM email_signatures WHERE brand_id = $1 AND is_default = true LIMIT 1',
        [smtpAccount.brand_id]
      );
      if (sigResult.rows.length > 0 && sigResult.rows[0].html_content) {
        finalBodyHtml = bodyHtml + '<br/><br/>' + sigResult.rows[0].html_content;
      }
    }
  } catch (sigErr) {
    // Non-critical, continue with original body
  }

  const mailOptions = {
    from: sanitizeHeader(fromName) ? `"${sanitizeHeader(fromName)}" <${gmailEmail}>` : gmailEmail,
    to,
    replyTo: sanitizeHeader(replyTo) || from || gmailEmail,
    subject: sanitizeHeader(subject),
    html: finalBodyHtml,
    text: bodyText,
    headers,
  };

  try {
    const info = await transport.sendMail(mailOptions);

    // nodemailer attaches the refreshed access token to the response if one was generated
    if (info && info.accessToken && info.accessToken !== accessToken) {
      try {
        await db.query(
          `UPDATE smtp_accounts
             SET oauth_access_token = $1,
                 oauth_status = 'active',
                 updated_at = NOW()
           WHERE id = $2`,
          [encrypt(info.accessToken), smtpAccount.id]
        );
      } catch (saveErr) {
        logger.warn('Failed to persist refreshed Gmail access token', { error: saveErr.message });
      }
    }

    return { messageId: info.messageId || null, success: true, error: null };
  } catch (err) {
    // Detect revoked / expired token → mark account for re-consent
    const msg = String(err.message || '');
    if (/invalid_grant|invalid_token|unauthorized|401/i.test(msg)) {
      try {
        await db.query(
          `UPDATE smtp_accounts
             SET oauth_status = 'expired', updated_at = NOW()
           WHERE id = $1`,
          [smtpAccount.id]
        );
      } catch (_) {
        /* ignore */
      }
    }
    throw err;
  }
}

/**
 * Picks the best SMTP account from a campaign's rotation pool:
 * returns the account with the lowest sends_today / daily_send_limit ratio
 * that is still under its cap. Returns null if every account is capped.
 */
async function pickRotationAccount(campaignId) {
  const result = await db.query(
    `SELECT sa.*,
            (CASE WHEN sa.sends_today_date = CURRENT_DATE THEN sa.sends_today ELSE 0 END) AS effective_sends_today
       FROM campaign_smtp_accounts csa
       JOIN smtp_accounts sa ON sa.id = csa.smtp_account_id
      WHERE csa.campaign_id = $1
        AND sa.is_active = TRUE
        AND (sa.oauth_status IS NULL OR sa.oauth_status = 'active')
      ORDER BY (
        (CASE WHEN sa.sends_today_date = CURRENT_DATE THEN sa.sends_today ELSE 0 END)::float
        / NULLIF(sa.daily_send_limit, 0)
      ) ASC NULLS LAST`,
    [campaignId]
  );

  for (const row of result.rows) {
    const used = row.effective_sends_today || 0;
    const cap = row.daily_send_limit || 0;
    if (cap === 0 || used < cap) {
      return row;
    }
  }
  return null;
}

/**
 * Clears the cached transport for a specific SMTP account (useful on
 * credential rotation or account deactivation).
 *
 * @param {string} accountId - UUID of the smtp_account
 */
function clearTransportCache(accountId) {
  if (transportCache.has(accountId)) {
    const transport = transportCache.get(accountId);
    try {
      transport.close();
    } catch (_) {
      // ignore close errors
    }
    transportCache.delete(accountId);
    logger.debug('Transport cache cleared', { accountId });
  }
}

/**
 * Closes every cached transport. Call on graceful shutdown.
 */
function closeAllTransports() {
  for (const [accountId, transport] of transportCache.entries()) {
    try {
      transport.close();
    } catch (_) {
      // ignore
    }
  }
  transportCache.clear();
  logger.info('All SMTP transports closed');
}

module.exports = {
  sendEmail,
  sendViaGmail,
  pickRotationAccount,
  createSmtpTransport,
  clearTransportCache,
  closeAllTransports,
};
