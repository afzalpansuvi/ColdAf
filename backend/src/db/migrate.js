require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Build connection config from environment
// ---------------------------------------------------------------------------
const connectionString = process.env.DATABASE_URL;

const poolConfig = connectionString
  ? { connectionString }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'coldaf_db',
      user: process.env.DB_USER || 'coldaf',
      password: process.env.DB_PASSWORD || 'coldaf_password',
    };

// ---------------------------------------------------------------------------
// Run migration
// ---------------------------------------------------------------------------
async function migrate() {
  // Discover all migration files in order
  const migrationsDir = path.resolve(__dirname, 'migrations');
  let migrationFiles;
  try {
    migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // 001_..., 002_..., etc.
  } catch (err) {
    console.error(`Failed to read migrations directory: ${migrationsDir}`);
    console.error(err.message);
    process.exit(1);
  }

  if (migrationFiles.length === 0) {
    console.error('No migration files found.');
    process.exit(1);
  }

  console.log(`Found ${migrationFiles.length} migration file(s): ${migrationFiles.join(', ')}`);
  console.log('Connecting to database...');

  const pool = new Pool(poolConfig);

  let client;
  try {
    client = await pool.connect();
    console.log('Connected to PostgreSQL');

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`Executing migration: ${file}...`);
      await client.query(sql);
      console.log(`  ✓ ${file} completed`);
    }

    console.log('All migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:');
    console.error(err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    if (err.position) console.error('Position:', err.position);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }

  process.exit(0);
}

migrate();
