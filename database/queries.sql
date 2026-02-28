-- =============================================================================
-- AtmoInsight Hub - Example Analytical Queries
-- Compatible with PostgreSQL 14+ / PostGIS 3.x (Neon Serverless)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Q1. TIME-SERIES: Daily average PM2.5 readings per sensor
-- Groups readings into calendar-day buckets using date_trunc.
-- -----------------------------------------------------------------------------
SELECT
    s.name                                         AS sensor_name,
    l.name                                         AS location_name,
    DATE_TRUNC('day', r.timestamp)                 AS reading_day,
    ROUND(AVG(r.value)::numeric, 2)                AS avg_pm25,
    ROUND(MIN(r.value)::numeric, 2)                AS min_pm25,
    ROUND(MAX(r.value)::numeric, 2)                AS max_pm25,
    COUNT(*)                                       AS reading_count
FROM reading r
JOIN sensor  s ON r.sensor_id          = s.sensor_id
JOIN location l ON s.location_id       = l.location_id
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
WHERE mt.type_name = 'PM2.5'
GROUP BY s.name, l.name, DATE_TRUNC('day', r.timestamp)
ORDER BY reading_day DESC, avg_pm25 DESC;


-- -----------------------------------------------------------------------------
-- Q2. GEOSPATIAL: Sensors within 15 km of Dhaka city centre (23.7104 N, 90.4074 E)
-- Uses PostGIS ST_DWithin with ::geography cast for metre-accurate distance.
-- -----------------------------------------------------------------------------
SELECT
    s.sensor_id,
    s.name                                                          AS sensor_name,
    st.type_name                                                    AS sensor_type,
    l.name                                                          AS location_name,
    l.region,
    ROUND(
        ST_Distance(
            l.coordinates::geography,
            ST_MakePoint(90.4074, 23.7104)::geography
        )::numeric / 1000,
        2
    )                                                               AS distance_km,
    s.status
FROM sensor   s
JOIN sensortype st ON s.sensor_type_id  = st.sensor_type_id
JOIN location   l  ON s.location_id     = l.location_id
WHERE ST_DWithin(
    l.coordinates::geography,
    ST_MakePoint(90.4074, 23.7104)::geography,
    15000          -- 15 000 metres = 15 km radius
)
ORDER BY distance_km;


-- -----------------------------------------------------------------------------
-- Q3. ALERT SUMMARY: Active alerts joined with reading, sensor, and alert type
-- Gives a full picture of what triggered each alert and from where.
-- -----------------------------------------------------------------------------
SELECT
    a.alert_id,
    a.severity,
    a.timestamp                                    AS alert_time,
    at2.type_name                                  AS alert_type,
    a.message,
    r.value                                        AS trigger_value,
    r.timestamp                                    AS reading_time,
    mt.type_name                                   AS measurement,
    mu.symbol                                      AS unit,
    s.name                                         AS sensor_name,
    l.name                                         AS location_name
FROM alert        a
JOIN alerttype   at2 ON a.alert_type_id         = at2.alert_type_id
JOIN reading       r  ON a.reading_id            = r.reading_id
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
JOIN measurementunit mu ON r.unit_id             = mu.unit_id
JOIN sensor        s  ON r.sensor_id             = s.sensor_id
JOIN location      l  ON s.location_id           = l.location_id
ORDER BY a.timestamp DESC;


-- -----------------------------------------------------------------------------
-- Q4. TREND ANALYSIS: Monthly PM2.5 averages across all sensors (last 12 months)
-- Useful for trend charts in the AtmoInsight dashboard front-end.
-- -----------------------------------------------------------------------------
SELECT
    DATE_TRUNC('month', r.timestamp)               AS month,
    l.region,
    ROUND(AVG(r.value)::numeric, 2)                AS avg_pm25,
    COUNT(*)                                       AS reading_count,
    -- WHO 24h guideline is 75 µg/m³; flag months that are above
    CASE WHEN AVG(r.value) > 75 THEN 'EXCEEDS WHO LIMIT' ELSE 'WITHIN LIMIT' END AS who_status
FROM reading      r
JOIN sensor        s  ON r.sensor_id            = s.sensor_id
JOIN location      l  ON s.location_id          = l.location_id
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
WHERE mt.type_name  = 'PM2.5'
  AND r.timestamp  >= NOW() - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', r.timestamp), l.region
ORDER BY month DESC, avg_pm25 DESC;


-- -----------------------------------------------------------------------------
-- Q5. DISASTER OVERVIEW: All events with full impact summary and geolocation
-- Joins DisasterEvent → DisasterType → DisasterSubgroup → DisasterImpact → Location
-- -----------------------------------------------------------------------------
SELECT
    de.event_id,
    ds.subgroup_name                               AS disaster_category,
    dt.type_name                                   AS disaster_type,
    de.severity,
    de.start_timestamp,
    de.end_timestamp,
    EXTRACT(EPOCH FROM (de.end_timestamp - de.start_timestamp)) / 3600
                                                   AS duration_hours,
    l.name                                         AS location_name,
    l.region,
    di.deaths,
    di.injuries,
    di.affected_people,
    TO_CHAR(di.economic_loss, 'FM$999,999,999.00') AS economic_loss_usd,
    de.description
FROM disasterevent  de
JOIN disastertype   dt  ON de.disaster_type_id = dt.type_id
JOIN disastersubgroup ds ON dt.subgroup_id     = ds.subgroup_id
JOIN location        l  ON de.location_id      = l.location_id
LEFT JOIN disasterimpact di ON de.event_id     = di.event_id
ORDER BY de.start_timestamp DESC;


-- -----------------------------------------------------------------------------
-- Q6. CITIZEN REPORT DASHBOARD: Reports with location, status, and reporter info
-- Shows all open/in-progress reports for analyst triage.
-- -----------------------------------------------------------------------------
SELECT
    ur.report_id,
    u.username,
    u.email,
    l.name                                         AS location_name,
    l.region,
    rs.status_name                                 AS status,
    ur.timestamp                                   AS reported_at,
    ur.description
FROM userreport   ur
JOIN users         u  ON ur.user_id     = u.user_id
JOIN location      l  ON ur.location_id = l.location_id
JOIN reportstatus  rs ON ur.status_id   = rs.status_id
WHERE rs.status_name IN ('Open', 'In Progress')
ORDER BY ur.timestamp DESC;


-- -----------------------------------------------------------------------------
-- Q7. FORECAST + WEATHER MODEL: Upcoming high-probability forecasts (>60 %)
-- Useful for the forecast panel in the AtmoInsight front-end map view.
-- -----------------------------------------------------------------------------
SELECT
    f.forecast_id,
    wm.model_name,
    wm.source                                      AS model_source,
    f.predicted_timestamp,
    ROUND(f.probability * 100, 1)                  AS probability_pct,
    l.name                                         AS location_name,
    l.region,
    f.description
FROM forecast      f
JOIN weathermodel  wm ON f.weather_model_id = wm.model_id
JOIN location      l  ON f.location_id      = l.location_id
WHERE f.probability > 0.60
  AND f.predicted_timestamp > NOW()
ORDER BY f.probability DESC, f.predicted_timestamp;


-- -----------------------------------------------------------------------------
-- Q8. SATELLITE ↔ READING CORRELATION: AOD vs ground PM2.5 for same day
-- Joins SatelliteObservation to the corresponding ground-truth Reading.
-- The data_json column is queried using the ->> JSONB operator.
-- -----------------------------------------------------------------------------
SELECT
    so.obs_id,
    so.timestamp                                   AS satellite_obs_time,
    so.resolution,
    so.data_json ->> 'satellite'                   AS satellite_name,
    (so.data_json ->> 'aod')::numeric              AS aerosol_optical_depth,
    r.value                                        AS ground_pm25,
    r.timestamp                                    AS ground_reading_time,
    s.name                                         AS sensor_name,
    l.name                                         AS location_name
FROM satelliteobservation so
JOIN reading r ON so.reading_id          = r.reading_id
JOIN sensor  s ON r.sensor_id            = s.sensor_id
JOIN location l ON s.location_id         = l.location_id
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
WHERE mt.type_name = 'PM2.5'
  AND so.data_json ? 'aod'               -- only rows with AOD field
ORDER BY so.timestamp;


-- -----------------------------------------------------------------------------
-- Q9. NOTIFICATION AUDIT: Delivery success rates per alert and method
-- Shows which notifications succeeded/failed — useful for ops monitoring.
-- -----------------------------------------------------------------------------
SELECT
    a.alert_id,
    at2.type_name                                  AS alert_type,
    a.severity,
    nl.method,
    COUNT(*)                                       AS total_sent,
    SUM(CASE WHEN nl.status = 'Sent'   THEN 1 ELSE 0 END) AS delivered,
    SUM(CASE WHEN nl.status = 'Failed' THEN 1 ELSE 0 END) AS failed,
    ROUND(
        100.0 * SUM(CASE WHEN nl.status = 'Sent' THEN 1 ELSE 0 END) / COUNT(*),
        1
    )                                              AS delivery_rate_pct
FROM notificationlog nl
JOIN alert  a   ON nl.alert_id      = a.alert_id
JOIN alerttype at2 ON a.alert_type_id = at2.alert_type_id
GROUP BY a.alert_id, at2.type_name, a.severity, nl.method
ORDER BY a.alert_id, nl.method;


-- -----------------------------------------------------------------------------
-- Q10. CLIMATE INDICATOR REPORT: Indicators tied to historical aggregation periods
-- Joins ClimateIndicator → HistoricalAggregation → MeasurementType for context.
-- -----------------------------------------------------------------------------
SELECT
    ci.indicator_id,
    ci.name                                        AS indicator_name,
    ci.value,
    ci.period,
    mt.type_name                                   AS measurement_type,
    ha.avg_value                                   AS period_avg,
    ha.max_value                                   AS period_max,
    ha.min_value                                   AS period_min,
    ha.timestamp_range                             AS aggregation_window
FROM climateindicator     ci
JOIN historicalaggregation ha ON ci.agg_id                  = ha.agg_id
JOIN measurementtype       mt ON ha.measurement_type_id     = mt.measurement_type_id
ORDER BY ci.period;

-- =============================================================================
-- End of example queries
-- =============================================================================
