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
    v_threshold           RECORD;
    v_alert_type          INTEGER;
    v_severity            VARCHAR(20);
    v_message             TEXT;
    v_location_id         INTEGER;
    v_event_id            INTEGER;
    v_mt_name             TEXT;
    v_breach              BOOLEAN;
    v_existing_alert_id   INTEGER;
    v_disaster_type_id    INTEGER;
    v_is_meteo_subgroup   BOOLEAN;
    v_wind                NUMERIC;
    v_pressure            NUMERIC;
    v_precip              NUMERIC;
    v_existing_event_id   INTEGER;
BEGIN
    -- Map measurement type → alert_type (same convention as before)
    SELECT type_name INTO v_mt_name
    FROM measurementtype
    WHERE measurement_type_id = NEW.measurement_type_id;

    -- If no measurement type found, nothing to do
    IF v_mt_name IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if ANY threshold is configured for this measurement type
    -- (unit-aware: unit_id IS NULL means 'applies to all units').
    -- If nothing matches, skip silently — do NOT touch any alerts.
    IF NOT EXISTS (
        SELECT 1 FROM alertthreshold
        WHERE measurement_type_id = NEW.measurement_type_id
          AND (unit_id IS NULL OR unit_id = NEW.unit_id)
    ) THEN
        RETURN NEW;
    END IF;

    -- -------------------------------------------------------------------------
    -- Map measurement type → alert type with explicit priority:
    --   1. Starts-with match  e.g. 'Temperature%' → 'Temperature Alert'
    --   2. Contains match     e.g. '%Wind%'        → 'High Wind'
    --   3. Auto-create a new alert type (never fall back to alert_type_id = 1)
    -- -------------------------------------------------------------------------
    SELECT alert_type_id INTO v_alert_type
    FROM alerttype
    WHERE type_name ILIKE v_mt_name || '%'
    ORDER BY length(type_name) ASC
    LIMIT 1;

    IF v_alert_type IS NULL THEN
        SELECT alert_type_id INTO v_alert_type
        FROM alerttype
        WHERE type_name ILIKE '%' || v_mt_name || '%'
        ORDER BY length(type_name) ASC
        LIMIT 1;
    END IF;

    -- If still no match, create a dedicated alert type on the fly
    IF v_alert_type IS NULL THEN
        INSERT INTO alerttype (type_name, description)
        VALUES (v_mt_name || ' Alert', 'Auto-created alert type for ' || v_mt_name)
        RETURNING alert_type_id INTO v_alert_type;
    END IF;


    -- Any threshold row breached for this measurement + unit combination?
    -- unit_id IS NULL rows act as wildcards and match any unit.
    v_breach := EXISTS (
        SELECT 1 FROM alertthreshold
        WHERE measurement_type_id = NEW.measurement_type_id
          AND (unit_id IS NULL OR unit_id = NEW.unit_id)
          AND (
                (max_value IS NOT NULL AND NEW.value > max_value)
             OR (min_value IS NOT NULL AND NEW.value < min_value)
              )
    );

    -- -------------------------------------------------------------------------
    -- Resolution: reading back within limits → close active alert for this pair
    -- Only resolves alerts for THIS specific measurement type's alert_type.
    -- -------------------------------------------------------------------------
    IF NOT v_breach THEN
        UPDATE alert
        SET is_active = false,
            resolved_at = NOW()
        WHERE sensor_id = NEW.sensor_id
          AND alert_type_id = v_alert_type
          AND is_active = true;
        RETURN NEW;
    END IF;

    -- Pick the most specific breached threshold:
    -- prefer an exact unit_id match over a wildcard (unit_id IS NULL).
    SELECT * INTO v_threshold
    FROM alertthreshold
    WHERE measurement_type_id = NEW.measurement_type_id
      AND (unit_id IS NULL OR unit_id = NEW.unit_id)
      AND (
            (max_value IS NOT NULL AND NEW.value > max_value)
         OR (min_value IS NOT NULL AND NEW.value < min_value)
          )
    ORDER BY
        (unit_id IS NOT NULL) DESC,  -- exact unit match first
        max_value DESC NULLS LAST
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    v_severity := COALESCE(v_threshold.severity, 'Low');
    IF v_threshold.max_value IS NOT NULL AND NEW.value > v_threshold.max_value * 1.5 THEN
        v_severity := 'Critical';
    END IF;

    -- Fetch location name and unit symbol for the message
    DECLARE
        v_loc_name TEXT;
        v_unit_sym TEXT;
    BEGIN
        SELECT l.name INTO v_loc_name 
        FROM sensor s JOIN location l ON s.location_id = l.location_id 
        WHERE s.sensor_id = NEW.sensor_id;
        
        SELECT symbol INTO v_unit_sym FROM measurementunit WHERE unit_id = NEW.unit_id;

        v_message := FORMAT(
            'In %s this %s crossed the max limit %s %s',
            COALESCE(v_loc_name, 'Unknown'),
            v_mt_name,
            COALESCE(v_threshold.max_value::text, v_threshold.min_value::text),
            COALESCE(v_unit_sym, '')
        );
    END;

    -- -------------------------------------------------------------------------
    -- Deduplicate: one active alert per (sensor_id, alert_type_id)
    -- -------------------------------------------------------------------------
    SELECT alert_id INTO v_existing_alert_id
    FROM alert
    WHERE sensor_id = NEW.sensor_id
      AND alert_type_id = v_alert_type
      AND is_active = true
    LIMIT 1;

    IF v_existing_alert_id IS NOT NULL THEN
        UPDATE alert
        SET last_triggered_at = NOW(),
            reading_id = NEW.reading_id,
            message = v_message,
            severity = v_severity
        WHERE alert_id = v_existing_alert_id;
    ELSE
        INSERT INTO alert (
            reading_id, alert_type_id, message, timestamp, severity,
            sensor_id, is_active, last_triggered_at
        )
        VALUES (
            NEW.reading_id, v_alert_type, v_message, NOW(), v_severity,
            NEW.sensor_id, true, NOW()
        );
    END IF;

    PERFORM pg_notify('new_alert_channel', NEW.reading_id::text);

    -- -------------------------------------------------------------------------
    -- Critical → classified disaster (merge within 48h at same location + type)
    -- -------------------------------------------------------------------------
    IF v_severity <> 'Critical' THEN
        RETURN NEW;
    END IF;

    SELECT location_id INTO v_location_id
    FROM sensor
    WHERE sensor_id = NEW.sensor_id;

    IF v_location_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_disaster_type_id := CASE
        WHEN v_mt_name ILIKE '%wind%' OR v_mt_name ILIKE '%pressure%' THEN 1
        WHEN v_mt_name ILIKE '%temp%' OR v_mt_name ILIKE '%heat%' THEN 2
        WHEN v_mt_name ILIKE '%water%' OR v_mt_name ILIKE '%level%' THEN 5
        ELSE NULL
    END;

    IF v_disaster_type_id IS NULL THEN
        RETURN NEW;
    END IF;

    DECLARE
        v_dt_name TEXT;
    BEGIN
        SELECT type_name INTO v_dt_name FROM disastertype WHERE type_id = v_disaster_type_id;

        SELECT EXISTS (
            SELECT 1 FROM disastertype dt
            WHERE dt.type_id = v_disaster_type_id
              AND dt.subgroup_id = (
                  SELECT subgroup_id FROM disastersubgroup
                  WHERE subgroup_name = 'Meteorological'
              )
        ) INTO v_is_meteo_subgroup;

        IF v_mt_name ILIKE '%wind%' THEN
            v_wind := NEW.value;
        ELSIF v_mt_name ILIKE '%pressure%' THEN
            v_pressure := NEW.value;
        ELSIF v_mt_name ILIKE '%precip%' OR v_mt_name ILIKE '%rain%' THEN
            v_precip := NEW.value;
        END IF;

        SELECT de.event_id INTO v_existing_event_id
        FROM disasterevent de
        WHERE de.disaster_type_id = v_disaster_type_id
          AND de.location_id = v_location_id
          AND (
                de.start_timestamp >= NOW() - INTERVAL '48 hours'
             OR COALESCE(de.end_timestamp, de.start_timestamp) >= NOW() - INTERVAL '48 hours'
              )
        ORDER BY de.start_timestamp DESC
        LIMIT 1;

        IF v_existing_event_id IS NOT NULL THEN
            UPDATE disasterevent
            SET end_timestamp = NOW(),
                severity = 'EXTREME',
                description = FORMAT(
                    'Ongoing %s (updated): %s reached critical level %s %s at %s.',
                    v_dt_name, v_mt_name, NEW.value, COALESCE(v_unit_sym, ''), COALESCE(v_loc_name, 'Unknown location')
                )
            WHERE event_id = v_existing_event_id;

            IF v_is_meteo_subgroup THEN
                IF EXISTS (SELECT 1 FROM meteorologicalevent WHERE event_id = v_existing_event_id) THEN
                    UPDATE meteorologicalevent
                    SET wind_speed = CASE
                            WHEN v_wind IS NOT NULL THEN GREATEST(COALESCE(wind_speed, v_wind), v_wind)
                            ELSE wind_speed
                        END,
                        pressure = CASE
                            WHEN v_pressure IS NOT NULL THEN LEAST(COALESCE(pressure, v_pressure), v_pressure)
                            ELSE pressure
                        END,
                        precipitation = CASE
                            WHEN v_precip IS NOT NULL THEN GREATEST(COALESCE(precipitation, v_precip), v_precip)
                            ELSE precipitation
                        END
                    WHERE event_id = v_existing_event_id;
                ELSE
                    INSERT INTO meteorologicalevent (event_id, wind_speed, pressure, precipitation, description)
                    VALUES (
                        v_existing_event_id,
                        v_wind, v_pressure, v_precip,
                        FORMAT('Meteorological detail for ongoing %s.', v_dt_name)
                    );
                END IF;
            END IF;

            PERFORM pg_notify('new_disaster_channel', v_existing_event_id::text);
        ELSE
            INSERT INTO disasterevent (
                disaster_type_id, start_timestamp, end_timestamp, severity, description, location_id
            )
            VALUES (
                v_disaster_type_id,
                NOW(),
                NOW(),
                'EXTREME',
                FORMAT('Critical Alert triggered %s: %s crossed critical threshold (%s %s) at %s.',
                       v_dt_name, v_mt_name, NEW.value, COALESCE(v_unit_sym, ''), COALESCE(v_loc_name, 'Unknown location')),
                v_location_id
            )
            RETURNING event_id INTO v_event_id;

            IF v_is_meteo_subgroup THEN
                INSERT INTO meteorologicalevent (event_id, wind_speed, pressure, precipitation, description)
                VALUES (
                    v_event_id,
                    v_wind, v_pressure, v_precip,
                    FORMAT('Meteorological detail for %s.', v_dt_name)
                );
            END IF;

            PERFORM pg_notify('new_disaster_channel', v_event_id::text);
        END IF;
    END;

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
