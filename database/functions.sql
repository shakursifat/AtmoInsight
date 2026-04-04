-- =============================================================================
-- AtmoInsight Hub - Stored Functions
-- Compatible with PostgreSQL 14+ / PostGIS 3.x (Neon Serverless)
-- =============================================================================


-- =============================================================================
-- FUNCTION 1: get_pollution_average
-- Returns a summary of the average, min, max, and reading count for a given
-- measurement type at a specific location over a configurable time window.
--
-- Parameters:
--   p_location_id          INTEGER  — location_id from the location table
--   p_measurement_type_name TEXT    — e.g. 'PM2.5', 'Temperature'
--   p_interval             INTERVAL — lookback window, e.g. INTERVAL '7 days'
--
-- Returns: TABLE with avg, min, max, count, unit symbol
--
-- Example call:
--   SELECT * FROM get_pollution_average(1, 'PM2.5', INTERVAL '30 days');
-- =============================================================================

-- CREATE OR REPLACE FUNCTION get_pollution_average(
--     p_location_id           INTEGER,
--     p_measurement_type_name TEXT,
--     p_interval              INTERVAL DEFAULT INTERVAL '7 days'
-- )
-- RETURNS TABLE (
--     location_name   TEXT,
--     measurement     TEXT,
--     unit_symbol     TEXT,
--     avg_value       NUMERIC,
--     min_value       NUMERIC,
--     max_value       NUMERIC,
--     reading_count   BIGINT,
--     from_time       TIMESTAMPTZ,
--     to_time         TIMESTAMPTZ
-- )
-- LANGUAGE plpgsql
-- STABLE
-- AS $$
-- BEGIN
--     RETURN QUERY
--     SELECT
--         l.name::TEXT                              AS location_name,
--         mt.type_name::TEXT                        AS measurement,
--         mu.symbol::TEXT                           AS unit_symbol,
--         ROUND(AVG(r.value)::numeric,  2)          AS avg_value,
--         ROUND(MIN(r.value)::numeric,  2)          AS min_value,
--         ROUND(MAX(r.value)::numeric,  2)          AS max_value,
--         COUNT(*)                                  AS reading_count,
--         (NOW() - p_interval)                      AS from_time,
--         NOW()                                     AS to_time
--     FROM reading          r
--     JOIN sensor           s  ON r.sensor_id            = s.sensor_id
--     JOIN location         l  ON s.location_id          = l.location_id
--     JOIN measurementtype  mt ON r.measurement_type_id  = mt.measurement_type_id
--     JOIN measurementunit  mu ON r.unit_id              = mu.unit_id
--     WHERE l.location_id    = p_location_id
--       AND mt.type_name     = p_measurement_type_name
--       AND r.timestamp     >= NOW() - p_interval
--     GROUP BY l.name, mt.type_name, mu.symbol;

--     -- Return empty row with nulls if no data found (better than silent empty set)
--     IF NOT FOUND THEN
--         RETURN QUERY
--         SELECT
--             (SELECT name FROM location WHERE location_id = p_location_id)::TEXT,
--             p_measurement_type_name::TEXT,
--             NULL::TEXT,
--             NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
--             0::BIGINT,
--             NOW() - p_interval,
--             NOW();
--     END IF;
-- END;
-- $$;


-- =============================================================================
-- FUNCTION 2: get_disaster_impact_summary
-- Returns an aggregated summary of all recorded disaster impacts optionally
-- filtered by disaster subgroup (e.g. 'Hydrological') and/or year.
-- Useful for the "Disasters" analytics panel in the AtmoInsight dashboard.
--
-- Parameters:
--   p_subgroup_name  TEXT    — filter by DisasterSubgroup.subgroup_name, or NULL for all
--   p_year           INTEGER — calendar year filter, or NULL for all years
--
-- Returns: TABLE with aggregated deaths, injuries, economic loss, people affected
--
-- Example calls:
--   SELECT * FROM get_disaster_impact_summary(NULL, NULL);          -- all
--   SELECT * FROM get_disaster_impact_summary('Hydrological', 2025);
-- =============================================================================

CREATE OR REPLACE FUNCTION get_disaster_impact_summary(
    p_subgroup_name TEXT    DEFAULT NULL,
    p_year          INTEGER DEFAULT NULL
)
RETURNS TABLE (
    subgroup           TEXT,
    disaster_type      TEXT,
    event_count        BIGINT,
    total_deaths       BIGINT,
    total_injuries     BIGINT,
    total_affected     BIGINT,
    total_economic_loss NUMERIC,
    avg_severity       TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ds.subgroup_name::TEXT                          AS subgroup,
        dt.type_name::TEXT                              AS disaster_type,
        COUNT(DISTINCT de.event_id)                     AS event_count,
        COALESCE(SUM(di.deaths),           0)::BIGINT   AS total_deaths,
        COALESCE(SUM(di.injuries),         0)::BIGINT   AS total_injuries,
        COALESCE(SUM(di.affected_people),  0)::BIGINT   AS total_affected,
        COALESCE(SUM(di.economic_loss),    0)           AS total_economic_loss,
        -- Most common severity across events in this group
        (MODE() WITHIN GROUP (ORDER BY de.severity))::TEXT  AS avg_severity
    FROM disasterevent    de
    JOIN disastertype     dt  ON de.disaster_type_id = dt.type_id
    JOIN disastersubgroup ds  ON dt.subgroup_id      = ds.subgroup_id
    LEFT JOIN disasterimpact di ON de.event_id       = di.event_id
    WHERE (p_subgroup_name IS NULL OR ds.subgroup_name ILIKE p_subgroup_name)
      AND (p_year          IS NULL OR EXTRACT(YEAR FROM de.start_timestamp) = p_year)
    GROUP BY ds.subgroup_name, dt.type_name
    ORDER BY total_deaths DESC, total_affected DESC
    LIMIT 50;
END;
$$;


-- =============================================================================
-- FUNCTION 3: get_nearby_sensors
-- Returns all sensors within a given radius (metres) of a lon/lat point,
-- along with the latest reading value for a specified measurement type.
-- Leverages PostGIS ST_DWithin for index-accelerated geospatial lookup.
--
-- Parameters:
--   p_longitude      FLOAT8   — WGS-84 longitude (e.g. 90.4074 for Dhaka)
--   p_latitude       FLOAT8   — WGS-84 latitude  (e.g. 23.7104 for Dhaka)
--   p_radius_metres  FLOAT8   — search radius in metres (default 10 000 = 10 km)
--   p_measurement    TEXT     — measurement type to fetch latest reading for,
--                               or NULL to skip reading lookup
--
-- Returns: TABLE with sensor info, distance, and latest reading
--
-- Example call:
--   SELECT * FROM get_nearby_sensors(90.4074, 23.7104, 15000, 'PM2.5');
-- =============================================================================

-- CREATE OR REPLACE PROCEDURE get_nearby_sensors(
--     p_longitude     FLOAT8,
--     p_latitude      FLOAT8,
--     p_radius_metres FLOAT8 DEFAULT 10000,
--     p_measurement   TEXT   DEFAULT NULL,
--     OUT result_cursor REFCURSOR
-- )
-- LANGUAGE plpgsql
-- AS $$
-- DECLARE
--     v_ref_point GEOMETRY := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326);
-- BEGIN
--     OPEN result_cursor FOR
--     SELECT
--         s.sensor_id,
--         s.name::TEXT                                                     AS sensor_name,
--         st.type_name::TEXT                                               AS sensor_type,
--         l.name::TEXT                                                     AS location_name,
--         ROUND(
--             ST_Distance(l.coordinates::geography, v_ref_point::geography)::numeric,
--             1
--         )                                                                AS distance_metres,
--         s.status::TEXT,
--         -- Latest reading for the requested measurement type (subquery)
--         (
--             SELECT ROUND(r.value::numeric, 2)
--             FROM reading r
--             JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
--             WHERE r.sensor_id = s.sensor_id
--               AND (p_measurement IS NULL OR mt.type_name = p_measurement)
--             ORDER BY r.timestamp DESC
--             LIMIT 1
--         )                                                                AS latest_value,
--         (
--             SELECT mu.symbol::TEXT
--             FROM reading r
--             JOIN measurementunit mu ON r.unit_id = mu.unit_id
--             JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
--             WHERE r.sensor_id = s.sensor_id
--               AND (p_measurement IS NULL OR mt.type_name = p_measurement)
--             ORDER BY r.timestamp DESC
--             LIMIT 1
--         )                                                                AS latest_unit,
--         (
--             SELECT r.timestamp
--             FROM reading r
--             JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
--             WHERE r.sensor_id = s.sensor_id
--               AND (p_measurement IS NULL OR mt.type_name = p_measurement)
--             ORDER BY r.timestamp DESC
--             LIMIT 1
--         )                                                                AS latest_timestamp
--     FROM sensor     s
--     JOIN sensortype st ON s.sensor_type_id = st.sensor_type_id
--     JOIN location   l  ON s.location_id    = l.location_id
--     WHERE ST_DWithin(
--         l.coordinates::geography,
--         v_ref_point::geography,
--         p_radius_metres
--     )
--     ORDER BY distance_metres;
-- END;
-- $$;


-- =============================================================================
-- Quick verification — call these after running seed.sql:
-- =============================================================================
-- SELECT * FROM get_pollution_average(1, 'PM2.5', INTERVAL '365 days');
-- SELECT * FROM get_disaster_impact_summary(NULL, NULL);
-- CALL get_nearby_sensors(90.4074, 23.7104, 20000, 'PM2.5', NULL);
-- FETCH ALL FROM "<refcursor>";
-- =============================================================================
-- End of functions.sql
-- =============================================================================
