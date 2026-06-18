const request = require('supertest');
const app = require('../../src/index');
const db = require('../../src/config/database');
const bcrypt = require('bcryptjs');

describe('Brands Routes', () => {
  let authToken;
  let testOrgId;
  let testRoleId;
  let adminUserId;

  beforeEach(async () => {
    // Create test organization
    const orgResult = await db.query(
      `INSERT INTO organizations (name, slug, plan) VALUES ('Test Org', 'test-org', 'pro') RETURNING id`
    );
    testOrgId = orgResult.rows[0].id;

    // Create admin role
    const roleResult = await db.query(
      `INSERT INTO roles (name, description) VALUES ('admin', 'Admin role') RETURNING id`
    );
    testRoleId = roleResult.rows[0].id;

    // Create admin user
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash('TestPassword123!', salt);
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, organization_id, is_active, role)
       VALUES ($1, $2, $3, $4, $5, TRUE, 'admin') RETURNING id`,
      ['admin@test.com', hash, 'Admin User', testRoleId, testOrgId]
    );
    adminUserId = userResult.rows[0].id;

    // Login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'TestPassword123!' });
    authToken = loginRes.body.data.token;
  });

  describe('GET /api/brands', () => {
    it('should return empty array when no brands exist', async () => {
      const res = await request(app)
        .get('/api/brands')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return brands for the organization', async () => {
      // Insert a brand
      await db.query(
        `INSERT INTO brands (name, primary_domain, organization_id, is_active)
         VALUES ($1, $2, $3, TRUE)`,
        ['Test Brand', 'test.com', testOrgId]
      );

      const res = await request(app)
        .get('/api/brands')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toHaveProperty('name', 'Test Brand');
    });

    it('should not return brands from other organizations', async () => {
      // Create another organization
      const otherOrg = await db.query(
        `INSERT INTO organizations (name, slug, plan) VALUES ('Other Org', 'other-org', 'pro') RETURNING id`
      );

      // Insert brand in other org
      await db.query(
        `INSERT INTO brands (name, primary_domain, organization_id, is_active)
         VALUES ($1, $2, $3, TRUE)`,
        ['Other Brand', 'other.com', otherOrg.rows[0].id]
      );

      // Insert brand in our org
      await db.query(
        `INSERT INTO brands (name, primary_domain, organization_id, is_active)
         VALUES ($1, $2, $3, TRUE)`,
        ['Our Brand', 'our.com', testOrgId]
      );

      const res = await request(app)
        .get('/api/brands')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toHaveProperty('name', 'Our Brand');
    });
  });

  describe('POST /api/brands', () => {
    it('should create a brand with valid data', async () => {
      const res = await request(app)
        .post('/api/brands')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Brand',
          primaryDomain: 'newbrand.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('name', 'New Brand');
    });

    it('should reject brand creation without name', async () => {
      const res = await request(app)
        .post('/api/brands')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          primaryDomain: 'nobrand.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject brand creation with invalid domain', async () => {
      const res = await request(app)
        .post('/api/brands')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Bad Brand',
          primaryDomain: 'not-a-domain',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/brands/:id', () => {
    it('should return a brand by ID', async () => {
      const brandResult = await db.query(
        `INSERT INTO brands (name, primary_domain, organization_id, is_active)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        ['Single Brand', 'single.com', testOrgId]
      );
      const brandId = brandResult.rows[0].id;

      const res = await request(app)
        .get(`/api/brands/${brandId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('name', 'Single Brand');
    });

    it('should return 404 for non-existent brand', async () => {
      const res = await request(app)
        .get('/api/brands/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should not return brand from other organization', async () => {
      const otherOrg = await db.query(
        `INSERT INTO organizations (name, slug, plan) VALUES ('Other Org 2', 'other-org-2', 'pro') RETURNING id`
      );

      const brandResult = await db.query(
        `INSERT INTO brands (name, primary_domain, organization_id, is_active)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        ['Other Org Brand', 'other-org-brand.com', otherOrg.rows[0].id]
      );
      const otherBrandId = brandResult.rows[0].id;

      const res = await request(app)
        .get(`/api/brands/${otherBrandId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/brands/:id', () => {
    it('should update a brand', async () => {
      const brandResult = await db.query(
        `INSERT INTO brands (name, primary_domain, organization_id, is_active)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        ['Old Name', 'old.com', testOrgId]
      );
      const brandId = brandResult.rows[0].id;

      const res = await request(app)
        .put(`/api/brands/${brandId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Name',
          primaryDomain: 'updated.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('name', 'Updated Name');
    });

    it('should reject update to brand in other organization', async () => {
      const otherOrg = await db.query(
        `INSERT INTO organizations (name, slug, plan) VALUES ('Other Org 3', 'other-org-3', 'pro') RETURNING id`
      );

      const brandResult = await db.query(
        `INSERT INTO brands (name, primary_domain, organization_id, is_active)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        ['Other Brand', 'other-brand.com', otherOrg.rows[0].id]
      );
      const otherBrandId = brandResult.rows[0].id;

      const res = await request(app)
        .put(`/api/brands/${otherBrandId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Hacked Name',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/brands/:id', () => {
    it('should delete a brand', async () => {
      const brandResult = await db.query(
        `INSERT INTO brands (name, primary_domain, organization_id, is_active)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        ['Delete Me', 'delete.com', testOrgId]
      );
      const brandId = brandResult.rows[0].id;

      const res = await request(app)
        .delete(`/api/brands/${brandId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify brand is gone
      const check = await db.query('SELECT id FROM brands WHERE id = $1', [brandId]);
      expect(check.rows).toHaveLength(0);
    });

    it('should not delete brand from other organization', async () => {
      const otherOrg = await db.query(
        `INSERT INTO organizations (name, slug, plan) VALUES ('Other Org 4', 'other-org-4', 'pro') RETURNING id`
      );

      const brandResult = await db.query(
        `INSERT INTO brands (name, primary_domain, organization_id, is_active)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        ['Protected Brand', 'protected.com', otherOrg.rows[0].id]
      );
      const otherBrandId = brandResult.rows[0].id;

      const res = await request(app)
        .delete(`/api/brands/${otherBrandId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);

      // Verify brand still exists
      const check = await db.query('SELECT id FROM brands WHERE id = $1', [otherBrandId]);
      expect(check.rows).toHaveLength(1);
    });
  });
});
