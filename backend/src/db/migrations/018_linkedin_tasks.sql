-- Migration 018: LinkedIn manual task step support
--
-- Adds completed_tasks tracking to lead_sequence_state so the processor
-- can record which manual tasks have been notified.
-- No schema changes are needed for sequence_steps because step_type is
-- a plain VARCHAR with no CHECK constraint — new values work immediately.

BEGIN;

ALTER TABLE lead_sequence_state
  ADD COLUMN IF NOT EXISTS completed_tasks JSONB DEFAULT '[]';

COMMIT;
