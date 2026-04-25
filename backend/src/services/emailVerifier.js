const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const logger = require('../utils/logger');

// ─── Email Verification Service ──────────────────────────────────────────────
//
// Verifies email addresses using MX record lookups, SMTP handshake checks,
// and disposable-domain detection. Supports single and bulk verification with
// concurrency control and in-memory caching.
// ─────────────────────────────────────────────────────────────────────────────

/** Per-check timeout in milliseconds */
const SMTP_TIMEOUT = 10000;

/** Cache TTL: 24 hours */
const CACHE_TTL = 24 * 60 * 60 * 1000;

/** In-memory verification result cache keyed by normalised email */
const verificationCache = new Map();

/** Maximum concurrent SMTP handshakes during bulk verification */
const BULK_CONCURRENCY = 10;

// ─── Disposable Email Domains ────────────────────────────────────────────────

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.de', 'grr.la', 'guerrillamailblock.com', 'tempmail.com',
  'temp-mail.org', 'throwaway.email', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'sharklasers.com', 'guerrillamail.info', 'spam4.me', 'trashmail.com',
  'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashymail.com',
  'dispostable.com', 'mailnesia.com', 'maildrop.cc', 'discard.email',
  'fakeinbox.com', 'mailcatch.com', 'mintemail.com', 'tempail.com',
  'tempr.email', 'throwam.com', 'wegwerfmail.de', 'wegwerfmail.net',
  'mytemp.email', 'mohmal.com', 'burner.kiwi', 'getnada.com',
  'harakirimail.com', 'jetable.org', 'mailexpire.com', 'mailforspam.com',
  'mailhazard.com', 'mailhazard.us', 'mailimate.com', 'mailnull.com',
  'mailscrap.com', 'mailshell.com', 'mailsiphon.com', 'mailtemp.info',
  'mailzilla.com', 'nomail.xl.cx', 'objectmail.com', 'obobbo.com',
  'proxymail.eu', 'rcpt.at', 'reallymymail.com', 'recode.me',
  'regbypass.com', 'safetymail.info', 'spambox.us', 'spamcero.com',
  'spamfree24.com', 'spamgourmet.com', 'spammotel.com', 'spaml.com',
  'tempomail.fr', 'temporaryemail.net', 'temporarymail.org', 'thankyou2010.com',
  'trashemail.de', 'trashmail.at', 'trbvm.com', 'uggsrock.com',
  'upliftnow.com', 'venompen.com', 'veryreallybigmail.com', 'viditag.com',
  'wuzup.net', 'xagloo.com', 'zetmail.com', 'zippymail.info',
  'emailondeck.com', 'instantemailaddress.com', 'crazymailing.com',
  '10minutemail.com', '10minutemail.net', '20minutemail.com',
  'tempinbox.com', 'mailnator.com', 'binkmail.com', 'bobmail.info',
  'chammy.info', 'devnullmail.com', 'dodgit.com', 'dodgeit.com',
  'e4ward.com', 'emailigo.de', 'emailsensei.com', 'emailtemporario.com.br',
  'ephemail.net', 'filzmail.com', 'inboxalias.com', 'incognitomail.org',
  'ipoo.org', 'kasmail.com', 'koszmail.pl', 'kurzepost.de',
  'letthemeatspam.com', 'lhsdv.com', 'lookugly.com', 'lr78.com',
  'maileater.com', 'mailexpire.com', 'mailfreeonline.com', 'mailguard.me',
]);

// ─── Single Email Verification ───────────────────────────────────────────────

/**
 * Verifies a single email address by checking syntax, disposable domain,
 * MX records, and performing an SMTP handshake.
 *
 * Results are cached in memory for 24 hours to avoid repeated lookups.
 *
 * @param {string} email - The email address to verify
 * @returns {Promise<{ status: 'valid'|'invalid'|'risky'|'catch_all'|'unknown', reason: string, mxRecords: Array }>}
 */
async function verifyEmail(email) {
  if (!email || typeof email !== 'string') {
    return { status: 'invalid', reason: 'Empty or non-string email', mxRecords: [] };
  }

  const normalised = email.trim().toLowerCase();

  // Check cache
  const cached = verificationCache.get(normalised);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  let result;

  try {
    result = await performVerification(normalised);
  } catch (err) {
    logger.error('Email verification failed unexpectedly', { email: normalised, error: err.message });
    result = { status: 'unknown', reason: `Verification error: ${err.message}`, mxRecords: [] };
  }

  // Cache the result
  verificationCache.set(normalised, { result, timestamp: Date.now() });

  return result;
}

/**
 * Core verification logic for a single normalised email address.
 *
 * @param {string} email - Normalised (lowercase, trimmed) email address
 * @returns {Promise<{ status: string, reason: string, mxRecords: Array }>}
 */
async function performVerification(email) {
  // 1. Basic syntax check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { status: 'invalid', reason: 'Invalid email syntax', mxRecords: [] };
  }

  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    return { status: 'invalid', reason: 'Missing local part or domain', mxRecords: [] };
  }

  // 2. Disposable domain check
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { status: 'risky', reason: 'Disposable email domain detected', mxRecords: [] };
  }

  // 3. MX record lookup
  let mxRecords = [];
  try {
    mxRecords = await dns.resolveMx(domain);
    mxRecords.sort((a, b) => a.priority - b.priority);
  } catch (err) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
      return { status: 'invalid', reason: 'No MX records found for domain', mxRecords: [] };
    }
    logger.warn('MX lookup failed', { domain, error: err.message, code: err.code });
    return { status: 'unknown', reason: `MX lookup failed: ${err.message}`, mxRecords: [] };
  }

  if (mxRecords.length === 0) {
    return { status: 'invalid', reason: 'No MX records found for domain', mxRecords: [] };
  }

  const mxHost = mxRecords[0].exchange;
  const formattedMx = mxRecords.map((r) => ({ exchange: r.exchange, priority: r.priority }));

  // 4. SMTP handshake verification
  let smtpResult;
  try {
    smtpResult = await smtpHandshake(mxHost, email);
  } catch (err) {
    logger.warn('SMTP handshake failed', { mxHost, email, error: err.message });
    return { status: 'unknown', reason: `SMTP handshake failed: ${err.message}`, mxRecords: formattedMx };
  }

  if (!smtpResult.connected) {
    return { status: 'unknown', reason: `Could not connect to mail server: ${smtpResult.error}`, mxRecords: formattedMx };
  }

  // 5. Check for catch-all domain
  if (smtpResult.recipientAccepted) {
    let isCatchAll = false;
    try {
      isCatchAll = await detectCatchAll(mxHost, domain);
    } catch (err) {
      logger.debug('Catch-all detection failed', { domain, error: err.message });
      // Non-fatal; proceed without catch-all info
    }

    if (isCatchAll) {
      return { status: 'catch_all', reason: 'Domain accepts all email addresses (catch-all)', mxRecords: formattedMx };
    }

    return { status: 'valid', reason: 'Email address verified via SMTP', mxRecords: formattedMx };
  }

  // RCPT TO was rejected
  return { status: 'invalid', reason: `Mail server rejected recipient: ${smtpResult.error || 'unknown'}`, mxRecords: formattedMx };
}

// ─── SMTP Handshake ──────────────────────────────────────────────────────────

/**
 * Performs an SMTP handshake with the given MX host to verify whether the
 * recipient address is accepted. Does NOT send any actual email.
 *
 * Sequence: connect → read banner → EHLO → MAIL FROM → RCPT TO → QUIT
 *
 * @param {string} mxHost - MX server hostname
 * @param {string} recipientEmail - Email address to verify
 * @returns {Promise<{ connected: boolean, recipientAccepted: boolean, error: string|null }>}
 */
function smtpHandshake(mxHost, recipientEmail) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let step = 'connect';
    let buffer = '';
    let resolved = false;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      try {
        socket.destroy();
      } catch (_) { /* ignore */ }
      resolve(result);
    };

    // Timeout
    socket.setTimeout(SMTP_TIMEOUT);
    socket.on('timeout', () => {
      finish({ connected: false, recipientAccepted: false, error: 'Connection timed out' });
    });

    socket.on('error', (err) => {
      finish({ connected: false, recipientAccepted: false, error: err.message });
    });

    socket.on('data', (data) => {
      buffer += data.toString();

      // SMTP responses end with \r\n and multi-line responses use "XXX-" prefix
      // We wait for a line that starts with "XXX " (space, not dash)
      if (!/^\d{3} /m.test(buffer)) return;

      const code = parseInt(buffer.substring(0, 3), 10);
      const fullResponse = buffer;
      buffer = '';

      switch (step) {
        case 'connect':
          if (code >= 200 && code < 300) {
            step = 'ehlo';
            socket.write('EHLO verify.coldaf.local\r\n');
          } else {
            finish({ connected: false, recipientAccepted: false, error: `Banner rejected: ${code}` });
          }
          break;

        case 'ehlo':
          if (code >= 200 && code < 300) {
            step = 'mail_from';
            socket.write('MAIL FROM:<verify@coldaf.local>\r\n');
          } else {
            finish({ connected: true, recipientAccepted: false, error: `EHLO rejected: ${code}` });
          }
          break;

        case 'mail_from':
          if (code >= 200 && code < 300) {
            step = 'rcpt_to';
            socket.write(`RCPT TO:<${recipientEmail}>\r\n`);
          } else {
            step = 'quit';
            socket.write('QUIT\r\n');
            finish({ connected: true, recipientAccepted: false, error: `MAIL FROM rejected: ${code}` });
          }
          break;

        case 'rcpt_to': {
          const accepted = code >= 200 && code < 300;
          step = 'quit';
          socket.write('QUIT\r\n');
          finish({
            connected: true,
            recipientAccepted: accepted,
            error: accepted ? null : `RCPT TO rejected: ${code} ${fullResponse.trim().substring(4, 100)}`,
          });
          break;
        }

        case 'quit':
          // Nothing to do — we already resolved
          try { socket.destroy(); } catch (_) { /* ignore */ }
          break;

        default:
          break;
      }
    });

    socket.on('close', () => {
      finish({ connected: false, recipientAccepted: false, error: 'Connection closed unexpectedly' });
    });

    socket.connect(25, mxHost);
  });
}

// ─── Catch-All Detection ─────────────────────────────────────────────────────

/**
 * Detects whether a domain is a catch-all by attempting to verify a random
 * nonexistent email address. If the server accepts it, the domain is catch-all.
 *
 * @param {string} mxHost - MX server hostname
 * @param {string} domain - Email domain
 * @returns {Promise<boolean>} true if domain is catch-all
 */
async function detectCatchAll(mxHost, domain) {
  const randomLocal = `coldaf-verify-${crypto.randomBytes(8).toString('hex')}`;
  const fakeEmail = `${randomLocal}@${domain}`;

  const result = await smtpHandshake(mxHost, fakeEmail);
  return result.recipientAccepted === true;
}

// ─── Bulk Verification ───────────────────────────────────────────────────────

/**
 * Verifies an array of email addresses in parallel batches with concurrency
 * control. Each batch processes up to BULK_CONCURRENCY emails simultaneously.
 *
 * @param {string[]} emails - Array of email addresses to verify
 * @returns {Promise<Array<{ email: string, status: string, reason: string, mxRecords: Array }>>}
 */
async function bulkVerify(emails) {
  if (!Array.isArray(emails) || emails.length === 0) {
    return [];
  }

  // Deduplicate and normalise
  const unique = [...new Set(emails.map((e) => (e || '').trim().toLowerCase()))].filter(Boolean);

  logger.info('Starting bulk email verification', { totalEmails: unique.length });

  const results = [];
  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < unique.length; i += BULK_CONCURRENCY) {
    const batch = unique.slice(i, i + BULK_CONCURRENCY);

    const batchResults = await Promise.allSettled(
      batch.map(async (email) => {
        const result = await verifyEmail(email);
        return { email, ...result };
      })
    );

    for (const settled of batchResults) {
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        // Should not happen since verifyEmail catches errors internally
        const failedEmail = batch[batchResults.indexOf(settled)];
        results.push({
          email: failedEmail,
          status: 'unknown',
          reason: `Unexpected error: ${settled.reason?.message || 'unknown'}`,
          mxRecords: [],
        });
      }
    }

    // Brief pause between batches to avoid overwhelming DNS / mail servers
    if (i + BULK_CONCURRENCY < unique.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const duration = Date.now() - startTime;
  logger.info('Bulk email verification completed', {
    totalEmails: unique.length,
    durationMs: duration,
    valid: results.filter((r) => r.status === 'valid').length,
    invalid: results.filter((r) => r.status === 'invalid').length,
    risky: results.filter((r) => r.status === 'risky').length,
    catchAll: results.filter((r) => r.status === 'catch_all').length,
    unknown: results.filter((r) => r.status === 'unknown').length,
  });

  return results;
}

/**
 * Clears the in-memory verification cache. Useful for testing or when
 * forced re-verification is needed.
 */
function clearVerificationCache() {
  verificationCache.clear();
  logger.debug('Email verification cache cleared');
}

module.exports = { verifyEmail, bulkVerify, clearVerificationCache };
