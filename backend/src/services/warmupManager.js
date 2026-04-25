const db = require('../config/database');
const logger = require('../utils/logger');

// ─── SMTP Account Warm-Up Manager ────────────────────────────────────────────
//
// Manages gradual warm-up of SMTP sending accounts. New or cold accounts start
// with a very low daily send limit (2 emails) and ramp up over a configurable
// duration until they reach the target daily limit.
//
// Warm-up schedules are stored in the smtp_warmup_schedules table and
// progressed daily by the scheduler worker.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum starting daily limit for any warm-up */
const WARMUP_INITIAL_LIMIT = 2;

/**
 * Initialises a new warm-up schedule for an SMTP account.
 *
 * Creates a row in smtp_warmup_schedules with status 'active', starting at
 * day 0 with a daily limit of 2 emails. The limit ramps up to
 * targetDailyLimit over durationDays using the chosen strategy.
 *
 * @param {string} smtpAccountId    - UUID of the SMTP account
 * @param {number} targetDailyLimit - Target daily send limit at the end of warm-up
 * @param {number} [durationDays=30] - Number of days for the warm-up ramp
 * @param {string} [rampStrategy='linear'] - Ramp strategy: 'linear' (more strategies can be added later)
 * @returns {Promise<Object>} The created smtp_warmup_schedules row
 */
async function initWarmup(smtpAccountId, targetDailyLimit, durationDays = 30, rampStrategy = 'linear') {
  if (!smtpAccountId) {
    throw new Error('initWarmup requires an smtpAccountId');
  }
  if (!targetDailyLimit || targetDailyLimit < WARMUP_INITIAL_LIMIT) {
    throw new Error(`targetDailyLimit must be at least ${WARMUP_INITIAL_LIMIT}`);
  }

  const safeDuration = Math.max(1, Math.floor(durationDays));
  const safeStrategy = ['linear'].includes(rampStrategy) ? rampStrategy : 'linear';

  // Check whether an active warm-up already exists for this account
  const existing = await db.query(
    `SELECT id FROM smtp_warmup_schedules
     WHERE smtp_account_id = $1 AND status = 'active'
     LIMIT 1`,
    [smtpAccountId]
  );

  if (existing.rows.length > 0) {
    throw new Error(
      `SMTP account ${smtpAccountId} already has an active warm-up schedule (id: ${existing.rows[0].id}). ` +
      'Complete or cancel it before starting a new one.'
    );
  }

  const result = await db.query(
    `INSERT INTO smtp_warmup_schedules
       (smtp_account_id, target_daily_limit, duration_days, ramp_strategy, current_day, current_daily_limit, status)
     VALUES ($1, $2, $3, $4, 0, $5, 'active')
     RETURNING *`,
    [smtpAccountId, targetDailyLimit, safeDuration, safeStrategy, WARMUP_INITIAL_LIMIT]
  );

  const schedule = result.rows[0];

  logger.info('Warm-up schedule initialised', {
    scheduleId: schedule.id,
    smtpAccountId,
    targetDailyLimit,
    durationDays: safeDuration,
    rampStrategy: safeStrategy,
  });

  return schedule;
}

/**
 * Returns the effective daily send limit for an SMTP account.
 *
 * If the account has an active warm-up schedule, the warm-up's
 * current_daily_limit is returned. Otherwise, the account's regular
 * daily_send_limit is returned.
 *
 * @param {string} smtpAccountId - UUID of the SMTP account
 * @returns {Promise<number>} The current effective daily send limit
 */
async function getDailyLimit(smtpAccountId) {
  if (!smtpAccountId) {
    throw new Error('getDailyLimit requires an smtpAccountId');
  }

  // Check for active warm-up first
  const warmupResult = await db.query(
    `SELECT current_daily_limit FROM smtp_warmup_schedules
     WHERE smtp_account_id = $1 AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [smtpAccountId]
  );

  if (warmupResult.rows.length > 0) {
    return warmupResult.rows[0].current_daily_limit;
  }

  // Fall back to the account's regular daily_send_limit
  const accountResult = await db.query(
    'SELECT daily_send_limit FROM smtp_accounts WHERE id = $1',
    [smtpAccountId]
  );

  if (accountResult.rows.length === 0) {
    throw new Error(`SMTP account ${smtpAccountId} not found`);
  }

  return accountResult.rows[0].daily_send_limit || 500; // Sensible default
}

/**
 * Progresses all active warm-up schedules by one day.
 *
 * This function is intended to be called once daily by the scheduler worker.
 * For each active schedule it:
 *   - Increments current_day
 *   - Recalculates current_daily_limit based on the ramp strategy
 *   - Marks the schedule as 'completed' if current_day >= duration_days
 *
 * @returns {Promise<{ progressed: number, completed: number }>} Summary counts
 */
async function progressWarmup() {
  const activeResult = await db.query(
    `SELECT id, smtp_account_id, target_daily_limit, duration_days, ramp_strategy,
            current_day, current_daily_limit
     FROM smtp_warmup_schedules
     WHERE status = 'active'`
  );

  if (activeResult.rows.length === 0) {
    logger.debug('No active warm-up schedules to progress');
    return { progressed: 0, completed: 0 };
  }

  let progressed = 0;
  let completed = 0;

  for (const schedule of activeResult.rows) {
    try {
      const nextDay = schedule.current_day + 1;
      const target = schedule.target_daily_limit;
      const duration = schedule.duration_days;

      // Calculate the new daily limit based on ramp strategy
      let newLimit;

      switch (schedule.ramp_strategy) {
        case 'linear':
        default:
          // Linear ramp: starts at WARMUP_INITIAL_LIMIT, ends at target
          newLimit = Math.ceil(
            WARMUP_INITIAL_LIMIT + (target - WARMUP_INITIAL_LIMIT) * (nextDay / duration)
          );
          break;
      }

      // Clamp: never exceed target, never go below initial
      newLimit = Math.min(newLimit, target);
      newLimit = Math.max(newLimit, WARMUP_INITIAL_LIMIT);

      // Determine new status
      const isCompleted = nextDay >= duration;
      const newStatus = isCompleted ? 'completed' : 'active';

      // If completing, set the limit to exactly the target
      if (isCompleted) {
        newLimit = target;
      }

      await db.query(
        `UPDATE smtp_warmup_schedules
         SET current_day = $1,
             current_daily_limit = $2,
             status = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [nextDay, newLimit, newStatus, schedule.id]
      );

      progressed++;

      if (isCompleted) {
        completed++;
        logger.info('Warm-up schedule completed', {
          scheduleId: schedule.id,
          smtpAccountId: schedule.smtp_account_id,
          finalDailyLimit: newLimit,
        });
      } else {
        logger.debug('Warm-up schedule progressed', {
          scheduleId: schedule.id,
          smtpAccountId: schedule.smtp_account_id,
          day: nextDay,
          dailyLimit: newLimit,
        });
      }
    } catch (err) {
      logger.error('Failed to progress warm-up schedule', {
        scheduleId: schedule.id,
        smtpAccountId: schedule.smtp_account_id,
        error: err.message,
      });
    }
  }

  logger.info('Warm-up progression cycle finished', { progressed, completed });

  return { progressed, completed };
}

/**
 * Returns the current warm-up status for an SMTP account, or null if no
 * warm-up schedule exists (active or completed).
 *
 * @param {string} smtpAccountId - UUID of the SMTP account
 * @returns {Promise<Object|null>} Warm-up schedule row or null
 */
async function getWarmupStatus(smtpAccountId) {
  if (!smtpAccountId) {
    throw new Error('getWarmupStatus requires an smtpAccountId');
  }

  const result = await db.query(
    `SELECT id, smtp_account_id, target_daily_limit, duration_days, ramp_strategy,
            current_day, current_daily_limit, status, created_at, updated_at
     FROM smtp_warmup_schedules
     WHERE smtp_account_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [smtpAccountId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const schedule = result.rows[0];

  return {
    id: schedule.id,
    smtpAccountId: schedule.smtp_account_id,
    targetDailyLimit: schedule.target_daily_limit,
    durationDays: schedule.duration_days,
    rampStrategy: schedule.ramp_strategy,
    currentDay: schedule.current_day,
    currentDailyLimit: schedule.current_daily_limit,
    status: schedule.status,
    progressPercent: schedule.duration_days > 0
      ? Math.min(100, Math.round((schedule.current_day / schedule.duration_days) * 100))
      : 100,
    createdAt: schedule.created_at,
    updatedAt: schedule.updated_at,
  };
}

/**
 * Cancels an active warm-up schedule, setting its status to 'cancelled'.
 *
 * @param {string} smtpAccountId - UUID of the SMTP account
 * @returns {Promise<boolean>} true if a schedule was cancelled, false if none was active
 */
async function cancelWarmup(smtpAccountId) {
  if (!smtpAccountId) {
    throw new Error('cancelWarmup requires an smtpAccountId');
  }

  const result = await db.query(
    `UPDATE smtp_warmup_schedules
     SET status = 'cancelled', updated_at = NOW()
     WHERE smtp_account_id = $1 AND status = 'active'
     RETURNING id`,
    [smtpAccountId]
  );

  if (result.rows.length > 0) {
    logger.info('Warm-up schedule cancelled', {
      scheduleId: result.rows[0].id,
      smtpAccountId,
    });
    return true;
  }

  return false;
}

module.exports = {
  initWarmup,
  getDailyLimit,
  progressWarmup,
  getWarmupStatus,
  cancelWarmup,
};
