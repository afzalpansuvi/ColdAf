const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for login endpoints.
 * Max 10 requests per 15-minute window per IP.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  keyGenerator: (req) => req.ip,
});

/**
 * General API rate limiter.
 * Max 100 requests per 1-minute window per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down and try again shortly.',
  },
  keyGenerator: (req) => req.ip,
});

module.exports = { loginLimiter, apiLimiter };
