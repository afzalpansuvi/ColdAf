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
// Seed admin user
// ---------------------------------------------------------------------------
async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@coldaf.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!';
  const adminName = process.env.ADMIN_NAME || 'System Admin';

  console.log(`Seeding admin user: ${adminEmail}`);

  const pool = new Pool(poolConfig);
  let client;

  try {
    client = await pool.connect();
    console.log('Connected to PostgreSQL');

    // ── Look up the 'admin' role ─────────────────────────────────────
    const roleResult = await client.query(
      `SELECT id FROM roles WHERE name = 'admin' LIMIT 1`
    );

    if (roleResult.rows.length === 0) {
      console.error('Error: "admin" role not found in the roles table.');
      console.error('Make sure you have run the migration first (npm run migrate).');
      process.exit(1);
    }

    const adminRoleId = roleResult.rows[0].id;

    // ── Check if admin already exists ────────────────────────────────
    const existingUser = await client.query(
      `SELECT id, email FROM users WHERE email = $1 LIMIT 1`,
      [adminEmail]
    );

    if (existingUser.rows.length > 0) {
      console.log(`Admin user already exists with email: ${adminEmail} (id: ${existingUser.rows[0].id})`);
      console.log('Skipping seed. No changes made.');
      process.exit(0);
    }

    // ── Hash the password ────────────────────────────────────────────
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    // ── Insert the admin user ────────────────────────────────────────
    const insertResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, email, full_name`,
      [adminEmail, passwordHash, adminName, adminRoleId]
    );

    const newUser = insertResult.rows[0];
    console.log(`Admin user created successfully:`);
    console.log(`  ID:    ${newUser.id}`);
    console.log(`  Email: ${newUser.email}`);
    console.log(`  Name:  ${newUser.full_name}`);
  } catch (err) {
    console.error('Failed to seed admin user:');
    console.error(err.message);
    if (err.detail) console.error('Detail:', err.detail);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }

  process.exit(0);
}

seedAdmin();
