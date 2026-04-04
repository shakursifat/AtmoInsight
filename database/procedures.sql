-- =============================================================================
-- AtmoInsight Hub — Stored Procedures (PL/pgSQL)
-- Compatible with PostgreSQL 14+ / PostGIS 3.x (Neon Serverless)
--
-- HOW TO APPLY:
--   psql $DATABASE_URL -f database/procedures.sql
--
-- All objects are idempotent: safe to re-run.
--
-- NOTE ON REFCURSOR PROCEDURES (#1, 2, 3, 6):
--   These return data via an OUT REFCURSOR.  You MUST call them inside
--   an explicit transaction so the cursor stays open until you FETCH.
--
--   Example pattern (psql / any client):
--     BEGIN;
--     CALL get_sensor_reading_avg(3, INTERVAL '14 days', 'my_cur');
--     FETCH ALL FROM my_cur;
--     COMMIT;
--
-- =============================================================================


-- =============================================================================
-- PROCEDURE 1: get_sensor_reading_avg
-- Returns the statistical summary (avg / min / max / count / unit) for a
-- single sensor over a configurable time window, one row per measurement type.
--
-- Parameters (IN):
--   p_sensor_id   INTEGER  — sensor_id from the Sensor table
--   p_interval    INTERVAL — look-back window (default: last 30 days)
-- Parameter (OUT):
--   result_cursor REFCURSOR — open cursor; FETCH ALL from it after the CALL
--
-- Example:
--   BEGIN;
--   CALL get_sensor_reading_avg(3, INTERVAL '14 days', 'cur1');
--   FETCH ALL FROM cur1;
--   COMMIT;
-- =============================================================================

CREATE OR REPLACE PROCEDURE get_sensor_reading_avg(
    IN  p_sensor_id    INTEGER,
    IN  p_interval     INTERVAL DEFAULT INTERVAL '30 days',
    OUT result_cursor  REFCURSOR
)
LANGUAGE plpgsql
AS $$
BEGIN
    OPEN result_cursor FOR
    SELECT
        s.name::TEXT                              AS sensor_name,
        l.name::TEXT                              AS location_name,
        mt.type_name::TEXT                        AS measurement_type,
        mu.symbol::TEXT                           AS unit_symbol,
        ROUND(AVG(r.value)::numeric, 2)           AS avg_value,
        ROUND(MIN(r.value)::numeric, 2)           AS min_value,
        ROUND(MAX(r.value)::numeric, 2)           AS max_value,
        COUNT(*)::BIGINT                          AS reading_count,
        (NOW() - p_interval)                      AS from_time,
        NOW()                                     AS to_time
    FROM reading          r
    JOIN sensor           s  ON r.sensor_id           = s.sensor_id
    JOIN location         l  ON s.location_id         = l.location_id
    JOIN measurementtype  mt ON r.measurement_type_id = mt.measurement_type_id
    JOIN measurementunit  mu ON r.unit_id             = mu.unit_id
    WHERE s.sensor_id  = p_sensor_id
      AND r.timestamp >= NOW() - p_interval
    GROUP BY s.name, l.name, mt.type_name, mu.symbol
    ORDER BY reading_count DESC;
END;
$$;


-- =============================================================================
-- PROCEDURE 2: get_location_pollution_report
-- Full multi-pollutant summary for every measurement type recorded at a
-- given location, including threshold breach detection.
-- Useful for the "Location Detail" panel and PDF export.
--
-- Parameters (IN):
--   p_location_id  INTEGER  — location_id from the Location table
--   p_interval     INTERVAL — look-back window (default: last 30 days)
-- Parameter (OUT):
--   result_cursor  REFCURSOR
--
-- Example:
--   BEGIN;
--   CALL get_location_pollution_report(1, INTERVAL '30 days', 'cur2');
--   FETCH ALL FROM cur2;
--   COMMIT;
-- =============================================================================

CREATE OR REPLACE PROCEDURE get_location_pollution_report(
    IN  p_location_id  INTEGER,
    IN  p_interval     INTERVAL DEFAULT INTERVAL '30 days',
    OUT result_cursor  REFCURSOR
)
LANGUAGE plpgsql
AS $$
BEGIN
    OPEN result_cursor FOR
    SELECT
        l.name::TEXT                              AS location_name,
        mt.type_name::TEXT                        AS measurement_type,
        mu.symbol::TEXT                           AS unit_symbol,
        ROUND(AVG(r.value)::numeric, 2)           AS avg_value,
        ROUND(MIN(r.value)::numeric, 2)           AS min_value,
        ROUND(MAX(r.value)::numeric, 2)           AS max_value,
        COUNT(*)::BIGINT                          AS reading_count,
        -- Configured max threshold for this measurement type (if any)
        (SELECT MAX(at2.max_value)
         FROM alertthreshold at2
         WHERE at2.measurement_type_id = mt.measurement_type_id
           AND at2.max_value IS NOT NULL)         AS threshold_max,
        -- Whether the period average exceeds the threshold
        COALESCE(
            ROUND(AVG(r.value)::numeric, 2) >
            (SELECT MAX(at3.max_value)
             FROM alertthreshold at3
             WHERE at3.measurement_type_id = mt.measurement_type_id
               AND at3.max_value IS NOT NULL),
            false
        )                                         AS is_exceeding,
        -- Human-readable severity from the threshold table
        COALESCE(
            (SELECT at4.severity
             FROM alertthreshold at4
             WHERE at4.measurement_type_id = mt.measurement_type_id
               AND at4.max_value IS NOT NULL
             ORDER BY at4.max_value DESC
             LIMIT 1),
            'Normal'
        )                                         AS severity_label
    FROM reading          r
    JOIN sensor           s  ON r.sensor_id           = s.sensor_id
    JOIN location         l  ON s.location_id         = l.location_id
    JOIN measurementtype  mt ON r.measurement_type_id = mt.measurement_type_id
    JOIN measurementunit  mu ON r.unit_id             = mu.unit_id
    WHERE l.location_id = p_location_id
      AND r.timestamp  >= NOW() - p_interval
    GROUP BY l.name, mt.type_name, mu.symbol, mt.measurement_type_id
    ORDER BY avg_value DESC;
END;
$$;


-- =============================================================================
-- PROCEDURE 3: get_daily_graph_data
-- Returns daily aggregated readings for time-series chart rendering.
-- Each row is one calendar day with avg, min, max and count so the front-end
-- can draw a line chart with a shaded confidence band.
-- Rows are ordered oldest → newest (correct for charting libraries).
--
-- Parameters (IN):
--   p_sensor_id   INTEGER  — sensor to query
--   p_type        TEXT     — measurement type name, e.g. 'PM2.5'
--   p_days        INTEGER  — past days to return (default: 30)
-- Parameter (OUT):
--   result_cursor REFCURSOR
--
-- Example:
--   BEGIN;
--   CALL get_daily_graph_data(3, 'PM2.5', 30, 'cur3');
--   FETCH ALL FROM cur3;
--   COMMIT;
-- =============================================================================

CREATE OR REPLACE PROCEDURE get_daily_graph_data(
    IN  p_sensor_id    INTEGER,
    IN  p_type         TEXT,
    IN  p_days         INTEGER DEFAULT 30,
    OUT result_cursor  REFCURSOR
)
LANGUAGE plpgsql
AS $$
BEGIN
    OPEN result_cursor FOR
    SELECT
        DATE_TRUNC('day', r.timestamp)::DATE      AS chart_date,
        ROUND(AVG(r.value)::numeric, 2)           AS avg_value,
        ROUND(MIN(r.value)::numeric, 2)           AS min_value,
        ROUND(MAX(r.value)::numeric, 2)           AS max_value,
        COUNT(*)::BIGINT                          AS reading_count,
        MAX(mu.symbol)::TEXT                      AS unit_symbol
    FROM reading          r
    JOIN measurementtype  mt ON r.measurement_type_id = mt.measurement_type_id
    JOIN measurementunit  mu ON r.unit_id             = mu.unit_id
    WHERE r.sensor_id   = p_sensor_id
      AND mt.type_name  = p_type
      AND r.timestamp  >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY DATE_TRUNC('day', r.timestamp)
    ORDER BY chart_date ASC;
END;
$$;


-- =============================================================================
-- PROCEDURE 4: purge_old_readings  (already a PROCEDURE — unchanged)
-- Admin maintenance: removes readings older than a given age and returns
-- the number of rows deleted.  Supports a safe dry-run mode.
--
-- Parameters:
--   p_older_than  INTERVAL — delete readings older than this (e.g. '1 year')
--   p_dry_run     BOOLEAN  — if TRUE, count only; do NOT delete (default: FALSE)
-- OUT:
--   rows_deleted  BIGINT
--
-- Examples:
--   CALL purge_old_readings(INTERVAL '1 year', false, NULL);
--   CALL purge_old_readings(INTERVAL '6 months', true, NULL);  -- dry-run
-- =============================================================================

CREATE OR REPLACE PROCEDURE purge_old_readings(
    IN  p_older_than  INTERVAL,
    IN  p_dry_run     BOOLEAN DEFAULT FALSE,
    OUT rows_deleted  BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cutoff  TIMESTAMPTZ := NOW() - p_older_than;
BEGIN
    IF p_dry_run THEN
        SELECT COUNT(*) INTO rows_deleted
        FROM reading
        WHERE timestamp < v_cutoff;

        RAISE NOTICE '[purge_old_readings] DRY-RUN: would delete % rows older than % (%)',
            rows_deleted, p_older_than, v_cutoff;
    ELSE
        -- Remove referencing alerts first (FK constraint)
        DELETE FROM alert
        WHERE reading_id IN (
            SELECT reading_id FROM reading WHERE timestamp < v_cutoff
        );

        WITH deleted AS (
            DELETE FROM reading
            WHERE timestamp < v_cutoff
            RETURNING reading_id
        )
        SELECT COUNT(*) INTO rows_deleted FROM deleted;

        RAISE NOTICE '[purge_old_readings] Deleted % readings older than % (%)',
            rows_deleted, p_older_than, v_cutoff;
    END IF;
END;
$$;


-- =============================================================================
-- PROCEDURE 5: refresh_climate_indicators  (already a PROCEDURE — unchanged)
-- Recalculates every ClimateIndicator row from HistoricalAggregation and
-- upserts the result.  Creates a new indicator if none exists yet.
-- Safe to call nightly via pg_cron or after a bulk import.
--
-- Parameters: none
--
-- Example:
--   CALL refresh_climate_indicators();
-- =============================================================================

CREATE OR REPLACE PROCEDURE refresh_climate_indicators()
LANGUAGE plpgsql
AS $$
DECLARE
    v_rec           RECORD;
    v_existing_id   INTEGER;
    v_count         INTEGER := 0;
BEGIN
    FOR v_rec IN
        SELECT
            ha.measurement_type_id,
            mt.type_name,
            ROUND(AVG(ha.avg_value)::numeric, 4)  AS overall_avg,
            (SELECT agg_id
             FROM historicalaggregation ha2
             WHERE ha2.measurement_type_id = ha.measurement_type_id
             ORDER BY lower(ha2.timestamp_range) DESC
             LIMIT 1)                              AS latest_agg_id
        FROM historicalaggregation ha
        JOIN measurementtype mt ON ha.measurement_type_id = mt.measurement_type_id
        GROUP BY ha.measurement_type_id, mt.type_name
    LOOP
        SELECT ci.indicator_id INTO v_existing_id
        FROM climateindicator ci
        JOIN historicalaggregation ha
             ON ci.agg_id = ha.agg_id
        WHERE ha.measurement_type_id = v_rec.measurement_type_id
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            UPDATE climateindicator
            SET value  = v_rec.overall_avg,
                period = 'All-time',
                name   = v_rec.type_name || ' — All-time Average'
            WHERE indicator_id = v_existing_id;
        ELSE
            INSERT INTO climateindicator (name, value, period, agg_id)
            VALUES (
                v_rec.type_name || ' — All-time Average',
                v_rec.overall_avg,
                'All-time',
                v_rec.latest_agg_id
            );
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE '[refresh_climate_indicators] Upserted % climate indicator(s).', v_count;
END;
$$;


-- =============================================================================
-- PROCEDURE 6: get_top_polluted_locations
-- Returns the top N locations ranked by average pollution for a given
-- measurement type over a look-back window.
-- Includes lat/lng so results can feed a map heatmap directly.
--
-- Parameters (IN):
--   p_limit      INTEGER  — number of locations to return (default: 10)
--   p_type       TEXT     — measurement type, e.g. 'PM2.5' (default: 'PM2.5')
--   p_interval   INTERVAL — look-back window (default: last 7 days)
-- Parameter (OUT):
--   result_cursor REFCURSOR
--
-- Example:
--   BEGIN;
--   CALL get_top_polluted_locations(5, 'PM2.5', INTERVAL '7 days', 'cur6');
--   FETCH ALL FROM cur6;
--   COMMIT;
--
--   BEGIN;
--   CALL get_top_polluted_locations(10, 'NO2', INTERVAL '30 days', 'cur6');
--   FETCH ALL FROM cur6;
--   COMMIT;
-- =============================================================================

CREATE OR REPLACE PROCEDURE get_top_polluted_locations(
    IN  p_limit        INTEGER  DEFAULT 10,
    IN  p_type         TEXT     DEFAULT 'PM2.5',
    IN  p_interval     INTERVAL DEFAULT INTERVAL '7 days',
    OUT result_cursor  REFCURSOR
)
LANGUAGE plpgsql
AS $$
BEGIN
    OPEN result_cursor FOR
    SELECT
        ROW_NUMBER() OVER (ORDER BY ROUND(AVG(r.value)::numeric, 2) DESC)::BIGINT AS rank,
        l.location_id::INTEGER,
        l.name::TEXT                              AS location_name,
        l.region::TEXT,
        ROUND(AVG(r.value)::numeric, 2)           AS avg_value,
        ROUND(MAX(r.value)::numeric, 2)           AS max_value,
        COUNT(*)::BIGINT                          AS reading_count,
        MAX(mu.symbol)::TEXT                      AS unit_symbol,
        ST_Y(l.coordinates::geometry)::FLOAT8    AS latitude,
        ST_X(l.coordinates::geometry)::FLOAT8    AS longitude
    FROM reading          r
    JOIN sensor           s  ON r.sensor_id           = s.sensor_id
    JOIN location         l  ON s.location_id         = l.location_id
    JOIN measurementtype  mt ON r.measurement_type_id = mt.measurement_type_id
    JOIN measurementunit  mu ON r.unit_id             = mu.unit_id
    WHERE mt.type_name  = p_type
      AND r.timestamp  >= NOW() - p_interval
      AND l.coordinates IS NOT NULL
    GROUP BY l.location_id, l.name, l.region, l.coordinates
    ORDER BY avg_value DESC
    LIMIT p_limit;
END;
$$;


-- =============================================================================
-- PROCEDURE 7: delete_sensor
-- Deletes a sensor and its associated readings and alerts.
--
-- Parameters:
--   p_sensor_id INTEGER — sensor to delete
--
-- Example:
--   CALL delete_sensor(45);
-- =============================================================================

CREATE OR REPLACE PROCEDURE delete_sensor(
    IN p_sensor_id INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. Delete associated alerts (via reading_id)
    DELETE FROM alert WHERE reading_id IN (
        SELECT reading_id FROM reading WHERE sensor_id = p_sensor_id
    );

    -- 2. Delete associated readings
    DELETE FROM reading WHERE sensor_id = p_sensor_id;

    -- 3. Delete the sensor itself
    DELETE FROM sensor WHERE sensor_id = p_sensor_id;
    
    RAISE NOTICE 'Deleted sensor % and its associated readings/alerts', p_sensor_id;
END;
$$;


-- =============================================================================
-- Quick-test calls (run each block in psql or a transaction-aware client)
-- =============================================================================

-- 1. Sensor reading averages — sensor 3, last 14 days
--    BEGIN;
--    CALL get_sensor_reading_avg(3, INTERVAL '14 days', 'c1');
--    FETCH ALL FROM c1;
--    COMMIT;

-- 2. Full pollution report — location 1, last 30 days
--    BEGIN;
--    CALL get_location_pollution_report(1, INTERVAL '30 days', 'c2');
--    FETCH ALL FROM c2;
--    COMMIT;

-- 3. Daily chart data — sensor 3, PM2.5, last 30 days
--    BEGIN;
--    CALL get_daily_graph_data(3, 'PM2.5', 30, 'c3');
--    FETCH ALL FROM c3;
--    COMMIT;

-- 4. Dry-run purge — preview count, no deletions
--    CALL purge_old_readings(INTERVAL '1 year', true, NULL);

-- 5. Refresh climate indicators from aggregation data
--    CALL refresh_climate_indicators();

-- 6. Top 5 most polluted locations, PM2.5, last 7 days
--    BEGIN;
--    CALL get_top_polluted_locations(5, 'PM2.5', INTERVAL '7 days', 'c6');
--    FETCH ALL FROM c6;
--    COMMIT;

-- =============================================================================
-- End of procedures.sql
-- =============================================================================
