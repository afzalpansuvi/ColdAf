require('dotenv').config({ path: '.env.test' });

const db = require('../src/config/database');

// Test database configuration
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-12345';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-12345';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

// Global test timeout
jest.setTimeout(30000);

// Clean up database before each test
beforeEach(async () => {
  // Truncate test tables (in dependency order)
  const tables = [
    'audit_logs',
    'notifications',
    'ai_agent_logs',
    'ai_chat_messages',
    'campaign_leads',
    'emails_sent',
    'campaigns',
    'leads',
    'email_templates',
    'email_signatures',
    'smtp_accounts',
    'brands',
    'webhook_sources',
    'outbound_integrations',
    'google_sheet_connections',
    'users',
    'organizations',
    'roles',
    '_migrations',
  ];

  for (const table of tables) {
    try {
      await db.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
    } catch (err) {
      // Table may not exist yet — ignore
    }
  }
});

// Close database connection after all tests
afterAll(async () => {
  await db.pool.end();
});
