require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

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

const pool = new Pool(poolConfig);

async function fixDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔧 Fixing database...');

    // ── 1. Ensure all roles exist with correct permissions ───────────────────
    const roles = [
      { name: 'user', description: 'Standard user', permissions: ['users.read', 'campaigns.read', 'leads.read', 'analytics.read'] },
      { name: 'admin', description: 'Organization admin', permissions: ['users.manage', 'campaigns.manage', 'leads.manage', 'brands.manage', 'smtp.manage', 'templates.manage', 'analytics.read', 'settings.manage', 'audit_logs.read'] },
      { name: 'org_admin', description: 'Organization admin', permissions: ['users.manage', 'campaigns.manage', 'leads.manage', 'brands.manage', 'smtp.manage', 'templates.manage', 'analytics.read', 'settings.manage', 'audit_logs.read'] },
      { name: 'sales', description: 'Sales user', permissions: ['leads.manage', 'campaigns.read', 'analytics.read', 'replies.manage'] },
      { name: 'viewer', description: 'Read-only user', permissions: ['users.read', 'campaigns.read', 'leads.read', 'analytics.read'] },
      { name: 'super_admin', description: 'Platform admin', permissions: ['*'] },
      { name: 'support_admin', description: 'Support admin', permissions: ['users.read', 'organizations.read', 'audit_logs.read'] },
      { name: 'billing_admin', description: 'Billing admin', permissions: ['billing.manage', 'users.read', 'organizations.read'] },
      { name: 'platform_owner', description: 'Platform owner', permissions: ['*'] },
    ];

    for (const role of roles) {
      const existing = await client.query(
        `SELECT id, name, permissions FROM roles WHERE name = $1`,
        [role.name]
      );
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO roles (name, description, permissions) VALUES ($1, $2, $3)`,
          [role.name, role.description, role.permissions]
        );
        console.log(`  ✅ Created role: ${role.name}`);
      } else {
        const currentPerms = existing.rows[0].permissions;
        const needsUpdate = JSON.stringify(currentPerms) !== JSON.stringify(role.permissions);
        if (needsUpdate) {
          await client.query(
            `UPDATE roles SET permissions = $1 WHERE name = $2`,
            [role.permissions, role.name]
          );
          console.log(`  ✅ Updated permissions for role: ${role.name}`);
        } else {
          console.log(`  ℹ️  Role OK: ${role.name}`);
        }
      }
    }

    // ── 2. Ensure default organization exists ────────────────────────────────
    let defaultOrg = await client.query(
      `SELECT id FROM organizations WHERE slug = 'default' LIMIT 1`
    );
    let defaultOrgId;
    if (defaultOrg.rows.length === 0) {
      const insert = await client.query(
        `INSERT INTO organizations (name, slug, plan, max_users, max_brands, max_emails_per_month, max_phone_minutes_per_month)
         VALUES ('Default Organization', 'default', 'pro', 999999, 999999, 999999, 999999)
         RETURNING id`
      );
      defaultOrgId = insert.rows[0].id;
      console.log(`  ✅ Created default organization: ${defaultOrgId}`);
    } else {
      defaultOrgId = defaultOrg.rows[0].id;
      console.log(`  ℹ️  Default organization exists: ${defaultOrgId}`);
    }

    // ── 3. Fix all users without organization_id ──────────────────────────────
    const usersWithoutOrg = await client.query(
      `SELECT id, email, full_name, role, role_id FROM users WHERE organization_id IS NULL`
    );
    console.log(`  ${usersWithoutOrg.rows.length} users without organization_id found`);
    for (const user of usersWithoutOrg.rows) {
      // Assign to default org
      await client.query(
        `UPDATE users SET organization_id = $1 WHERE id = $2`,
        [defaultOrgId, user.id]
      );
      console.log(`  ✅ Fixed user ${user.email} — assigned to default org`);
    }

    // ── 4. Fix all users without role_id ─────────────────────────────────────
    const usersWithoutRoleId = await client.query(
      `SELECT id, email, role FROM users WHERE role_id IS NULL`
    );
    console.log(`  ${usersWithoutRoleId.rows.length} users without role_id found`);
    for (const user of usersWithoutRoleId.rows) {
      // Find matching role
      const roleMap = {
        'admin': 'admin',
        'org_admin': 'org_admin',
        'user': 'user',
        'sales': 'sales',
        'viewer': 'viewer',
        'super_admin': 'super_admin',
        'support_admin': 'support_admin',
        'billing_admin': 'billing_admin',
        'platform_owner': 'platform_owner',
      };
      const targetRole = roleMap[user.role] || 'user';
      const roleResult = await client.query(
        `SELECT id FROM roles WHERE name = $1 LIMIT 1`,
        [targetRole]
      );
      if (roleResult.rows.length > 0) {
        await client.query(
          `UPDATE users SET role_id = $1 WHERE id = $2`,
          [roleResult.rows[0].id, user.id]
        );
        console.log(`  ✅ Fixed user ${user.email} — assigned role ${targetRole}`);
      } else {
        console.log(`  ⚠️  Could not find role ${targetRole} for user ${user.email}`);
      }
    }

    // ── 5. Fix users where role column doesn't match role_id ─────────────────
    const mismatchedUsers = await client.query(
      `SELECT u.id, u.email, u.role, r.name AS role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.role IS NOT NULL AND u.role != r.name`
    );
    console.log(`  ${mismatchedUsers.rows.length} users with role/role_id mismatch found`);
    for (const user of mismatchedUsers.rows) {
      await client.query(
        `UPDATE users SET role = $1 WHERE id = $2`,
        [user.role_name, user.id]
      );
      console.log(`  ✅ Synced user ${user.email} role to ${user.role_name}`);
    }

    // ── 6. Ensure platform owner exists ─────────────────────────────────────
    const platformOwnerEmail = process.env.PLATFORM_OWNER_EMAIL || 'apansuvi1@gmail.com';
    const existingOwner = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [platformOwnerEmail]
    );

    const ownerRoleId = (await client.query(`SELECT id FROM roles WHERE name = 'platform_owner' LIMIT 1`)).rows[0]?.id;

    if (existingOwner.rows.length === 0) {
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash('ChangeThisPassword123!', salt);
      const insert = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, role_id, organization_id, is_active)
         VALUES ($1, $2, $3, 'platform_owner', $4, $5, TRUE)
         RETURNING id`,
        [platformOwnerEmail, passwordHash, 'Platform Owner', ownerRoleId, defaultOrgId]
      );
      console.log(`  ✅ Created platform owner: ${platformOwnerEmail} (id: ${insert.rows[0].id})`);
    } else {
      // Ensure platform owner has correct role and org
      await client.query(
        `UPDATE users SET role = 'platform_owner', role_id = $1, organization_id = $2, is_active = TRUE WHERE id = $3`,
        [ownerRoleId, defaultOrgId, existingOwner.rows[0].id]
      );
      console.log(`  ✅ Fixed platform owner: ${platformOwnerEmail}`);
    }

    // Set platform owner as org owner
    await client.query(
      `UPDATE organizations SET owner_id = (SELECT id FROM users WHERE email = $1) WHERE id = $2`,
      [platformOwnerEmail, defaultOrgId]
    );

    console.log('\n✅ Database fix complete!');
    console.log('   Log out and log back in for changes to take effect.');

  } catch (err) {
    console.error('❌ Database fix failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixDatabase();
