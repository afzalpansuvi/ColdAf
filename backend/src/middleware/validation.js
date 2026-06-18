/**
 * Reusable validation middleware for Express routes.
 * Uses the existing validators.js utilities.
 */
const { isValidEmail, isRequired, checkRequiredFields } = require('../utils/validators');
const logger = require('../utils/logger');

/**
 * Express middleware that validates request body fields.
 * @param {Object} rules - Validation rules: { fieldName: 'required' | 'email' | 'string' | 'number' | 'boolean' | 'array' | 'uuid' | 'url' | 'domain' | 'phone' | { type: string, min?: number, max?: number } }
 * @returns {Function} Express middleware
 */
function validateBody(rules) {
  return (req, res, next) => {
    const errors = [];
    const body = req.body || {};

    for (const [fieldName, rule] of Object.entries(rules)) {
      const value = body[fieldName];
      const required = typeof rule === 'string' ? rule === 'required' : rule.required;
      const type = typeof rule === 'string' ? rule : rule.type;

      // Check required
      if (required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
        errors.push(`${fieldName} is required`);
        continue;
      }

      // Skip type validation if value is missing and not required
      if (value === undefined || value === null) continue;

      // Type validation
      switch (type) {
        case 'email':
          if (!isValidEmail(value)) {
            errors.push(`${fieldName} must be a valid email address`);
          }
          break;
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${fieldName} must be a string`);
          } else if (rule.min !== undefined && value.length < rule.min) {
            errors.push(`${fieldName} must be at least ${rule.min} characters`);
          } else if (rule.max !== undefined && value.length > rule.max) {
            errors.push(`${fieldName} must be at most ${rule.max} characters`);
          }
          break;
        case 'number':
          if (typeof value !== 'number' || Number.isNaN(value)) {
            errors.push(`${fieldName} must be a number`);
          } else if (rule.min !== undefined && value < rule.min) {
            errors.push(`${fieldName} must be at least ${rule.min}`);
          } else if (rule.max !== undefined && value > rule.max) {
            errors.push(`${fieldName} must be at most ${rule.max}`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${fieldName} must be a boolean`);
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`${fieldName} must be an array`);
          } else if (rule.min !== undefined && value.length < rule.min) {
            errors.push(`${fieldName} must have at least ${rule.min} items`);
          }
          break;
        case 'uuid':
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
            errors.push(`${fieldName} must be a valid UUID`);
          }
          break;
        case 'url':
          try {
            new URL(value);
          } catch {
            errors.push(`${fieldName} must be a valid URL`);
          }
          break;
        case 'domain':
          if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(value)) {
            errors.push(`${fieldName} must be a valid domain (e.g., example.com)`);
          }
          break;
        case 'phone':
          if (!/^[\d\s\-().+]{7,20}$/.test(value)) {
            errors.push(`${fieldName} must be a valid phone number`);
          }
          break;
      }
    }

    if (errors.length > 0) {
      logger.warn('Validation failed', { errors, path: req.originalUrl });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }

    next();
  };
}

/**
 * Validate URL parameters (e.g., :id is a valid UUID).
 * @param {string[]} paramNames - Names of URL params to validate as UUIDs
 */
function validateParams(...paramNames) {
  return (req, res, next) => {
    const errors = [];

    for (const name of paramNames) {
      const value = req.params[name];
      if (!value) {
        errors.push(`Missing URL parameter: ${name}`);
      } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        errors.push(`${name} must be a valid UUID`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid URL parameter',
        errors,
      });
    }

    next();
  };
}

/**
 * Sanitize string inputs in the request body.
 * Trims strings and removes null bytes.
 */
function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      const val = req.body[key];
      if (typeof val === 'string') {
        req.body[key] = val.trim().replace(/\x00/g, '');
      }
    }
  }
  next();
}

module.exports = {
  validateBody,
  validateParams,
  sanitizeBody,
};
