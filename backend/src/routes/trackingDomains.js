const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireAdmin } = require('../middleware/rbac');
const { sanitizeBody } = require('../middleware/validation');

// ═══════════════════════════════════════════════════════════════
//  Tracking Domain Routes
// ═══════════════════════════════════════════════════════════════

// GET /api/tracking-domains — List tracking domains for org
router.get('/', authenticate, tenantScope, requireOrg, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT td.*, b.name as brand_name
       FROM tracking_domains td
       LEFT JOIN brands b ON td.brand_id = b.id
       WHERE td.organization_id = $1
       ORDER BY td.is_primary DESC, td.created_at DESC`,
      [req.organizationId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Tracking domains fetch failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tracking-domains — Add a tracking domain
router.post('/', authenticate, tenantScope, requireOrg, requireAdmin, sanitizeBody, async (req, res) => {
  try {
    const { brandId, domain, subdomain } = req.body;

    if (!domain) {
      return res.status(400).json({ success: false, message: 'domain is required.' });
    }

    // Verify domain format
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(domain)) {
      return res.status(400).json({ success: false, message: 'Invalid domain format.' });
    }

    const sub = subdomain || 'track';
    const fullDomain = `${sub}.${domain}`;
    const cnameRecord = `${sub}.${domain}`;

    // Check if brand belongs to this org
    if (brandId) {
      const brandCheck = await db.query(
        `SELECT id FROM brands WHERE id = $1 AND organization_id = $2`,
        [brandId, req.organizationId]
      );
      if (brandCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Brand not found.' });
      }
    }

    const result = await db.query(
      `INSERT INTO tracking_domains (
         organization_id, brand_id, domain, subdomain, full_domain, cname_record, cname_target
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'track.coldaf.com')
       RETURNING *`,
      [req.organizationId, brandId, domain, sub, fullDomain, cnameRecord]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Domain already registered for this organization.' });
    }
    logger.error('Tracking domain creation failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tracking-domains/:id/verify — Verify CNAME record
router.post('/:id/verify', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    const domain = await db.query(
      `SELECT * FROM tracking_domains WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.organizationId]
    );

    if (domain.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Domain not found.' });
    }

    const td = domain.rows[0];

    // In production, this would do a real DNS lookup
    // For now, simulate verification (user can manually confirm via DNS)
    await db.query(
      `UPDATE tracking_domains
       SET is_verified = TRUE, verified_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    return res.json({ success: true, message: 'Domain verified.' });
  } catch (err) {
    logger.error('Tracking domain verification failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/tracking-domains/:id — Delete a tracking domain
router.delete('/:id', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM tracking_domains WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [req.params.id, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Domain not found.' });
    }

    return res.json({ success: true, message: 'Tracking domain deleted.' });
  } catch (err) {
    logger.error('Tracking domain deletion failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
