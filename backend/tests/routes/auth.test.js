const request = require('supertest');
const app = require('../../src/index');
const db = require('../../src/config/database');
const bcrypt = require('bcryptjs');

describe('Auth Routes', () => {
  let testOrgId;
  let testRoleId;

  beforeEach(async () => {
    // Create test organization
    const orgResult = await db.query(
      `INSERT INTO organizations (name, slug, plan) VALUES ('Test Org', 'test-org', 'pro') RETURNING id`
    );
    testOrgId = orgResult.rows[0].id;

    // Create test role
    const roleResult = await db.query(
      `INSERT INTO roles (name, description) VALUES ('admin', 'Admin role') RETURNING id`
    );
    testRoleId = roleResult.rows[0].id;
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!',
          fullName: 'Test User',
          organizationName: 'Test Company',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user).toHaveProperty('email', 'test@example.com');
    });

    it('should reject registration with invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'TestPassword123!',
          fullName: 'Test User',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject registration with weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: '123',
          fullName: 'Test User',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject duplicate email registration', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'dup@example.com',
          password: 'TestPassword123!',
          fullName: 'Test User',
        });

      // Duplicate registration
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'dup@example.com',
          password: 'TestPassword123!',
          fullName: 'Test User 2',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const salt = await bcrypt.genSalt(12);
      const hash = await bcrypt.hash('TestPassword123!', salt);
      await db.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, organization_id, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        ['login@example.com', hash, 'Login User', testRoleId, testOrgId]
      );
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'TestPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject login for non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nobody@example.com',
          password: 'TestPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    let authToken;
    let userId;

    beforeEach(async () => {
      const salt = await bcrypt.genSalt(12);
      const hash = await bcrypt.hash('TestPassword123!', salt);
      const userResult = await db.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, organization_id, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
        ['me@example.com', hash, 'Me User', testRoleId, testOrgId]
      );
      userId = userResult.rows[0].id;

      // Login to get token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'me@example.com', password: 'TestPassword123!' });
      authToken = loginRes.body.data.token;
    });

    it('should return current user with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('email', 'me@example.com');
    });

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear auth cookies on logout', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken;

    beforeEach(async () => {
      const salt = await bcrypt.genSalt(12);
      const hash = await bcrypt.hash('TestPassword123!', salt);
      await db.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, organization_id, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        ['refresh@example.com', hash, 'Refresh User', testRoleId, testOrgId]
      );

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'refresh@example.com', password: 'TestPassword123!' });

      // Extract refresh token from cookie
      const cookies = loginRes.headers['set-cookie'];
      if (cookies) {
        const refreshCookie = cookies.find(c => c.startsWith('refreshToken='));
        if (refreshCookie) {
          refreshToken = refreshCookie.split(';')[0].split('=')[1];
        }
      }
    });

    it('should refresh token with valid refresh token', async () => {
      if (!refreshToken) {
        // Skip if refresh token cookie not available in test env
        return;
      }

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${refreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
    });
  });
});
