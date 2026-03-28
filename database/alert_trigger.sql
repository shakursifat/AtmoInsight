-- =============================================================================
-- Legacy alert trigger (check_reading_threshold) — DEPRECATED
-- =============================================================================
-- The production trigger is fn_create_alert_on_threshold in database/triggers.sql
-- (trigger trg_alert_on_threshold on reading).  Running both causes duplicate
-- alerts and duplicate disaster rows.  This file only removes the legacy trigger.
-- =============================================================================

DROP TRIGGER IF EXISTS reading_threshold_trigger ON reading;
DROP FUNCTION IF EXISTS check_reading_threshold();
