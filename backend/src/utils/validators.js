const crypto = require('crypto');
const logger = require('./logger');

/**
 * RFC 5321 compliant email validation.
 * Allows standard local-part characters including dots, plus addressing,
 * and validates domain with at least two labels.
 *
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;

  // Max total length per RFC 5321
  if (email.length > 254) return false;

  // RFC 5321 compliant pattern:
  // Local part: alphanumeric plus  . ! # $ % & ' * + - / = ? ^ _ ` { | } ~
  // Domain: labels separated by dots, each 1-63 chars, TLD at least 2 chars
  const pattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

  if (!pattern.test(email)) return false;

  // Additional local-part checks
  const [localPart] = email.split('@');
  if (localPart.length > 64) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false;

  return true;
}

/**
 * Basic phone number validation.
 * Accepts formats like: +1234567890, (123) 456-7890, 123-456-7890, 123.456.7890
 * Minimum 7 digits, maximum 15 (E.164 standard max).
 *
 * @param {string} phone
 * @returns {boolean}
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;

  // Strip formatting characters to count digits
  const digitsOnly = phone.replace(/[\s\-().+]/g, '');

  // Must be all digits after stripping formatting
  if (!/^\d+$/.test(digitsOnly)) return false;

  // E.164: between 7 and 15 digits
  if (digitsOnly.length < 7 || digitsOnly.length > 15) return false;

  // Overall format check: optional + prefix, then digits with optional separators
  const pattern = /^\+?[\d\s\-().]{7,20}$/;
  return pattern.test(phone.trim());
}

/**
 * Checks that a value is present and not empty.
 * Trims strings before checking.
 *
 * @param {*} value
 * @param {string} fieldName - Used in the returned error message
 * @returns {{ valid: boolean, error: string|null }}
 */
function isRequired(value, fieldName) {
  if (value === undefined || value === null) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return { valid: false, error: `${fieldName} is required` };
  }
  return { valid: true, error: null };
}

/**
 * Validates multiple required fields at once.
 *
 * @param {Object} fields - { fieldName: value, ... }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function checkRequiredFields(fields) {
  const errors = [];

  for (const [fieldName, value] of Object.entries(fields)) {
    const result = isRequired(value, fieldName);
    if (!result.valid) {
      errors.push(result.error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a single CSV row for lead import.
 * Required: full_name, email
 * Optional but validated if present: phone
 *
 * @param {Object} row - Parsed CSV row object
 * @param {number} rowIndex - Row number for error messages (1-based)
 * @returns {{ valid: boolean, errors: string[], sanitized: Object }}
 */
function validateCsvRow(row, rowIndex) {
  const errors = [];
  const sanitized = {};

  // Required: full_name
  const name = (row.full_name || row.name || row.Name || row['Full Name'] || '').trim();
  if (!name) {
    errors.push(`Row ${rowIndex}: full_name is required`);
  } else {
    sanitized.full_name = name;
  }

  // Required: email
  const email = (row.email || row.Email || row.EMAIL || row.email_address || '').trim().toLowerCase();
  if (!email) {
    errors.push(`Row ${rowIndex}: email is required`);
  } else if (!isValidEmail(email)) {
    errors.push(`Row ${rowIndex}: invalid email "${email}"`);
  } else {
    sanitized.email = email;
  }

  // Optional: phone
  const phone = (row.phone || row.Phone || row.PHONE || row.phone_number || '').trim();
  if (phone) {
    if (!isValidPhone(phone)) {
      errors.push(`Row ${rowIndex}: invalid phone "${phone}"`);
    } else {
      sanitized.phone = phone;
    }
  }

  // Optional pass-through fields
  const leadType = (row.lead_type || row['Lead Type'] || row.type || '').trim();
  if (leadType) sanitized.lead_type = leadType;

  const industry = (row.industry || row.Industry || row.INDUSTRY || '').trim();
  if (industry) sanitized.industry = industry;

  const projectDetails = (row.project_details || row['Project Details'] || row.details || '').trim();
  if (projectDetails) sanitized.project_details = projectDetails;

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Verifies an HMAC-SHA256 signature for webhook payloads.
 * Compares the provided signature against a computed HMAC of the payload body.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param {string} payload - The raw request body string
 * @param {string} signature - The signature from the request header
 * @param {string} secret - The shared secret for HMAC computation
 * @returns {boolean}
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!payload || !signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    // Prefix with sha256= if the incoming signature has it
    const normalizedSignature = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;

    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const receivedBuffer = Buffer.from(normalizedSignature, 'hex');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch (err) {
    logger.error('Webhook signature verification failed', { error: err.message });
    return false;
  }
}

module.exports = {
  isValidEmail,
  isValidPhone,
  isRequired,
  checkRequiredFields,
  validateCsvRow,
  verifyWebhookSignature,
};
