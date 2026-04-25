const { google } = require('googleapis');
const { decrypt } = require('../utils/encryption');
const { isValidEmail } = require('../utils/validators');
const db = require('../config/database');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a column letter (A, B, ..., Z, AA, AB, ...) to a zero-based index.
 *
 * @param {string} col - Column letter(s)
 * @returns {number} Zero-based column index
 */
function columnLetterToIndex(col) {
  let index = 0;
  const upper = col.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64);
  }
  return index - 1; // zero-based
}

/**
 * Resolves a column key from the column_mapping to a zero-based index.
 * Supports letter keys ("A", "B") and numeric keys ("0", "1").
 *
 * @param {string} key - Column identifier from the mapping
 * @returns {number} Zero-based index
 */
function resolveColumnIndex(key) {
  // If the key is purely numeric, treat it as a zero-based column index
  if (/^\d+$/.test(key)) {
    return parseInt(key, 10);
  }
  // Otherwise treat it as a column letter
  return columnLetterToIndex(key);
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Polls a single Google Sheet connection for new rows and imports them as leads.
 *
 * @param {Object} connection - A google_sheet_connections row
 * @returns {Promise<{ newLeads: number, errors: number, skipped: number }>}
 */
async function pollSheet(connection) {
  let newLeads = 0;
  let errors = 0;
  let skipped = 0;

  const tag = `[sheets:${connection.id}]`;

  try {
    // ── Decrypt and parse service account credentials ──────────────────
    let credentials;
    try {
      const decrypted = decrypt(connection.service_account_credentials_encrypted);
      credentials = JSON.parse(decrypted);
    } catch (err) {
      logger.error(`${tag} Failed to decrypt/parse service account credentials`, {
        connectionId: connection.id,
        error: err.message,
      });
      throw new Error(`Credential decryption failed: ${err.message}`);
    }

    // ── Authenticate with Google ───────────────────────────────────────
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    const sheets = google.sheets({ version: 'v4', auth });

    // ── Determine the range to read ────────────────────────────────────
    const tabName = connection.tab_name || 'Sheet1';
    const startRow = (connection.last_seen_row || 0) + 1;
    // Read from the row after last_seen_row onwards (columns A through Z should
    // be more than enough; the API ignores trailing empty columns).
    const range = `${tabName}!A${startRow + 1}:Z`;

    logger.debug(`${tag} Reading sheet`, {
      sheetId: connection.sheet_id,
      range,
      lastSeenRow: connection.last_seen_row,
    });

    // ── Fetch rows from the Google Sheets API ──────────────────────────
    let response;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId: connection.sheet_id,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });
    } catch (apiErr) {
      logger.error(`${tag} Google Sheets API error`, {
        connectionId: connection.id,
        sheetId: connection.sheet_id,
        error: apiErr.message,
      });
      throw new Error(`Google Sheets API error: ${apiErr.message}`);
    }

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      logger.debug(`${tag} No new rows found`, { connectionId: connection.id });

      // Still update last_sync_at
      await db.query(
        `UPDATE google_sheet_connections
         SET last_sync_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [connection.id]
      );

      return { newLeads: 0, errors: 0, skipped: 0 };
    }

    logger.info(`${tag} Found ${rows.length} new rows to process`, {
      connectionId: connection.id,
    });

    // ── Parse column mapping ───────────────────────────────────────────
    const columnMapping = connection.column_mapping || {};
    // Build a reverse map: { fieldName: columnIndex }
    const fieldMap = {};
    for (const [colKey, fieldName] of Object.entries(columnMapping)) {
      fieldMap[fieldName] = resolveColumnIndex(colKey);
    }

    // ── Process each row ───────────────────────────────────────────────
    let lastProcessedRow = connection.last_seen_row || 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const absoluteRowNumber = startRow + i + 1; // 1-based sheet row number

      try {
        // Extract fields based on the column mapping
        const fullName = fieldMap.full_name !== undefined
          ? (row[fieldMap.full_name] || '').toString().trim()
          : '';
        const email = fieldMap.email !== undefined
          ? (row[fieldMap.email] || '').toString().trim().toLowerCase()
          : '';
        const phone = fieldMap.phone !== undefined
          ? (row[fieldMap.phone] || '').toString().trim()
          : null;
        const leadType = fieldMap.lead_type !== undefined
          ? (row[fieldMap.lead_type] || '').toString().trim()
          : null;
        const industry = fieldMap.industry !== undefined
          ? (row[fieldMap.industry] || '').toString().trim()
          : null;
        const projectDetails = fieldMap.project_details !== undefined
          ? (row[fieldMap.project_details] || '').toString().trim()
          : null;

        // ── Validate email ─────────────────────────────────────────────
        if (!email) {
          logger.debug(`${tag} Row ${absoluteRowNumber}: empty email, skipping`);
          skipped++;
          lastProcessedRow = startRow + i;
          continue;
        }

        if (!isValidEmail(email)) {
          logger.debug(`${tag} Row ${absoluteRowNumber}: invalid email "${email}", skipping`);
          skipped++;
          lastProcessedRow = startRow + i;
          continue;
        }

        // ── Check for duplicate (email + brand_id) ─────────────────────
        const dupeCheck = await db.query(
          `SELECT id FROM leads WHERE email = $1 AND brand_id = $2 LIMIT 1`,
          [email, connection.brand_id]
        );

        if (dupeCheck.rows.length > 0) {
          logger.debug(`${tag} Row ${absoluteRowNumber}: duplicate lead "${email}", skipping`);
          skipped++;
          lastProcessedRow = startRow + i;
          continue;
        }

        // ── Insert lead ────────────────────────────────────────────────
        await db.query(
          `INSERT INTO leads
            (full_name, email, phone, lead_type, industry, project_details,
             source_type, source_detail, brand_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'google_sheets', $7, $8, 'new')`,
          [
            fullName || email.split('@')[0], // fallback name from email prefix
            email,
            phone,
            leadType,
            industry,
            projectDetails,
            connection.name,
            connection.brand_id,
          ]
        );

        newLeads++;
        lastProcessedRow = startRow + i;

        logger.debug(`${tag} Row ${absoluteRowNumber}: imported lead "${email}"`);
      } catch (rowErr) {
        errors++;
        lastProcessedRow = startRow + i;

        logger.error(`${tag} Row ${absoluteRowNumber}: error processing row`, {
          error: rowErr.message,
          connectionId: connection.id,
        });
        // Continue with next row
      }
    }

    // ── Update connection metadata ─────────────────────────────────────
    await db.query(
      `UPDATE google_sheet_connections
       SET last_seen_row = $1,
           last_sync_at = NOW(),
           leads_imported = leads_imported + $2,
           updated_at = NOW()
       WHERE id = $3`,
      [lastProcessedRow, newLeads, connection.id]
    );

    logger.info(`${tag} Polling complete`, {
      connectionId: connection.id,
      newLeads,
      errors,
      skipped,
      lastSeenRow: lastProcessedRow,
    });
  } catch (err) {
    logger.error(`${tag} Fatal error polling sheet`, {
      connectionId: connection.id,
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }

  return { newLeads, errors, skipped };
}

/**
 * Polls all active Google Sheet connections for new leads.
 *
 * @returns {Promise<{ totalNew: number, totalErrors: number, totalSkipped: number, connectionsChecked: number }>}
 */
async function pollAllSheets() {
  let totalNew = 0;
  let totalErrors = 0;
  let totalSkipped = 0;
  let connectionsChecked = 0;

  try {
    const result = await db.query(
      `SELECT *
       FROM google_sheet_connections
       WHERE is_active = TRUE`
    );

    if (result.rows.length === 0) {
      logger.debug('No active Google Sheet connections to poll');
      return { totalNew: 0, totalErrors: 0, totalSkipped: 0, connectionsChecked: 0 };
    }

    logger.info('Starting Google Sheets poll cycle', {
      connectionCount: result.rows.length,
    });

    for (const connection of result.rows) {
      try {
        const pollResult = await pollSheet(connection);
        totalNew += pollResult.newLeads;
        totalErrors += pollResult.errors;
        totalSkipped += pollResult.skipped;
        connectionsChecked++;
      } catch (err) {
        totalErrors++;
        logger.error('Failed to poll sheet connection', {
          connectionId: connection.id,
          connectionName: connection.name,
          error: err.message,
        });
        // Continue with next connection
      }
    }

    if (totalNew > 0) {
      logger.info('Google Sheets poll cycle complete', {
        connectionsChecked,
        totalNew,
        totalErrors,
        totalSkipped,
      });
    }
  } catch (err) {
    logger.error('Fatal error in pollAllSheets', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }

  return { totalNew, totalErrors, totalSkipped, connectionsChecked };
}

module.exports = {
  pollSheet,
  pollAllSheets,
};
