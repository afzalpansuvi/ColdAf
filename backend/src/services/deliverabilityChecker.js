'use strict';

const dns = require('dns').promises;
const db = require('../config/database');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Spam scoring rules (same rule-set as /templates/spam-check endpoint)
// ---------------------------------------------------------------------------
function getSpamScore(subject = '', bodyText = '') {
  const text = bodyText;
  const fullContent = `${subject}\n\n${text}`;
  const bodyHtml = ''; // no HTML in this path

  const flags = [];
  let score = 0;

  const rules = [
    {
      id: 'SUBJECT_ALL_CAPS',
      test: () => subject === subject.toUpperCase() && subject.length > 5 && /[A-Z]/.test(subject),
      score: 1.5,
      desc: 'Subject line is ALL CAPS',
    },
    {
      id: 'SUBJECT_EXCLAMATION',
      test: () => (subject.match(/!/g) || []).length > 1,
      score: 0.5,
      desc: 'Multiple exclamation marks in subject',
    },
    {
      id: 'SPAM_WORDS_SUBJECT',
      test: () => /\b(free|guaranteed|winner|cash|prize|urgent|act now|limited time|click here|buy now|order now|earn money|make money|no cost|100%|risk.?free)\b/i.test(subject),
      score: 2.0,
      desc: 'Spam trigger words in subject line',
    },
    {
      id: 'SPAM_WORDS_BODY',
      test: () => /\b(free|guaranteed|winner|cash|prize|earn \$|make \$|no cost|risk.?free|click here|buy now|order now|unsubscribe now|lose weight|earn extra|work from home|extra income|double your)\b/i.test(text),
      score: 1.0,
      desc: 'Spam trigger words in email body',
    },
    {
      id: 'EXCESSIVE_LINKS',
      test: () => (bodyHtml.match(/<a /gi) || []).length > 5,
      score: 1.0,
      desc: 'Too many links (more than 5)',
    },
    {
      id: 'NO_UNSUBSCRIBE',
      test: () => !/unsubscribe/i.test(fullContent),
      score: 1.5,
      desc: 'Missing unsubscribe link',
    },
    {
      id: 'DOLLAR_SIGN',
      test: () => (text.match(/\$/g) || []).length > 2,
      score: 0.5,
      desc: 'Multiple dollar signs',
    },
    {
      id: 'ALL_CAPS_WORDS',
      test: () => (text.match(/\b[A-Z]{4,}\b/g) || []).length > 3,
      score: 0.5,
      desc: 'Multiple ALL-CAPS words in body',
    },
    {
      id: 'EXCESSIVE_EXCLAMATION',
      test: () => (fullContent.match(/!/g) || []).length > 3,
      score: 0.5,
      desc: 'Too many exclamation marks',
    },
    {
      id: 'HTML_IMAGE_ONLY',
      test: () => bodyHtml.length > 100 && text.replace(/\s/g, '').length < 50,
      score: 2.0,
      desc: 'Email is mostly images with little text',
    },
    {
      id: 'SHORT_BODY',
      test: () => text.trim().split(/\s+/).length < 20,
      score: 0.3,
      desc: 'Very short email body',
    },
    {
      id: 'PERCENTAGE_NUMBERS',
      test: () => /\b\d{2,3}%\b/.test(text) && /\b(off|discount|save|return|profit)\b/i.test(text),
      score: 0.5,
      desc: 'Percentage-based offers detected',
    },
  ];

  for (const rule of rules) {
    try {
      if (rule.test()) {
        flags.push({ id: rule.id, description: rule.desc, score: rule.score });
        score += rule.score;
      }
    } catch (_e) {
      // skip broken rule
    }
  }

  score = Math.min(Math.round(score * 10) / 10, 10);
  const level = score <= 2 ? 'good' : score <= 4 ? 'warning' : 'danger';

  return { score, level, flags };
}

// ---------------------------------------------------------------------------
// checkSpfDkimDmarc — DNS TXT record lookups
// ---------------------------------------------------------------------------
async function checkSpfDkimDmarc(domain) {
  const result = {
    spf: false,
    dkim: false,
    dmarc: false,
    spfRecord: null,
    dmarcRecord: null,
  };

  // SPF: look for TXT record starting with 'v=spf1' on the root domain
  try {
    const txtRecords = await dns.resolveTxt(domain);
    for (const record of txtRecords) {
      const joined = record.join('');
      if (joined.startsWith('v=spf1')) {
        result.spf = true;
        result.spfRecord = joined;
        break;
      }
    }
  } catch (err) {
    if (!['ENODATA', 'ENOTFOUND', 'ESERVFAIL'].includes(err.code)) {
      logger.warn('SPF lookup error', { domain, error: err.message });
    }
  }

  // DKIM: check 'default._domainkey.{domain}' TXT record
  try {
    const dkimRecords = await dns.resolveTxt(`default._domainkey.${domain}`);
    if (dkimRecords && dkimRecords.length > 0) {
      result.dkim = true;
    }
  } catch (err) {
    if (!['ENODATA', 'ENOTFOUND', 'ESERVFAIL'].includes(err.code)) {
      logger.warn('DKIM lookup error', { domain, error: err.message });
    }
  }

  // DMARC: check '_dmarc.{domain}' TXT record for 'v=DMARC1'
  try {
    const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
    for (const record of dmarcRecords) {
      const joined = record.join('');
      if (joined.startsWith('v=DMARC1')) {
        result.dmarc = true;
        result.dmarcRecord = joined;
        break;
      }
    }
  } catch (err) {
    if (!['ENODATA', 'ENOTFOUND', 'ESERVFAIL'].includes(err.code)) {
      logger.warn('DMARC lookup error', { domain, error: err.message });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// checkBlacklist — DNS blocklist lookups for top 5 DNSBLs
// ---------------------------------------------------------------------------
const DNSBL_LISTS = [
  'zen.spamhaus.org',
  'bl.spamcop.net',
  'b.barracudacentral.org',
  'dnsbl.sorbs.net',
  'spam.dnsbl.sorbs.net',
];

async function checkBlacklist(domain, ip) {
  const details = [];

  for (const list of DNSBL_LISTS) {
    let listed = false;

    // If an IP was provided, try the reverse-IP lookup
    if (ip) {
      try {
        const reversed = ip.split('.').reverse().join('.');
        await dns.resolve4(`${reversed}.${list}`);
        listed = true;
      } catch (err) {
        // NXDOMAIN or ENOTFOUND = not listed; anything else is a lookup failure (treat as clean)
      }
    }

    // Also try domain-based lookup
    if (!listed) {
      try {
        await dns.resolve4(`${domain}.${list}`);
        listed = true;
      } catch (_err) {
        // not listed or unsupported
      }
    }

    details.push({ list, listed });
  }

  const anyListed = details.some((d) => d.listed);
  return { listed: anyListed, details };
}

// ---------------------------------------------------------------------------
// runFullCheck — orchestrate all checks and persist result
// ---------------------------------------------------------------------------
async function runFullCheck(smtpAccountId, organizationId) {
  // Fetch the SMTP account
  const accountResult = await db.query(
    `SELECT id, email_address, organization_id FROM smtp_accounts WHERE id = $1`,
    [smtpAccountId]
  );

  if (accountResult.rows.length === 0) {
    throw new Error(`SMTP account ${smtpAccountId} not found`);
  }

  const account = accountResult.rows[0];
  const orgId = organizationId || account.organization_id;

  // Extract domain from email address
  const emailParts = account.email_address.split('@');
  if (emailParts.length < 2 || !emailParts[1]) {
    throw new Error(`Cannot extract domain from email: ${account.email_address}`);
  }
  const domain = emailParts[1].toLowerCase();

  // Run SPF/DKIM/DMARC and blacklist checks in parallel
  const [dnsResult, blacklistResult] = await Promise.all([
    checkSpfDkimDmarc(domain),
    checkBlacklist(domain, null),
  ]);

  // Persist result
  await db.query(
    `INSERT INTO smtp_deliverability_checks
       (smtp_account_id, organization_id, blacklist_status,
        spf_valid, dkim_valid, dmarc_valid, spf_record, dmarc_record)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      smtpAccountId,
      orgId,
      JSON.stringify(blacklistResult),
      dnsResult.spf,
      dnsResult.dkim,
      dnsResult.dmarc,
      dnsResult.spfRecord,
      dnsResult.dmarcRecord,
    ]
  );

  logger.info('Deliverability check completed', {
    smtpAccountId,
    domain,
    spf: dnsResult.spf,
    dkim: dnsResult.dkim,
    dmarc: dnsResult.dmarc,
    blacklisted: blacklistResult.listed,
  });

  return {
    domain,
    checkedAt: new Date().toISOString(),
    spf: dnsResult.spf,
    dkim: dnsResult.dkim,
    dmarc: dnsResult.dmarc,
    spfRecord: dnsResult.spfRecord,
    dmarcRecord: dnsResult.dmarcRecord,
    blacklist: blacklistResult,
  };
}

module.exports = {
  checkSpfDkimDmarc,
  checkBlacklist,
  getSpamScore,
  runFullCheck,
};
