const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireRole, requirePermission } = require('../middleware/rbac');
const audit = require('../services/audit');

const router = express.Router();

// All A/B test routes require authentication + org scope
router.use(authenticate);
router.use(tenantScope);
router.use(requireOrg);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TEST_TYPES = [
  'subject_line', 'body_style', 'send_time', 'multi_brand_strategy', 'combined',
];

const VALID_STATUSES = ['active', 'completed', 'cancelled'];

/**
 * Calculates the z-score for a two-proportion z-test.
 * Used to measure statistical confidence between two variant conversion rates.
 *
 * @param {number} p1    - Proportion for variant 1 (e.g. open rate)
 * @param {number} n1    - Sample size for variant 1
 * @param {number} p2    - Proportion for variant 2
 * @param {number} n2    - Sample size for variant 2
 * @returns {number} z-score
 */
function zTestProportions(p1, n1, p2, n2) {
  if (n1 === 0 || n2 === 0) return 0;

  const pPool = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));

  if (se === 0) return 0;

  return (p1 - p2) / se;
}

/**
 * Converts a z-score to an approximate confidence level (two-tailed).
 * Uses a rough lookup; sufficient for A/B test dashboards.
 *
 * @param {number} z - Absolute z-score
 * @returns {number} Confidence percentage (0-100)
 */
function zToConfidence(z) {
  const absZ = Math.abs(z);
  // Common z-score -> confidence mappings (two-tailed)
  if (absZ >= 3.29) return 99.9;
  if (absZ >= 2.576) return 99;
  if (absZ >= 2.326) return 98;
  if (absZ >= 1.96) return 95;
  if (absZ >= 1.645) return 90;
  if (absZ >= 1.44) return 85;
  if (absZ >= 1.28) return 80;
  if (absZ >= 1.04) return 70;
  if (absZ >= 0.84) return 60;
  if (absZ >= 0.67) return 50;
  // Below 50% confidence — essentially random
  return Math.round(50 + (absZ / 0.67) * 10);
}

/**
 * Computes rate metrics for a variant row.
 */
function computeVariantMetrics(v) {
  const sent = v.total_sent || 0;
  return {
    id: v.id,
    abTestId: v.ab_test_id,
    name: v.name,
    variantType: v.variant_type,
    config: v.config,
    totalSent: sent,
    totalOpened: v.total_opened || 0,
    totalClicked: v.total_clicked || 0,
    totalReplied: v.total_replied || 0,
    totalBounced: v.total_bounced || 0,
    openRate: sent > 0 ? parseFloat(((v.total_opened / sent) * 100).toFixed(2)) : 0,
    clickRate: sent > 0 ? parseFloat(((v.total_clicked / sent) * 100).toFixed(2)) : 0,
    replyRate: sent > 0 ? parseFloat(((v.total_replied / sent) * 100).toFixed(2)) : 0,
    bounceRate: sent > 0 ? parseFloat(((v.total_bounced / sent) * 100).toFixed(2)) : 0,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET /campaign/:campaignId - List A/B tests for a campaign with variants
// ---------------------------------------------------------------------------
router.get('/campaign/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Verify campaign exists and belongs to this org
    const campaignCheck = await db.query(
      `SELECT id FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [campaignId, req.organizationId]
    );

    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.',
      });
    }

    // Fetch A/B tests
    const testsResult = await db.query(
      `SELECT id, campaign_id, name, test_type, status, winner_variant_id,
              min_sample_size, auto_select_winner, created_at, updated_at
       FROM ab_tests
       WHERE campaign_id = $1
       ORDER BY created_at DESC`,
      [campaignId]
    );

    // Fetch all variants for these tests in one query
    const testIds = testsResult.rows.map((t) => t.id);
    let variantsMap = {};

    if (testIds.length > 0) {
      const variantsResult = await db.query(
        `SELECT id, ab_test_id, name, variant_type, config,
                total_sent, total_opened, total_clicked, total_replied, total_bounced,
                created_at, updated_at
         FROM ab_variants
         WHERE ab_test_id = ANY($1)
         ORDER BY created_at ASC`,
        [testIds]
      );

      // Group variants by test id
      for (const v of variantsResult.rows) {
        if (!variantsMap[v.ab_test_id]) {
          variantsMap[v.ab_test_id] = [];
        }
        variantsMap[v.ab_test_id].push(computeVariantMetrics(v));
      }
    }

    const tests = testsResult.rows.map((t) => ({
      id: t.id,
      campaignId: t.campaign_id,
      name: t.name,
      testType: t.test_type,
      status: t.status,
      winnerVariantId: t.winner_variant_id,
      minSampleSize: t.min_sample_size,
      autoSelectWinner: t.auto_select_winner,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      variants: variantsMap[t.id] || [],
    }));

    return res.json({
      success: true,
      data: tests,
    });
  } catch (err) {
    logger.error('List A/B tests error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing A/B tests.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST / - Create A/B test with variants (admin only, uses transaction)
// ---------------------------------------------------------------------------
router.post('/', requirePermission('*'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { campaignId, name, testType, minSampleSize, autoSelectWinner, variants } = req.body;

    // Validation
    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: 'campaignId is required.',
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A/B test name is required.',
      });
    }

    if (!testType || !VALID_TEST_TYPES.includes(testType)) {
      return res.status(400).json({
        success: false,
        message: `testType must be one of: ${VALID_TEST_TYPES.join(', ')}.`,
      });
    }

    if (!variants || !Array.isArray(variants) || variants.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least two variants are required.',
      });
    }

    // Verify campaign exists and belongs to this org
    const campaignCheck = await db.query(
      `SELECT id FROM campaigns WHERE id = $1 AND organization_id = $2`,
      [campaignId, req.organizationId]
    );

    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found.',
      });
    }

    await client.query('BEGIN');

    // Insert A/B test
    const testResult = await client.query(
      `INSERT INTO ab_tests
        (campaign_id, name, test_type, status, min_sample_size, auto_select_winner)
       VALUES ($1, $2, $3, 'active', $4, $5)
       RETURNING *`,
      [
        campaignId,
        name.trim(),
        testType,
        minSampleSize != null ? minSampleSize : 100,
        autoSelectWinner != null ? autoSelectWinner : false,
      ]
    );

    const abTest = testResult.rows[0];

    // Insert variants
    const createdVariants = [];
    for (const variant of variants) {
      if (!variant.name || !variant.name.trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Each variant must have a name.',
        });
      }

      const variantResult = await client.query(
        `INSERT INTO ab_variants
          (ab_test_id, name, variant_type, config)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          abTest.id,
          variant.name.trim(),
          variant.variantType || testType,
          variant.config ? JSON.stringify(variant.config) : '{}',
        ]
      );

      createdVariants.push(computeVariantMetrics(variantResult.rows[0]));
    }

    await client.query('COMMIT');

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'ab_test.create',
      targetType: 'ab_test',
      targetId: abTest.id,
      description: `Admin created A/B test "${abTest.name}" for campaign ${campaignId}`,
      metadata: {
        testName: abTest.name,
        testType,
        campaignId,
        variantCount: createdVariants.length,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('A/B test created', {
      testId: abTest.id,
      name: abTest.name,
      campaignId,
      variantCount: createdVariants.length,
      createdBy: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: abTest.id,
        campaignId: abTest.campaign_id,
        name: abTest.name,
        testType: abTest.test_type,
        status: abTest.status,
        winnerVariantId: abTest.winner_variant_id,
        minSampleSize: abTest.min_sample_size,
        autoSelectWinner: abTest.auto_select_winner,
        createdAt: abTest.created_at,
        updatedAt: abTest.updated_at,
        variants: createdVariants,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Create A/B test error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the A/B test.',
    });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /:id/results - Get test results with statistical confidence
// ---------------------------------------------------------------------------
router.get('/:id/results', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the A/B test
    const testResult = await db.query(
      `SELECT id, campaign_id, name, test_type, status, winner_variant_id,
              min_sample_size, auto_select_winner, created_at, updated_at
       FROM ab_tests
       WHERE id = $1`,
      [id]
    );

    if (testResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'A/B test not found.',
      });
    }

    const test = testResult.rows[0];

    // Fetch variants with metrics
    const variantsResult = await db.query(
      `SELECT id, ab_test_id, name, variant_type, config,
              total_sent, total_opened, total_clicked, total_replied, total_bounced,
              created_at, updated_at
       FROM ab_variants
       WHERE ab_test_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const variants = variantsResult.rows.map(computeVariantMetrics);

    // Determine total sample size
    const totalSampleSize = variants.reduce((sum, v) => sum + v.totalSent, 0);
    const sampleSizeReached = totalSampleSize >= (test.min_sample_size || 100);

    // Calculate statistical confidence between the top 2 variants
    // Sort by open rate descending to find the top 2
    const sortedByOpen = [...variants].sort((a, b) => b.openRate - a.openRate);

    let confidence = null;
    let suggestedWinner = null;

    if (sortedByOpen.length >= 2 && sortedByOpen[0].totalSent > 0 && sortedByOpen[1].totalSent > 0) {
      const top = sortedByOpen[0];
      const runner = sortedByOpen[1];

      // z-test on open rates
      const openZ = zTestProportions(
        top.totalOpened / top.totalSent, top.totalSent,
        runner.totalOpened / runner.totalSent, runner.totalSent
      );
      const openConfidence = zToConfidence(openZ);

      // z-test on click rates
      const clickZ = zTestProportions(
        top.totalClicked / top.totalSent, top.totalSent,
        runner.totalClicked / runner.totalSent, runner.totalSent
      );
      const clickConfidence = zToConfidence(clickZ);

      // z-test on reply rates
      const replyZ = zTestProportions(
        top.totalReplied / top.totalSent, top.totalSent,
        runner.totalReplied / runner.totalSent, runner.totalSent
      );
      const replyConfidence = zToConfidence(replyZ);

      confidence = {
        openRate: { zScore: parseFloat(openZ.toFixed(4)), confidence: openConfidence },
        clickRate: { zScore: parseFloat(clickZ.toFixed(4)), confidence: clickConfidence },
        replyRate: { zScore: parseFloat(replyZ.toFixed(4)), confidence: replyConfidence },
        topVariantId: top.id,
        runnerUpVariantId: runner.id,
      };

      // Suggest winner if sample size reached and open rate confidence >= 95%
      if (sampleSizeReached && openConfidence >= 95) {
        suggestedWinner = {
          variantId: top.id,
          variantName: top.name,
          reason: `Open rate confidence ${openConfidence}% (z=${openZ.toFixed(2)})`,
        };
      }
    }

    return res.json({
      success: true,
      data: {
        id: test.id,
        campaignId: test.campaign_id,
        name: test.name,
        testType: test.test_type,
        status: test.status,
        winnerVariantId: test.winner_variant_id,
        minSampleSize: test.min_sample_size,
        autoSelectWinner: test.auto_select_winner,
        totalSampleSize,
        sampleSizeReached,
        variants,
        confidence,
        suggestedWinner,
      },
    });
  } catch (err) {
    logger.error('Get A/B test results error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching A/B test results.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/declare-winner - Set winner variant and complete test (admin only)
// ---------------------------------------------------------------------------
router.post('/:id/declare-winner', requirePermission('*'), async (req, res) => {
  try {
    const { id } = req.params;
    const { variantId } = req.body;

    if (!variantId) {
      return res.status(400).json({
        success: false,
        message: 'variantId is required.',
      });
    }

    // Verify test exists and is active
    const testResult = await db.query(
      `SELECT id, campaign_id, name, status FROM ab_tests WHERE id = $1`,
      [id]
    );

    if (testResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'A/B test not found.',
      });
    }

    const test = testResult.rows[0];

    if (test.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'This A/B test has already been completed.',
      });
    }

    if (test.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot declare a winner for a cancelled test.',
      });
    }

    // Verify variant belongs to this test
    const variantCheck = await db.query(
      `SELECT id, name FROM ab_variants WHERE id = $1 AND ab_test_id = $2`,
      [variantId, id]
    );

    if (variantCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Variant not found or does not belong to this test.',
      });
    }

    const winnerVariant = variantCheck.rows[0];

    // Update the test
    const updateResult = await db.query(
      `UPDATE ab_tests
       SET winner_variant_id = $1, status = 'completed', updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [variantId, id]
    );

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'ab_test.declare_winner',
      targetType: 'ab_test',
      targetId: id,
      description: `Admin declared variant "${winnerVariant.name}" as winner for A/B test "${test.name}"`,
      metadata: {
        testName: test.name,
        campaignId: test.campaign_id,
        winnerVariantId: variantId,
        winnerVariantName: winnerVariant.name,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('A/B test winner declared', {
      testId: id,
      testName: test.name,
      winnerVariantId: variantId,
      winnerVariantName: winnerVariant.name,
      declaredBy: req.user.id,
    });

    const updated = updateResult.rows[0];

    return res.json({
      success: true,
      data: {
        id: updated.id,
        campaignId: updated.campaign_id,
        name: updated.name,
        testType: updated.test_type,
        status: updated.status,
        winnerVariantId: updated.winner_variant_id,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err) {
    logger.error('Declare A/B test winner error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while declaring the winner.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id - Delete A/B test and its variants (admin only)
// ---------------------------------------------------------------------------
router.delete('/:id', requirePermission('*'), async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;

    // Verify test exists
    const testResult = await client.query(
      `SELECT id, campaign_id, name FROM ab_tests WHERE id = $1`,
      [id]
    );

    if (testResult.rows.length === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        message: 'A/B test not found.',
      });
    }

    const test = testResult.rows[0];

    await client.query('BEGIN');

    // Delete variants first (foreign key dependency)
    await client.query(
      `DELETE FROM ab_variants WHERE ab_test_id = $1`,
      [id]
    );

    // Delete the test
    await client.query(
      `DELETE FROM ab_tests WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'ab_test.delete',
      targetType: 'ab_test',
      targetId: id,
      description: `Admin deleted A/B test "${test.name}" from campaign ${test.campaign_id}`,
      metadata: {
        testName: test.name,
        campaignId: test.campaign_id,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('A/B test deleted', {
      testId: id,
      testName: test.name,
      campaignId: test.campaign_id,
      deletedBy: req.user.id,
    });

    return res.json({
      success: true,
      message: `A/B test "${test.name}" has been deleted.`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Delete A/B test error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deleting the A/B test.',
    });
  } finally {
    client.release();
  }
});

module.exports = router;
