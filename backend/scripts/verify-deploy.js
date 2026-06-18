#!/usr/bin/env node
/**
 * Deployment Verification Script for ColdAF Email Tool
 *
 * Run this BEFORE deploying to production to verify all prerequisites.
 *
 * Usage:
 *   node scripts/verify-deploy.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const Redis = require('ioredis');

const CHECKS = [];
let FAILURES = 0;
let WARNINGS = 0;

function check(name, fn) {
  CHECKS.push({ name, fn });
}

function pass(msg) {
  console.log(`  ✅ ${msg}`);
}

function fail(msg) {
  console.log(`  ❌ ${msg}`);
  FAILURES++;
}

function warn(msg) {
  console.log(`  ⚠️  ${msg}`);
  WARNINGS++;
}

// ── Check 1: Environment variables ─────────────────────────────
check('Environment Variables', async () => {
  const required = [
    'NODE_ENV',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ENCRYPTION_KEY',
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'REDIS_URL',
  ];

  const productionOnly = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];

  const isProd = process.env.NODE_ENV === 'production';

  for (const key of required) {
    const val = process.env[key];
    if (!val || val.trim() === '') {
      fail(`${key} is missing or empty`);
    } else if (val.includes('CHANGE_ME') || val.includes('placeholder') || val.includes('example')) {
      fail(`${key} contains a placeholder value: ${val.slice(0, 20)}...`);
    } else {
      pass(`${key} is set`);
    }
  }

  if (isProd) {
    for (const key of productionOnly) {
      const val = process.env[key];
      if (!val || val.trim() === '') {
        fail(`${key} is required in production`);
      } else {
        pass(`${key} is set`);
      }
    }
  }

  // Check JWT secret strength
  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32) {
    fail('JWT_SECRET is too short (must be at least 32 characters)');
  } else if (jwtSecret.length < 64) {
    warn('JWT_SECRET is < 64 characters — consider a longer secret for production');
  } else {
    pass('JWT_SECRET length is adequate');
  }

  // Check encryption key format
  const encKey = process.env.ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{32}$/i.test(encKey) && !/^[a-f0-9]{64}$/i.test(encKey)) {
    warn('ENCRYPTION_KEY is not a 32 or 64 character hex string');
  } else {
    pass('ENCRYPTION_KEY format is valid');
  }

  // Check Stripe key format
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (stripeKey && !stripeKey.startsWith('sk_')) {
    warn('STRIPE_SECRET_KEY does not start with sk_ — may be invalid');
  }

  // Check frontend URL
  const frontendUrl = process.env.FRONTEND_URL || '';
  if (!frontendUrl) {
    warn('FRONTEND_URL is not set — email links and redirects will be broken');
  }
});

// ── Check 2: Database connection ─────────────────────────────
check('Database Connection', async () => {
  const connectionString = process.env.DATABASE_URL;
  const poolConfig = connectionString
    ? { connectionString }
    : {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      };

  const pool = new Pool(poolConfig);
  try {
    const result = await pool.query('SELECT version()');
    const version = result.rows[0].version;
    pass(`Connected to PostgreSQL: ${version.split(' ')[0]} ${version.split(' ')[1]}`);

    // Check if _migrations table exists
    const migCheck = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '_migrations')`
    );
    if (migCheck.rows[0].exists) {
      pass('_migrations tracking table exists');
    } else {
      warn('_migrations table does not exist — run migrations first');
    }
  } catch (err) {
    fail(`Database connection failed: ${err.message}`);
  } finally {
    await pool.end();
  }
});

// ── Check 3: Redis connection ─────────────────────────────
check('Redis Connection', async () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(redisUrl, { connectTimeout: 5000 });
  try {
    await redis.ping();
    pass('Redis connection successful');
  } catch (err) {
    fail(`Redis connection failed: ${err.message}`);
  } finally {
    redis.disconnect();
  }
});

// ── Check 4: Migrations are up to date ──────────────────────
check('Migrations Status', async () => {
  const connectionString = process.env.DATABASE_URL;
  const poolConfig = connectionString
    ? { connectionString }
    : {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      };

  const pool = new Pool(poolConfig);
  try {
    const migCheck = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '_migrations')`
    );
    if (!migCheck.rows[0].exists) {
      warn('Cannot check migrations — _migrations table does not exist');
      return;
    }

    const result = await pool.query('SELECT filename FROM _migrations ORDER BY filename');
    const executed = new Set(result.rows.map(r => r.filename));

    const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      fail(`Migrations directory not found: ${migrationsDir}`);
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const pending = files.filter(f => !executed.has(f));
    if (pending.length === 0) {
      pass(`All ${files.length} migrations are applied`);
    } else {
      fail(`${pending.length} pending migration(s): ${pending.join(', ')}`);
    }
  } catch (err) {
    fail(`Migration check failed: ${err.message}`);
  } finally {
    await pool.end();
  }
});

// ── Check 5: Required directories exist ─────────────────────
check('Required Directories', async () => {
  const dirs = [
    path.join(__dirname, '..', 'uploads'),
    path.join(__dirname, '..', 'src', 'db', 'migrations'),
    path.join(__dirname, '..', 'seeds'),
  ];

  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      pass(`Directory exists: ${path.basename(dir)}`);
    } else {
      warn(`Directory missing: ${dir} — creating it`);
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        fail(`Cannot create directory: ${dir}`);
      }
    }
  }
});

// ── Check 6: Roles table has required roles ─────────────────
check('Database Roles', async () => {
  const connectionString = process.env.DATABASE_URL;
  const poolConfig = connectionString
    ? { connectionString }
    : {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      };

  const pool = new Pool(poolConfig);
  try {
    const result = await pool.query(`SELECT name FROM roles`);
    const roles = result.rows.map(r => r.name);
    const required = ['user', 'admin', 'org_admin', 'super_admin', 'platform_owner'];

    for (const role of required) {
      if (roles.includes(role)) {
        pass(`Role exists: ${role}`);
      } else {
        warn(`Role missing: ${role}`);
      }
    }
  } catch (err) {
    fail(`Roles check failed: ${err.message}`);
  } finally {
    await pool.end();
  }
});

// ── Check 7: Frontend build directory ─────────────────────
check('Frontend Build', async () => {
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  const frontendSrc = path.join(__dirname, '..', '..', 'frontend', 'src');

  if (!fs.existsSync(frontendSrc)) {
    warn('Frontend source directory not found — skipping build check');
    return;
  }

  if (fs.existsSync(frontendDist)) {
    const files = fs.readdirSync(frontendDist);
    if (files.includes('index.html')) {
      pass('Frontend dist/ exists with index.html');
    } else {
      warn('Frontend dist/ exists but index.html is missing — rebuild required');
    }
  } else {
    warn('Frontend dist/ does not exist — run `npm run build` in frontend/ before deploy');
  }
});

// ── Check 8: Package dependencies ─────────────────────────
check('Package Dependencies', async () => {
  const packagePath = path.join(__dirname, '..', 'package.json');
  if (!fs.existsSync(packagePath)) {
    fail('backend/package.json not found');
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  const critical = ['express', 'pg', 'bcryptjs', 'jsonwebtoken', 'bull', 'stripe', 'nodemailer'];

  for (const dep of critical) {
    if (deps.includes(dep)) {
      pass(`Dependency installed: ${dep}`);
    } else {
      fail(`Critical dependency missing: ${dep}`);
    }
  }

  // Check node_modules exists
  const nodeModules = path.join(__dirname, '..', 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    fail('node_modules not found — run `npm install` in backend/');
  }
});

// ── Run all checks ──────────────────────────────────────────
async function run() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ColdAF Email Tool — Deployment Verification               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  for (const { name, fn } of CHECKS) {
    console.log(`▶ ${name}`);
    try {
      await fn();
    } catch (err) {
      fail(`Check crashed: ${err.message}`);
    }
    console.log();
  }

  console.log('══════════════════════════════════════════════════════════════');
  if (FAILURES === 0) {
    console.log(`✅ All checks passed (${WARNINGS} warning${WARNINGS === 1 ? '' : 's'})`);
    console.log('   Project is ready for deployment.');
    process.exit(0);
  } else {
    console.log(`❌ ${FAILURES} failure${FAILURES === 1 ? '' : 's'}, ${WARNINGS} warning${WARNINGS === 1 ? '' : 's'}`);
    console.log('   Fix the failures above before deploying.');
    process.exit(1);
  }
}

run();
