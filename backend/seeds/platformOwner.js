require('dotenv').config();

const bcrypt = require('bcryptjs');
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
// Seed platform owner
// ---------------------------------------------------------------------------
async function seedPlatformOwner() {
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL;
  const ownerPassword = process.env.PLATFORM_OWNER_PASSWORD;
  const ownerName = process.env.PLATFORM_OWNER_NAME || 'Platform Owner';

  if (!ownerEmail || !ownerPassword) {
    console.error('ERROR: PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD env vars are required.');
    process.exit(1);
  }

  console.log(`Creating/updating platform owner: ${ownerEmail}`);

  const pool = new Pool(poolConfig);
  let client;

  try {
    client = await pool.connect();
    console.log('Connected to PostgreSQL');

    // Ensure platform_owner role exists
    await client.query(`
      INSERT INTO roles (name, permissions)
      VALUES ('platform_owner', '["*"]'::jsonb)
      ON CONFLICT (name) DO NOTHING
    `);

    const roleResult = await client.query(
      `SELECT id FROM roles WHERE name = 'platform_owner' LIMIT 1`
    );

    if (roleResult.rows.length === 0) {
      console.error('Could not find or create platform_owner role.');
      process.exit(1);
    }

    const roleId = roleResult.rows[0].id;
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(ownerPassword, salt);

    // Upsert: create if missing, update password + role if exists
    const result = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role_id       = EXCLUDED.role_id,
             is_active     = TRUE,
             full_name     = EXCLUDED.full_name
       RETURNING id, email, full_name`,
      [ownerEmail.toLowerCase().trim(), passwordHash, ownerName, roleId]
    );

    const u = result.rows[0];
    console.log('Platform owner ready:');
    console.log(`  ID:    ${u.id}`);
    console.log(`  Email: ${u.email}`);
    console.log(`  Name:  ${u.full_name}`);
    console.log(`  Role:  platform_owner`);
  } catch (err) {
    console.error('Failed to seed platform owner:');
    console.error(err.message);
    if (err.detail) console.error('Detail:', err.detail);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }

  process.exit(0);
}

seedPlatformOwner();
