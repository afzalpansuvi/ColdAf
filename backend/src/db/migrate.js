require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

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

async function migrate() {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  let migrationFiles;
  try {
    migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
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

    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get already-executed migrations
    const result = await client.query('SELECT filename FROM _migrations ORDER BY filename');
    const executed = new Set(result.rows.map(r => r.filename));

    const pending = migrationFiles.filter(f => !executed.has(f));

    if (pending.length === 0) {
      console.log('All migrations already applied. Nothing to do.');
    } else {
      console.log(`${pending.length} pending migration(s) to run...`);
      for (const file of pending) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`Executing migration: ${file}...`);
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        console.log(`  ✓ ${file} completed`);
      }
      console.log('All migrations completed successfully.');
    }
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
