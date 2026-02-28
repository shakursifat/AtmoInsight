-- =============================================================================
-- AtmoInsight Hub - Database Triggers
-- Compatible with PostgreSQL 14+ / Neon Serverless
-- =============================================================================
-- NOTE: alert_trigger.sql contains the original threshold trigger used by the
-- Node.js backend (check_reading_threshold).  This file provides three
-- additional/replacement triggers with production-quality threshold lookups,
-- aggregation maintenance, and an audit trail for citizen reports.
-- =============================================================================


-- =============================================================================
-- TRIGGER 1: Smart Alert on New Reading
-- Fires AFTER INSERT ON reading.
-- Looks up the AlertThreshold table dynamically (no hard-coded > 80 magic
-- number) and inserts into Alert when any configured threshold is breached.
-- Also fires pg_notify so the Node.js backend can push a real-time update.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_create_alert_on_threshold()
RETURNS TRIGGER AS $$
DECLARE
    v_threshold   RECORD;
    v_alert_type  INTEGER;
    v_severity    VARCHAR(20);
    v_message     TEXT;
    v_location_id INTEGER;
    v_event_id    INTEGER;
BEGIN
    -- -------------------------------------------------------------------------
    -- Step 1: Find any breached threshold for this measurement type
    -- -------------------------------------------------------------------------
    SELECT * INTO v_threshold
    FROM alertthreshold
    WHERE measurement_type_id = NEW.measurement_type_id
      AND (
            (max_value IS NOT NULL AND NEW.value > max_value)
         OR (min_value IS NOT NULL AND NEW.value < min_value)
          )
    ORDER BY max_value DESC NULLS LAST    -- pick the most restrictive breach
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;  -- no threshold configured — nothing to do
    END IF;

    -- -------------------------------------------------------------------------
    -- Step 2: Determine alert type and severity from the threshold record
    -- -------------------------------------------------------------------------
    v_severity := COALESCE(v_threshold.severity, 'Low');

    -- Upgrade severity when value is MUCH higher than the max threshold
    IF v_threshold.max_value IS NOT NULL AND NEW.value > v_threshold.max_value * 1.5 THEN
        v_severity := 'Critical';
    END IF;

    -- Map measurement_type to a matching alert_type_id (graceful fallback to 1)
    SELECT alert_type_id INTO v_alert_type
    FROM alerttype
    WHERE type_name ILIKE '%' || (
            SELECT type_name FROM measurementtype
            WHERE measurement_type_id = NEW.measurement_type_id
          ) || '%'
    LIMIT 1;

    v_alert_type := COALESCE(v_alert_type, 1);

    -- -------------------------------------------------------------------------
    -- Step 3: Build a human-readable alert message
    -- -------------------------------------------------------------------------
    v_message := FORMAT(
        'Threshold breached: sensor_id=%s recorded value=%s (threshold max=%s). Severity: %s.',
        NEW.sensor_id,
        NEW.value,
        COALESCE(v_threshold.max_value::text, 'N/A'),
        v_severity
    );

    -- -------------------------------------------------------------------------
    -- Step 4: Insert the alert
    -- -------------------------------------------------------------------------
    INSERT INTO alert (reading_id, alert_type_id, message, timestamp, severity)
    VALUES (NEW.reading_id, v_alert_type, v_message, NOW(), v_severity);

    -- -------------------------------------------------------------------------
    -- Step 5: Publish real-time notification to Node.js via pg_notify
    -- -------------------------------------------------------------------------
    PERFORM pg_notify('new_alert_channel', row_to_json(NEW)::text);

    -- -------------------------------------------------------------------------
    -- Step 6: Auto-generate DisasterEvent if severity is Critical
    -- -------------------------------------------------------------------------
    IF v_severity = 'Critical' THEN
        SELECT location_id INTO v_location_id
        FROM sensor WHERE sensor_id = NEW.sensor_id;

        INSERT INTO disasterevent
            (disaster_type_id, start_timestamp, severity, description, location_id)
        VALUES
            (1, NOW(), 'EXTREME',
             FORMAT('Auto-generated disaster event: sensor %s exceeded critical threshold (%s).',
                    NEW.sensor_id, NEW.value),
             v_location_id)
        RETURNING event_id INTO v_event_id;

        PERFORM pg_notify('new_disaster_channel', v_event_id::text);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate to avoid duplicate
DROP TRIGGER IF EXISTS trg_alert_on_threshold ON reading;

CREATE TRIGGER trg_alert_on_threshold
AFTER INSERT ON reading
FOR EACH ROW
EXECUTE FUNCTION fn_create_alert_on_threshold();


-- =============================================================================
-- TRIGGER 2: Maintain HistoricalAggregation on New Reading
-- Fires AFTER INSERT ON reading.
-- Upserts a row in HistoricalAggregation for the current calendar day so the
-- aggregation table always reflects the latest statistics without a full scan.
-- The unique constraint needed: (measurement_type_id, period, timestamp_range)
--   → In practice enforce via a partial unique index below.
-- =============================================================================

-- Supporting unique index (run once; idempotent with IF NOT EXISTS)
-- We use a functional index on the lower bound of the TSTZRANGE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ha_upsert_key
ON historicalaggregation (measurement_type_id, period,
                           lower(timestamp_range));

CREATE OR REPLACE FUNCTION fn_update_historical_aggregation()
RETURNS TRIGGER AS $$
DECLARE
    v_day_start  TIMESTAMPTZ := DATE_TRUNC('day', NEW.timestamp);
    v_day_end    TIMESTAMPTZ := DATE_TRUNC('day', NEW.timestamp) + INTERVAL '1 day';
    v_range      TSTZRANGE   := TSTZRANGE(v_day_start, v_day_end, '[)');
    v_avg        NUMERIC;
    v_max        NUMERIC;
    v_min        NUMERIC;
BEGIN
    -- Compute fresh stats for this measurement type on the reading's calendar day
    SELECT
        ROUND(AVG(value)::numeric, 4),
        ROUND(MAX(value)::numeric, 4),
        ROUND(MIN(value)::numeric, 4)
    INTO v_avg, v_max, v_min
    FROM reading
    WHERE measurement_type_id = NEW.measurement_type_id
      AND timestamp >= v_day_start
      AND timestamp <  v_day_end;

    -- Upsert into HistoricalAggregation
    INSERT INTO historicalaggregation
        (period, avg_value, max_value, min_value, timestamp_range, measurement_type_id)
    VALUES
        ('Daily', v_avg, v_max, v_min, v_range, NEW.measurement_type_id)
    ON CONFLICT (measurement_type_id, period, lower(timestamp_range))
    DO UPDATE SET
        avg_value = EXCLUDED.avg_value,
        max_value = EXCLUDED.max_value,
        min_value = EXCLUDED.min_value;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_aggregation ON reading;

CREATE TRIGGER trg_update_aggregation
AFTER INSERT ON reading
FOR EACH ROW
EXECUTE FUNCTION fn_update_historical_aggregation();


-- =============================================================================
-- TRIGGER 3: Citizen Report Status Audit Log
-- Fires AFTER UPDATE ON userreport when status_id changes.
-- Writes a NotificationLog entry so analysts can track status transitions;
-- also fires pg_notify so the front-end can refresh the report panel live.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_log_report_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status VARCHAR(50);
    v_new_status VARCHAR(50);
    v_msg        TEXT;
BEGIN
    -- Only proceed if the status actually changed
    IF OLD.status_id = NEW.status_id THEN
        RETURN NEW;
    END IF;

    SELECT status_name INTO v_old_status FROM reportstatus WHERE status_id = OLD.status_id;
    SELECT status_name INTO v_new_status FROM reportstatus WHERE status_id = NEW.status_id;

    v_msg := FORMAT(
        'Report #%s status changed: %s → %s at %s',
        NEW.report_id, v_old_status, v_new_status, NOW()
    );

    -- Log the transition into NotificationLog.
    -- alert_id is nullable in schema → we pass NULL; user_id = report owner.
    INSERT INTO notificationlog (alert_id, user_id, sent_at, method, status)
    VALUES (NULL, NEW.user_id, NOW(), 'System', 'Sent');

    -- Real-time push to front-end via pg_notify
    PERFORM pg_notify(
        'report_status_channel',
        json_build_object(
            'report_id',  NEW.report_id,
            'old_status', v_old_status,
            'new_status', v_new_status
        )::text
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_report_status_audit ON userreport;

CREATE TRIGGER trg_report_status_audit
AFTER UPDATE OF status_id ON userreport
FOR EACH ROW
EXECUTE FUNCTION fn_log_report_status_change();


-- =============================================================================
-- End of triggers.sql
-- =============================================================================
