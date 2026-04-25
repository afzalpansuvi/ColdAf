'use strict';

const db = require('../config/database');

/**
 * Read a single value from the system_settings table.
 *
 * JSONB strings are stored with surrounding quotes — this helper strips them
 * so callers always receive a plain string (or the raw value for non-strings).
 *
 * @param {string} key          — The setting key (e.g. 'vapi_call_enabled')
 * @param {*}      defaultValue — Returned when the key does not exist
 * @returns {Promise<string|*>}
 */
async function getSetting(key, defaultValue = null) {
  const result = await db.query(
    'SELECT value FROM system_settings WHERE key = $1 LIMIT 1',
    [key]
  );
  if (result.rows.length === 0) return defaultValue;
  const val = result.rows[0].value;
  // JSONB strings come back with surrounding quotes
  if (typeof val === 'string') return val.replace(/^"|"$/g, '');
  return val;
}

module.exports = { getSetting };
