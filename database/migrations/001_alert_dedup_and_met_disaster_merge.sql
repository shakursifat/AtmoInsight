-- =============================================================================
-- Migration: Alert deduplication columns + resolution tracking
-- Run against PostgreSQL (Neon) after backups.
-- =============================================================================

ALTER TABLE alert
    ADD COLUMN IF NOT EXISTS sensor_id INTEGER REFERENCES sensor(sensor_id),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;

-- Backfill sensor_id from the linked reading (required for deduplication queries)
UPDATE alert a
SET sensor_id = r.sensor_id
FROM reading r
WHERE a.reading_id = r.reading_id
  AND a.sensor_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_alert_active_sensor_type
    ON alert (sensor_id, alert_type_id)
    WHERE is_active = true;

COMMENT ON COLUMN alert.is_active IS 'False after the condition clears (reading back within threshold).';
COMMENT ON COLUMN alert.resolved_at IS 'When the alert was auto-resolved or cleared.';
COMMENT ON COLUMN alert.last_triggered_at IS 'Last time the threshold was still breached while this alert stayed open.';
