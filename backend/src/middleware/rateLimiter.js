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
 * Max 500 requests per 1-minute window per real client IP.
 * Uses X-Forwarded-For (set by nginx/Traefik) to get the actual client IP
 * instead of the proxy container IP which would bucket all users together.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2000, // raised from 500: dashboard makes ~15 parallel calls per load
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down and try again shortly.',
  },
  keyGenerator: (req) => {
    // Prefer the real client IP from X-Forwarded-For over req.ip
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.ip;
  },
});

module.exports = { loginLimiter, apiLimiter };
