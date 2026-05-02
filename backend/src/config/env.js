require('dotenv').config();

// In production, critical secrets must be explicitly set — never use dev defaults
if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'DB_PASSWORD'];
  const missing = required.filter(k => !process.env[k] || process.env[k].startsWith('CHANGE_ME'));
  if (missing.length > 0) {
    console.error(`FATAL: Missing required production env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

module.exports = {
  port: parseInt(process.env.PORT || '4000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'coldaf_db',
    user: process.env.DB_USER || 'coldaf',
    password: process.env.DB_PASSWORD || 'coldaf_password',
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    expiry: process.env.JWT_EXPIRY || '8h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  gemini: {
    apiKey: process.env.GOOGLE_GEMINI_API_KEY || '',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || '',
  },
  mailgun: {
    apiKey: process.env.MAILGUN_API_KEY || '',
    domain: process.env.MAILGUN_DOMAIN || '',
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@coldaf.com',
    password: process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!',
    name: process.env.ADMIN_NAME || 'System Admin',
  },
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  vapi: {
    apiKey: process.env.VAPI_API_KEY || '',
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || '',
    assistantId: process.env.VAPI_ASSISTANT_ID || '',
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET || '',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    // Map each plan id to its Stripe price id (set these in .env after creating products)
    prices: {
      solo: process.env.STRIPE_PRICE_SOLO || '',
      starter: process.env.STRIPE_PRICE_STARTER || '',
      pro: process.env.STRIPE_PRICE_PRO || '',
      scale: process.env.STRIPE_PRICE_SCALE || '',
      agency: process.env.STRIPE_PRICE_AGENCY || '',
    },
  },
};
