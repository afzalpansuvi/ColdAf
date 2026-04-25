const dns = require('dns').promises;
const db = require('../config/database');
const logger = require('../utils/logger');
const { createNotification } = require('./notifications');

// ─── DNSBL Blacklist Checker ─────────────────────────────────────────────────
//
// Monitors SMTP account IPs and domains against well-known DNS-based blacklists
// (DNSBLs). Results are persisted to the blacklist_checks table and admin
// notifications are created when a listing is detected.
// ─────────────────────────────────────────────────────────────────────────────

/** Timeout per DNS lookup in milliseconds */
const DNS_TIMEOUT = 5000;

/** IP-based DNSBLs — checked by reversing the IP octets */
const IP_BLACKLISTS = [
  'zen.spamhaus.org',
  'dnsbl.sorbs.net',
  'b.barracudacentral.org',
  'bl.spamcop.net',
];

/** Domain-based DNSBLs — checked by prepending the domain */
const DOMAIN_BLACKLISTS = [
  'dbl.spamhaus.org',
];

/** All blacklists combined for reference */
const ALL_BLACKLISTS = [...IP_BLACKLISTS, ...DOMAIN_BLACKLISTS];

// ─── IP-Based Checking ──────────────────────────────────────────────────────

/**
 * Checks an IP address against all IP-based DNSBL providers.
 *
 * The IP octets are reversed and prepended to each DNSBL domain. A successful
 * DNS A-record lookup means the IP is listed.
 *
 * @param {string} ip - IPv4 address to check (e.g. '192.168.1.1')
 * @returns {Promise<Array<{ blacklist: string, isListed: boolean, checkedAt: string }>>}
 */
async function checkIP(ip) {
  if (!ip || typeof ip !== 'string') {
    throw new Error('checkIP requires a valid IPv4 address string');
  }

  // Validate and reverse the IP octets
  const octets = ip.trim().split('.');
  if (octets.length !== 4 || octets.some((o) => isNaN(parseInt(o, 10)) || parseInt(o, 10) < 0 || parseInt(o, 10) > 255)) {
    throw new Error(`Invalid IPv4 address: "${ip}"`);
  }

  const reversedIP = octets.reverse().join('.');

  logger.debug('Checking IP against DNSBLs', { ip, reversedIP, blacklistCount: IP_BLACKLISTS.length });

  const results = await Promise.all(
    IP_BLACKLISTS.map((bl) => queryDnsbl(`${reversedIP}.${bl}`, bl))
  );

  return results;
}

// ─── Domain-Based Checking ───────────────────────────────────────────────────

/**
 * Checks a domain against all domain-based DNSBL providers.
 *
 * The domain is prepended to each DNSBL domain. A successful DNS A-record
 * lookup means the domain is listed.
 *
 * @param {string} domain - Domain to check (e.g. 'example.com')
 * @returns {Promise<Array<{ blacklist: string, isListed: boolean, checkedAt: string }>>}
 */
async function checkDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    throw new Error('checkDomain requires a valid domain string');
  }

  const cleanDomain = domain.trim().toLowerCase();

  logger.debug('Checking domain against DNSBLs', { domain: cleanDomain, blacklistCount: DOMAIN_BLACKLISTS.length });

  const results = await Promise.all(
    DOMAIN_BLACKLISTS.map((bl) => queryDnsbl(`${cleanDomain}.${bl}`, bl))
  );

  return results;
}

// ─── SMTP Account Checking ───────────────────────────────────────────────────

/**
 * Checks a specific SMTP account's sending domain against all DNSBLs.
 * Stores results in the blacklist_checks table.
 *
 * @param {string} smtpAccountId - UUID of the SMTP account
 * @returns {Promise<Array<{ blacklist: string, isListed: boolean, checkedAt: string }>>}
 */
async function checkSmtpAccount(smtpAccountId) {
  if (!smtpAccountId) {
    throw new Error('checkSmtpAccount requires an smtpAccountId');
  }

  const accountResult = await db.query(
    'SELECT id, email, smtp_host FROM smtp_accounts WHERE id = $1',
    [smtpAccountId]
  );

  if (accountResult.rows.length === 0) {
    throw new Error(`SMTP account ${smtpAccountId} not found`);
  }

  const account = accountResult.rows[0];
  const domain = account.email.split('@')[1];

  if (!domain) {
    throw new Error(`Unable to extract domain from SMTP account email: ${account.email}`);
  }

  // Run domain-based checks
  const domainResults = await checkDomain(domain);

  // Also attempt IP-based check on the SMTP host if it's an IP address
  let ipResults = [];
  if (account.smtp_host && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(account.smtp_host)) {
    try {
      ipResults = await checkIP(account.smtp_host);
    } catch (err) {
      logger.warn('IP blacklist check failed for SMTP host', {
        smtpAccountId,
        smtpHost: account.smtp_host,
        error: err.message,
      });
    }
  } else if (account.smtp_host) {
    // Try to resolve the SMTP host to an IP for checking
    try {
      const addresses = await dns.resolve4(account.smtp_host);
      if (addresses.length > 0) {
        ipResults = await checkIP(addresses[0]);
      }
    } catch (err) {
      logger.debug('Could not resolve SMTP host to IP for blacklist check', {
        smtpHost: account.smtp_host,
        error: err.message,
      });
    }
  }

  const allResults = [...domainResults, ...ipResults];

  // Store results in blacklist_checks table
  await storeResults(smtpAccountId, domain, allResults);

  return allResults;
}

/**
 * Checks all active SMTP accounts against DNSBLs.
 * Stores results in the blacklist_checks table and creates admin notifications
 * for any accounts found on a blacklist.
 *
 * @returns {Promise<{ accountsChecked: number, listingsFound: number }>}
 */
async function checkAllAccounts() {
  const accountsResult = await db.query(
    `SELECT id, email, smtp_host FROM smtp_accounts WHERE is_active = TRUE`
  );

  if (accountsResult.rows.length === 0) {
    logger.debug('No active SMTP accounts to check against blacklists');
    return { accountsChecked: 0, listingsFound: 0 };
  }

  logger.info('Starting blacklist check for all active SMTP accounts', {
    accountCount: accountsResult.rows.length,
  });

  let totalListings = 0;

  for (const account of accountsResult.rows) {
    try {
      const results = await checkSmtpAccount(account.id);

      const listings = results.filter((r) => r.isListed);
      totalListings += listings.length;

      if (listings.length > 0) {
        const listedOn = listings.map((l) => l.blacklist).join(', ');

        // Create admin notification
        await createNotification({
          userId: null, // all admins
          type: 'blacklist_alert',
          title: `Blacklist Alert: ${account.email}`,
          message: `SMTP account ${account.email} was found on the following blacklists: ${listedOn}. ` +
            'This may affect email deliverability. Consider investigating and requesting delisting.',
          metadata: {
            smtpAccountId: account.id,
            smtpEmail: account.email,
            listings: listings.map((l) => l.blacklist),
          },
        });

        logger.warn('SMTP account found on blacklist', {
          smtpAccountId: account.id,
          email: account.email,
          blacklists: listedOn,
        });
      }
    } catch (err) {
      logger.error('Blacklist check failed for SMTP account', {
        smtpAccountId: account.id,
        email: account.email,
        error: err.message,
      });
    }
  }

  logger.info('Blacklist check cycle completed', {
    accountsChecked: accountsResult.rows.length,
    listingsFound: totalListings,
  });

  return {
    accountsChecked: accountsResult.rows.length,
    listingsFound: totalListings,
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Performs a single DNSBL lookup with timeout. A successful A-record
 * resolution indicates the queried entity is listed.
 *
 * @param {string} query - Full DNSBL query (e.g. '4.3.2.1.zen.spamhaus.org')
 * @param {string} blacklistName - Human-readable blacklist name for the result
 * @returns {Promise<{ blacklist: string, isListed: boolean, checkedAt: string }>}
 */
async function queryDnsbl(query, blacklistName) {
  const checkedAt = new Date().toISOString();

  try {
    const result = await Promise.race([
      dns.resolve4(query),
      timeoutPromise(DNS_TIMEOUT, `DNS lookup timed out for ${query}`),
    ]);

    // If we got A records, the entity is listed
    const isListed = Array.isArray(result) && result.length > 0;
    return { blacklist: blacklistName, isListed, checkedAt };
  } catch (err) {
    // ENOTFOUND / ENODATA means the entity is NOT listed (expected for clean IPs/domains)
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'ESERVFAIL') {
      return { blacklist: blacklistName, isListed: false, checkedAt };
    }

    // Timeout or other network error — log but treat as not listed to avoid false positives
    if (err.message && err.message.includes('timed out')) {
      logger.debug('DNSBL lookup timed out', { query, blacklist: blacklistName });
      return { blacklist: blacklistName, isListed: false, checkedAt };
    }

    logger.warn('DNSBL lookup error', { query, blacklist: blacklistName, error: err.message, code: err.code });
    return { blacklist: blacklistName, isListed: false, checkedAt };
  }
}

/**
 * Creates a promise that rejects after the specified timeout.
 *
 * @param {number} ms - Timeout in milliseconds
 * @param {string} message - Error message on timeout
 * @returns {Promise<never>}
 */
function timeoutPromise(ms, message) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Persists blacklist check results to the blacklist_checks table.
 *
 * @param {string} smtpAccountId - UUID of the SMTP account
 * @param {string} domain - Domain that was checked
 * @param {Array} results - Array of check results
 */
async function storeResults(smtpAccountId, domain, results) {
  if (!results || results.length === 0) return;

  try {
    for (const result of results) {
      await db.query(
        `INSERT INTO blacklist_checks
           (smtp_account_id, domain, blacklist, is_listed, checked_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [smtpAccountId, domain, result.blacklist, result.isListed, result.checkedAt]
      );
    }
  } catch (err) {
    logger.error('Failed to store blacklist check results', {
      smtpAccountId,
      domain,
      error: err.message,
    });
  }
}

module.exports = {
  checkIP,
  checkDomain,
  checkSmtpAccount,
  checkAllAccounts,
};
