'use strict';

const db = require('../config/database');
const logger = require('../utils/logger');

// Day-of-week label map (0=Sun JS, but we use 1=Mon..7=Sun for ISODOW)
const DOW_LABELS = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

// Default windows when no historical data exists
const DEFAULT_WINDOWS = [
  { dayOfWeek: 2, hour: 10, openRate: null, label: 'Tuesday 10am', isDefault: true },
  { dayOfWeek: 4, hour: 10, openRate: null, label: 'Thursday 10am', isDefault: true },
  { dayOfWeek: 3, hour: 14, openRate: null, label: 'Wednesday 2pm', isDefault: true },
];

/**
 * Returns a human-readable label for a day-of-week + hour combination.
 * @param {number} dow - ISO day of week (1=Mon, 7=Sun)
 * @param {number} hour - 0-23
 * @returns {string}
 */
function buildLabel(dow, hour) {
  const day = DOW_LABELS[dow] || `Day${dow}`;
  const suffix = hour < 12 ? 'am' : 'pm';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${day} ${displayHour}${suffix}`;
}

/**
 * Queries historical email_events to find open rates grouped by
 * day-of-week and hour-of-day for the given organization (and optionally brand).
 *
 * Falls back to emails_sent.opened_at if email_events has no data.
 *
 * @param {string} organizationId
 * @param {string|null} brandId
 * @returns {Promise<Array<{dayOfWeek, hour, openRate, label}>>} Top 3 windows
 */
async function getOptimalSendWindows(organizationId, brandId = null) {
  try {
    const params = [organizationId];
    let brandClause = '';
    if (brandId) {
      params.push(brandId);
      brandClause = `AND es.brand_id = $${params.length}`;
    }

    // Count opens per (dow, hour) bucket using email_events joined to emails_sent
    // email_events.event_type uses 'open' per migration 001
    const eventsQuery = `
      SELECT
        EXTRACT(ISODOW FROM ee.created_at)::int AS dow,
        EXTRACT(HOUR   FROM ee.created_at)::int AS hour,
        COUNT(DISTINCT ee.id)::int              AS opens,
        COUNT(DISTINCT es.id)::int              AS sent
      FROM email_events ee
      JOIN emails_sent es ON es.id = ee.email_id
      WHERE ee.event_type = 'open'
        AND es.organization_id = $1
        ${brandClause}
      GROUP BY dow, hour
      HAVING COUNT(DISTINCT es.id) >= 5
      ORDER BY (COUNT(DISTINCT ee.id)::float / NULLIF(COUNT(DISTINCT es.id), 0)) DESC
      LIMIT 10
    `;

    const result = await db.query(eventsQuery, params);

    if (result.rows.length > 0) {
      return result.rows.slice(0, 3).map((row) => ({
        dayOfWeek: row.dow,
        hour: row.hour,
        openRate: row.sent > 0 ? parseFloat((row.opens / row.sent).toFixed(4)) : 0,
        label: buildLabel(row.dow, row.hour),
        isDefault: false,
      }));
    }

    // Fallback: use emails_sent.opened_at column directly
    const fallbackQuery = `
      SELECT
        EXTRACT(ISODOW FROM es.opened_at)::int AS dow,
        EXTRACT(HOUR   FROM es.opened_at)::int AS hour,
        COUNT(*)::int                           AS opens,
        (
          SELECT COUNT(*)::int FROM emails_sent es2
          WHERE es2.organization_id = $1
            ${brandClause.replace(/es\./g, 'es2.')}
            AND es2.sent_at IS NOT NULL
            AND EXTRACT(ISODOW FROM es2.sent_at)::int = EXTRACT(ISODOW FROM es.opened_at)::int
            AND EXTRACT(HOUR   FROM es2.sent_at)::int = EXTRACT(HOUR   FROM es.opened_at)::int
        ) AS sent
      FROM emails_sent es
      WHERE es.opened_at IS NOT NULL
        AND es.organization_id = $1
        ${brandClause}
      GROUP BY dow, hour
      HAVING COUNT(*) >= 3
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `;

    const fallback = await db.query(fallbackQuery, params);

    if (fallback.rows.length > 0) {
      return fallback.rows.slice(0, 3).map((row) => ({
        dayOfWeek: row.dow,
        hour: row.hour,
        openRate: row.sent > 0 ? parseFloat((row.opens / row.sent).toFixed(4)) : null,
        label: buildLabel(row.dow, row.hour),
        isDefault: false,
      }));
    }

    // No data at all — return defaults
    logger.debug('sendTimeOptimizer: no data for org, using defaults', { organizationId, brandId });
    return DEFAULT_WINDOWS;
  } catch (err) {
    logger.error('sendTimeOptimizer.getOptimalSendWindows error', { error: err.message, organizationId });
    return DEFAULT_WINDOWS;
  }
}

/**
 * Returns the next Date occurrence of the best send window.
 *
 * @param {string} organizationId
 * @param {string|null} brandId
 * @returns {Promise<Date>}
 */
async function getOptimalNextSendTime(organizationId, brandId = null) {
  const windows = await getOptimalSendWindows(organizationId, brandId);
  const best = windows[0];

  const now = new Date();
  // ISODOW: 1=Mon ... 7=Sun
  // JS getDay(): 0=Sun ... 6=Sat
  const jsToIsoDow = (d) => (d === 0 ? 7 : d);
  const currentDow = jsToIsoDow(now.getDay());

  // Candidate: next occurrence of best.dayOfWeek at best.hour:00
  let daysAhead = best.dayOfWeek - currentDow;
  if (daysAhead < 0) daysAhead += 7;
  // If same day but hour has already passed, push to next week
  if (daysAhead === 0 && now.getHours() >= best.hour) daysAhead = 7;

  const next = new Date(now);
  next.setDate(now.getDate() + daysAhead);
  next.setHours(best.hour, 0, 0, 0);

  return next;
}

/**
 * Staggers sends for all queued leads in a campaign using the optimal send time.
 *
 * Updates campaign_leads rows where:
 *   status = 'queued' AND next_followup_at IS NULL
 *
 * Each lead gets the optimal time + a random 0–30 minute stagger offset.
 *
 * @param {string} campaignId
 * @returns {Promise<number>} Count of leads adjusted
 */
async function adjustCampaignSchedule(campaignId) {
  try {
    // Fetch campaign info
    const campResult = await db.query(
      `SELECT c.id, c.organization_id,
              (SELECT brand_id FROM campaign_brands WHERE campaign_id = c.id LIMIT 1) AS brand_id
       FROM campaigns c
       WHERE c.id = $1`,
      [campaignId]
    );

    if (campResult.rows.length === 0) {
      logger.warn('adjustCampaignSchedule: campaign not found', { campaignId });
      return 0;
    }

    const { organization_id: organizationId, brand_id: brandId } = campResult.rows[0];

    const optimalTime = await getOptimalNextSendTime(organizationId, brandId);

    // Get queued leads with no next_followup_at set
    const leadsResult = await db.query(
      `SELECT id FROM campaign_leads
       WHERE campaign_id = $1
         AND status = 'queued'
         AND next_followup_at IS NULL`,
      [campaignId]
    );

    if (leadsResult.rows.length === 0) {
      return 0;
    }

    // Update each lead with staggered time
    let count = 0;
    for (const lead of leadsResult.rows) {
      const offsetMinutes = Math.floor(Math.random() * 31); // 0–30 minutes
      const staggeredTime = new Date(optimalTime.getTime() + offsetMinutes * 60 * 1000);

      await db.query(
        `UPDATE campaign_leads
         SET next_followup_at = $1, updated_at = NOW()
         WHERE id = $2`,
        [staggeredTime, lead.id]
      );
      count++;
    }

    logger.info('adjustCampaignSchedule: leads adjusted', {
      campaignId,
      count,
      optimalTime: optimalTime.toISOString(),
    });

    return count;
  } catch (err) {
    logger.error('adjustCampaignSchedule error', { error: err.message, campaignId });
    return 0;
  }
}

module.exports = {
  getOptimalSendWindows,
  getOptimalNextSendTime,
  adjustCampaignSchedule,
};
