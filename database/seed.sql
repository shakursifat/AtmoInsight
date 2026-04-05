-- =============================================================================
-- AtmoInsight Hub - Demo Seed Data
-- Realistic dummy data for Dhaka, Bangladesh locations
-- Run AFTER schema.sql. Safe to re-run (uses ON CONFLICT / TRUNCATE).
-- =============================================================================

-- =============================================================================
-- 0. RESET (idempotent dev helper)
-- =============================================================================
TRUNCATE TABLE
  satelliteobservation, forecast, climateindicator, weathermodel,
  hydrologicalevent, meteorologicalevent, geologicalevent,
  disasterimpact, disasterevent, disastertype, disastersubgroup,
  notificationlog, historicalaggregation,
  userreport, reportstatus,
  alert, alertthreshold, alerttype,
  reading, measurementunit, measurementtype,
  sensor, location, sensortype,
  datasource, users, userrole
CASCADE;

-- Reset sequences so IDs start from 1
ALTER SEQUENCE userrole_role_id_seq RESTART WITH 1;
ALTER SEQUENCE users_user_id_seq RESTART WITH 1;
ALTER SEQUENCE datasource_source_id_seq RESTART WITH 1;
ALTER SEQUENCE sensortype_sensor_type_id_seq RESTART WITH 1;
ALTER SEQUENCE location_location_id_seq RESTART WITH 1;
ALTER SEQUENCE sensor_sensor_id_seq RESTART WITH 1;
ALTER SEQUENCE measurementtype_measurement_type_id_seq RESTART WITH 1;
ALTER SEQUENCE measurementunit_unit_id_seq RESTART WITH 1;
ALTER SEQUENCE reading_reading_id_seq RESTART WITH 1;
ALTER SEQUENCE alerttype_alert_type_id_seq RESTART WITH 1;
ALTER SEQUENCE alertthreshold_threshold_id_seq RESTART WITH 1;
ALTER SEQUENCE alert_alert_id_seq RESTART WITH 1;
ALTER SEQUENCE reportstatus_status_id_seq RESTART WITH 1;
ALTER SEQUENCE userreport_report_id_seq RESTART WITH 1;
ALTER SEQUENCE historicalaggregation_agg_id_seq RESTART WITH 1;
ALTER SEQUENCE notificationlog_log_id_seq RESTART WITH 1;
ALTER SEQUENCE disastersubgroup_subgroup_id_seq RESTART WITH 1;
ALTER SEQUENCE disastertype_type_id_seq RESTART WITH 1;
ALTER SEQUENCE disasterevent_event_id_seq RESTART WITH 1;
ALTER SEQUENCE disasterimpact_impact_id_seq RESTART WITH 1;
ALTER SEQUENCE geologicalevent_geo_event_id_seq RESTART WITH 1;
ALTER SEQUENCE meteorologicalevent_meteo_event_id_seq RESTART WITH 1;
ALTER SEQUENCE hydrologicalevent_hydro_event_id_seq RESTART WITH 1;
ALTER SEQUENCE climateindicator_indicator_id_seq RESTART WITH 1;
ALTER SEQUENCE weathermodel_model_id_seq RESTART WITH 1;
ALTER SEQUENCE forecast_forecast_id_seq RESTART WITH 1;
ALTER SEQUENCE satelliteobservation_obs_id_seq RESTART WITH 1;

-- =============================================================================
-- 1. UserRole (no dependencies)
-- =============================================================================
INSERT INTO userrole (role_name, permissions) VALUES
  ('Admin',      'ALL'),
  ('Scientist',  'ANALYTICS_ONLY'),
  ('Citizen',    'READ_ONLY');

-- =============================================================================
-- 2. DataSource (no dependencies)
-- =============================================================================
INSERT INTO datasource (name, source_type, description, url) VALUES
  ('DoE Bangladesh',   'Government',   'Department of Environment air quality network',       'https://doe.gov.bd'),
  ('BWDB Hydrology',   'Government',   'Bangladesh Water Development Board river gauges',     'https://bwdb.gov.bd'),
  ('SPARRSO Satellite','Satellite',    'Bangladesh Space Research and Remote Sensing Org',    'https://sparrso.gov.bd'),
  ('AtmoInsight IoT',  'IoT',          'Self-deployed low-cost sensor nodes across Dhaka',   'https://atmoinsight.io'),
  ('BUET Weather Lab', 'Academic',     'BUET rooftop meteorological station',                'https://buet.ac.bd');

-- =============================================================================
-- 3. SensorType (no dependencies)
-- =============================================================================
INSERT INTO sensortype (type_name, description) VALUES
  ('Air Quality',     'Measures particulate matter (PM2.5, PM10) and gaseous pollutants'),
  ('Meteorological',  'Measures temperature, humidity, pressure, wind speed'),
  ('Hydrological',    'Measures river water level and discharge rate'),
  ('Seismic',         'Measures ground vibrations and seismic activity'),
  ('Radiation',       'Measures UV index and solar radiation flux');

-- =============================================================================
-- 4. Location (PostGIS points — Dhaka & surroundings, SRID 4326)
-- =============================================================================
INSERT INTO location (name, coordinates, address, region) VALUES
  ('Dhaka City Centre',   ST_SetSRID(ST_MakePoint(90.4074, 23.7104), 4326), 'Motijheel, Dhaka-1000',             'Dhaka Metropolitan'),
  ('Mirpur AQ Station',   ST_SetSRID(ST_MakePoint(90.3654, 23.8069), 4326), 'Mirpur-10, Dhaka-1216',             'Dhaka Metropolitan'),
  ('Buriganga River Bank', ST_SetSRID(ST_MakePoint(90.3784, 23.6980), 4326), 'Sadarghat, Dhaka-1100',            'Dhaka Metropolitan'),
  ('Dhanmondi Lake',      ST_SetSRID(ST_MakePoint(90.3742, 23.7461), 4326), 'Dhanmondi R/A, Dhaka-1209',         'Dhaka Metropolitan'),
  ('BUET Campus',         ST_SetSRID(ST_MakePoint(90.3952, 23.7260), 4326), 'Polashi, Dhaka-1000',               'Dhaka Metropolitan'),
  ('Sylhet Airport',      ST_SetSRID(ST_MakePoint(91.8687, 24.9638), 4326), 'Airport Road, Sylhet-3100',         'Sylhet Division'),
  ('Chittagong Port',     ST_SetSRID(ST_MakePoint(91.8123, 22.3419), 4326), 'Port Connecting Road, Chattogram',  'Chittagong Division'),
  ('Rajshahi Riverside',  ST_SetSRID(ST_MakePoint(88.5642, 24.3745), 4326), 'Padma Riverside, Rajshahi-6000',    'Rajshahi Division');

-- =============================================================================
-- 5. Sensor (depends on: SensorType, Location, DataSource)
-- =============================================================================
INSERT INTO sensor (name, sensor_type_id, location_id, status, installed_at, source_id) VALUES
  ('AQ-DCC-01',  1, 1, 'Active',       '2023-03-01', 1),  -- Air quality at city centre
  ('AQ-MRP-01',  1, 2, 'Active',       '2023-04-15', 4),  -- Air quality at Mirpur
  ('MET-DCC-01', 2, 1, 'Active',       '2023-01-10', 5),  -- Met station at city centre
  ('MET-BUET-01',2, 5, 'Active',       '2022-11-20', 5),  -- BUET rooftop met
  ('HYD-BRB-01', 3, 3, 'Active',       '2021-07-05', 2),  -- Buriganga river gauge
  ('AQ-SYL-01',  1, 6, 'Maintenance',  '2023-09-01', 1),  -- Sylhet air quality
  ('MET-CTG-01', 2, 7, 'Active',       '2023-02-28', 4),  -- Chittagong met
  ('SEIS-RAJ-01',4, 8, 'Active',       '2024-01-15', 3),  -- Rajshahi seismic
  ('RAD-DCC-01', 5, 1, 'Active',       '2023-06-01', 5),  -- Dhaka UV index
  ('HYD-DHN-01', 3, 4, 'Inactive',     '2022-05-10', 2);  -- Dhanmondi lake level

-- =============================================================================
-- 6. MeasurementType (no dependencies)
-- =============================================================================
INSERT INTO measurementtype (type_name, description) VALUES
  ('PM2.5',       'Fine particulate matter ≤ 2.5 µm — primary air quality metric'),
  ('PM10',        'Coarse particulate matter ≤ 10 µm'),
  ('Temperature', 'Ambient dry-bulb temperature'),
  ('Humidity',    'Relative humidity percentage'),
  ('Water Level', 'River/lake surface above mean sea level'),
  ('Wind Speed',  'Scalar wind speed at 10 m height'),
  ('UV Index',    'WHO ultraviolet radiation index scale'),
  ('Pressure',    'Atmospheric pressure at station level');

-- =============================================================================
-- 7. MeasurementUnit (no dependencies)
-- =============================================================================
INSERT INTO measurementunit (unit_name, symbol) VALUES
  ('Micrograms per cubic metre', 'µg/m³'),
  ('Degrees Celsius',            '°C'),
  ('Percentage',                 '%'),
  ('Metres',                     'm'),
  ('Metres per second',          'm/s'),
  ('Dimensionless',              '-'),
  ('Hectopascal',                'hPa');

-- =============================================================================
-- 8. Reading (depends on: Sensor, MeasurementType, MeasurementUnit, DataSource)
-- PM2.5 readings from AQ-DCC-01 & AQ-MRP-01; temperature from MET-DCC-01;
-- water level from HYD-BRB-01; wind speed from MET-CTG-01
-- =============================================================================
INSERT INTO reading (sensor_id, timestamp, value, measurement_type_id, unit_id, source_id) VALUES
  -- PM2.5 at city centre (sensor 1, mtype 1, unit 1)
  (1, '2025-01-15 06:00:00+06', 152.3, 1, 1, 1),
  (1, '2025-01-15 12:00:00+06',  98.7, 1, 1, 1),
  (1, '2025-01-15 18:00:00+06', 134.5, 1, 1, 1),
  (1, '2025-01-16 06:00:00+06', 178.9, 1, 1, 1),  -- exceeds threshold → alert
  -- PM2.5 at Mirpur (sensor 2, mtype 1, unit 1)
  (2, '2025-01-15 06:00:00+06',  87.4, 1, 1, 4),
  (2, '2025-01-15 12:00:00+06',  65.2, 1, 1, 4),
  -- Temperature at city centre (sensor 3, mtype 3, unit 2)
  (3, '2025-01-15 06:00:00+06',  18.4, 3, 2, 5),
  (3, '2025-01-15 12:00:00+06',  27.8, 3, 2, 5),
  (3, '2025-01-15 18:00:00+06',  23.1, 3, 2, 5),
  -- Humidity at BUET (sensor 4, mtype 4, unit 3)
  (4, '2025-01-15 06:00:00+06',  82.0, 4, 3, 5),
  (4, '2025-01-15 12:00:00+06',  68.5, 4, 3, 5),
  -- Water level at Buriganga (sensor 5, mtype 5, unit 4)
  (5, '2025-06-10 00:00:00+06',   4.72, 5, 4, 2),
  (5, '2025-06-11 00:00:00+06',   5.31, 5, 4, 2),  -- flood threshold exceeded
  (5, '2025-06-12 00:00:00+06',   6.88, 5, 4, 2),
  -- Wind speed at Chittagong (sensor 7, mtype 6, unit 5)
  (7, '2025-05-14 08:00:00+06',  22.3, 6, 5, 4),
  (7, '2025-05-14 14:00:00+06',  34.7, 6, 5, 4);

-- =============================================================================
-- 9. AlertType (no dependencies)
-- =============================================================================
INSERT INTO alerttype (type_name, description) VALUES
  ('High PM2.5',       'Fine particulate matter concentration exceeds safe WHO limit of 75 µg/m³'),
  ('Flood Risk',       'River water level approaches or exceeds danger mark'),
  ('High Wind',        'Wind speed exceeds gale-force threshold at coastal stations'),
  ('Extreme Heat',     'Temperature exceeds 40 °C — heat stress alert'),
  ('Critical PM2.5',   'PM2.5 exceeds 150 µg/m³ — immediate health hazard');

-- =============================================================================
-- 10. AlertThreshold (depends on: MeasurementType, MeasurementUnit)
--     Calibrated to Bangladesh / IQAir real-world values so alerts fire
--     readily in demos. IQAir typically reports AQI ~130-155, Temp ~28-32°C.
--
--     unit_id reference (from MeasurementUnit seed):
--       1 = µg/m³   (Micrograms per cubic metre)
--       2 = °C       (Degrees Celsius)
--       3 = %        (Percentage)
--       4 = m        (Metres)
--       5 = m/s      (Metres per second)
--       6 = -        (Dimensionless — UV Index, AQI)
--       7 = hPa      (Hectopascal)
--     NULL = wildcard — applies to all units for this measurement type
-- =============================================================================
INSERT INTO alertthreshold (measurement_type_id, unit_id, min_value, max_value, severity) VALUES
  -- PM2.5 (µg/m³, unit_id=1) — WHO 24h guideline 15; below real IQAir values
  (1,  1,   NULL,  25.0,  'Moderate'),   -- WHO daily guideline — frequently exceeded
  (1,  1,   NULL, 100.0,  'High'),       -- Unhealthy level

  -- AQI (dimensionless, unit_id=6) — IQAir Bangladesh ~130-155
  (10, 6,   NULL, 100.0,  'Moderate'),   -- Moderate AQI
  (10, 6,   NULL, 150.0,  'High'),       -- Unhealthy AQI

  -- Temperature (°C, unit_id=2) — Bangladesh averages ~28-32°C
  -- unit-specific: a °F reading of 80°F (=26.7°C) will NOT falsely trigger
  (3,  2,   NULL,  27.0,  'Moderate'),   -- Warm — fires on most IQAir readings
  (3,  2,   NULL,  35.0,  'High'),       -- Heat stress threshold
  (3,  2,   10.0,  NULL,  'Low'),        -- Cold alert (winter minimum)

  -- Humidity (%, unit_id=3) — Bangladesh typically 50-70%
  (4,  3,   NULL,  80.0,  'Moderate'),   -- High humidity discomfort
  (4,  3,   20.0,  NULL,  'Low'),        -- Very dry condition alert

  -- Wind Speed (m/s, unit_id=5)
  (6,  5,   NULL,   8.0,  'Moderate'),   -- Strong breeze
  (6,  5,   NULL,  20.0,  'High'),       -- Gale-force

  -- Pressure (hPa, unit_id=7) — normal range 1005-1015
  (8,  7,  990.0,  NULL,  'High'),       -- Low pressure / storm risk
  (8,  7,   NULL, 1025.0, 'Low'),        -- High pressure stagnation

  -- Water Level (m, unit_id=4) — flood danger mark
  (5,  4,    5.0,  NULL,  'High'),       -- Flood danger mark

  -- UV Index (dimensionless, unit_id=6)
  (7,  6,   NULL,   6.0,  'Moderate'),   -- High UV
  (7,  6,   NULL,  11.0,  'High'),       -- Extreme UV

  -- PM10 (µg/m³, unit_id=1)
  (2,  1,   NULL,  50.0,  'Moderate'),   -- WHO 24h guideline
  (2,  1,   NULL, 150.0,  'High'),       -- Very poor air quality

  -- NO2, O3, CO, SO2, Dew Point — unit may vary by API source; use NULL wildcard
  -- NO2 (µg/m³ typically)
  (9,  NULL, NULL,  40.0,  'Moderate'),  -- WHO annual guideline
  (9,  NULL, NULL, 200.0,  'High'),      -- Hourly alert level

  -- O3 / Ozone
  (13, NULL, NULL, 100.0,  'Moderate'),
  (13, NULL, NULL, 180.0,  'High'),

  -- CO / Carbon Monoxide
  (12, NULL, NULL,   4.0,  'Moderate'),
  (12, NULL, NULL,  10.0,  'High'),

  -- SO2
  (14, NULL, NULL,  20.0,  'Moderate'),
  (14, NULL, NULL, 500.0,  'High'),

  -- Dew Point (°C, unit_id=2)
  (11, 2,    NULL,  24.0,  'Moderate'),  -- Uncomfortable humidity index
  (11, 2,    NULL,  28.0,  'High');      -- Very oppressive


-- =============================================================================
-- 11. Alert (depends on: Reading, AlertType)
-- Manual alerts matching seed readings that exceeded thresholds
-- =============================================================================
INSERT INTO alert (reading_id, alert_type_id, message, timestamp, severity, sensor_id, is_active, last_triggered_at) VALUES
  (4,  5, 'PM2.5 at Dhaka City Centre hit 178.9 µg/m³ — critical health risk.', '2025-01-16 06:05:00+06', 'Critical', 1, true, '2025-01-16 06:05:00+06'),
  (13, 2, 'Buriganga water level at 6.88 m exceeded the 5 m danger mark.',       '2025-06-12 00:10:00+06', 'High', 5, true, '2025-06-12 00:10:00+06'),
  (16, 3, 'Wind speed 34.7 m/s at Chittagong — gale-force storm approaching.',   '2025-05-14 14:05:00+06', 'High', 7, true, '2025-05-14 14:05:00+06');

-- =============================================================================
-- 12. ReportStatus (no dependencies)
-- =============================================================================
INSERT INTO reportstatus (status_name, description) VALUES
  ('Open',        'Newly submitted citizen report awaiting triage'),
  ('In Progress', 'Assigned to an analyst or field team'),
  ('Resolved',    'Issue confirmed and resolved or closed'),
  ('Rejected',    'Duplicate or invalid report');

-- =============================================================================
-- 13. Users (depends on: UserRole)
-- Passwords are placeholder bcrypt hashes (never use in production)
-- =============================================================================
INSERT INTO users (username, email, password_hash, role_id) VALUES
  ('admin_reza',    'reza@atmoinsight.io',     '$2b$10$AAAA.placeholder.hash.Admin', 1),
  ('sci_fatema',    'fatema@buet.ac.bd',       '$2b$10$BBBB.placeholder.hash.Sci',   2),
  ('sci_karim',     'karim@sparrso.gov.bd',    '$2b$10$CCCC.placeholder.hash.Sci',   2),
  ('citizen_nadia', 'nadia.dhaka@gmail.com',   '$2b$10$DDDD.placeholder.hash.Cit',   3),
  ('citizen_rahim', 'rahim.ctg@gmail.com',     '$2b$10$EEEE.placeholder.hash.Cit',   3),
  ('citizen_priya', 'priya.sylhet@yahoo.com',  '$2b$10$FFFF.placeholder.hash.Cit',   3);

-- =============================================================================
-- 14. UserReport (depends on: Users, Location, ReportStatus)
-- =============================================================================
INSERT INTO userreport (user_id, description, location_id, timestamp, status_id) VALUES
  (4, 'Thick smog visible near Motijheel — eyes burning, visibility < 200 m.',   1, '2025-01-16 08:30:00+06', 2),
  (5, 'Strong chemical smell coming from Buriganga riverbank near Sadarghat.',    3, '2025-03-22 15:00:00+06', 1),
  (6, 'Suspected illegal burning in open field near Sylhet Airport perimeter.',   6, '2025-02-10 11:45:00+06', 3),
  (4, 'Flooding encroaching on Dhanmondi road after heavy monsoon rain.',         4, '2025-06-12 07:00:00+06', 2),
  (5, 'Unusually high tide — water lapping onto the Sadarghat launch terminal.',  3, '2025-06-13 10:15:00+06', 1);

-- =============================================================================
-- 15. HistoricalAggregation (depends on: MeasurementType)
-- =============================================================================
INSERT INTO historicalaggregation (period, avg_value, max_value, min_value, timestamp_range, measurement_type_id) VALUES
  ('Daily',   141.1, 178.9,  87.4, '[2025-01-15 00:00:00+06, 2025-01-16 23:59:59+06]', 1),  -- PM2.5 Jan 15-16
  ('Daily',    23.1,  27.8,  18.4, '[2025-01-15 00:00:00+06, 2025-01-15 23:59:59+06]', 3),  -- Temperature Jan 15
  ('Monthly', 125.3, 198.4,  42.1, '[2025-01-01 00:00:00+06, 2025-01-31 23:59:59+06]', 1),  -- PM2.5 January
  ('Daily',     5.6,   6.88,  4.72,'[2025-06-10 00:00:00+06, 2025-06-12 23:59:59+06]', 5),  -- Water level Jun
  ('Monthly',  26.0,  34.7,  10.2, '[2025-05-01 00:00:00+06, 2025-05-31 23:59:59+06]', 6);  -- Wind May

-- =============================================================================
-- 16. NotificationLog (depends on: Alert, Users)
-- =============================================================================
INSERT INTO notificationlog (alert_id, user_id, sent_at, method, status) VALUES
  (1, 1, '2025-01-16 06:06:00+06', 'Email',     'Sent'),
  (1, 2, '2025-01-16 06:06:30+06', 'Push',      'Sent'),
  (2, 1, '2025-06-12 00:11:00+06', 'SMS',       'Sent'),
  (2, 3, '2025-06-12 00:11:30+06', 'Email',     'Failed'),
  (3, 1, '2025-05-14 14:06:00+06', 'Push',      'Sent');

-- =============================================================================
-- 17. DisasterSubgroup (no dependencies)
-- =============================================================================
INSERT INTO disastersubgroup (subgroup_name, description) VALUES
  ('Meteorological', 'Short-lived extreme weather events (storms, heatwaves).'),
  ('Climatological', 'Long-duration climate anomalies (drought, wildfire).'),
  ('Geophysical',    'Solid-earth origin events (earthquake, volcanic activity).'),
  ('Hydrological',   'Flood, landslide, wave action events.');

-- =============================================================================
-- 18. DisasterType (depends on: DisasterSubgroup)
-- =============================================================================
INSERT INTO disastertype (type_name, subgroup_id, description) VALUES
  ('Cyclone / Storm',     1, 'Tropical or extra-tropical cyclone with high winds and storm surge.'),
  ('Heatwave',            1, 'Prolonged period of excessively hot weather.'),
  ('Drought',             2, 'Extended period of significantly below-normal precipitation.'),
  ('Earthquake',          3, 'Sudden ground shaking from tectonic movement.'),
  ('Flood',               4, 'Riverine, flash, or coastal inundation exceeding normal levels.'),
  ('Landslide',           4, 'Mass movement of soil or rock triggered by rainfall or quake.');

-- =============================================================================
-- 19. DisasterEvent (depends on: DisasterType, Location)
-- =============================================================================
INSERT INTO disasterevent (disaster_type_id, start_timestamp, end_timestamp, severity, description, location_id) VALUES
  (1, '2024-05-26 00:00:00+06', '2024-05-28 18:00:00+06', 'Severe',
     'Cyclone Remal made landfall on Bangladesh coast; Chittagong severely affected.', 7),
  (5, '2025-06-10 00:00:00+06', '2025-06-15 23:59:59+06', 'High',
     'Extended monsoon flooding along Buriganga River; Dhaka low-lying areas inundated.', 3),
  (4, '2024-08-03 14:35:00+06', '2024-08-03 14:35:00+06', 'Moderate',
     'Magnitude 5.1 tremor felt across Sylhet division — no major structural damage.', 6),
  (2, '2024-04-20 00:00:00+06', '2024-04-25 00:00:00+06', 'High',
     'Pre-monsoon heatwave: Dhaka hit 41.2 °C, multiple heat-related hospitalisations.', 1),
  (6, '2024-07-12 00:00:00+06', '2024-07-13 00:00:00+06', 'Moderate',
     'Heavy rain-triggered landslide near Chittagong Hill Tracts; road blocked.', 7);

-- =============================================================================
-- 20. DisasterImpact (depends on: DisasterEvent)
-- =============================================================================
INSERT INTO disasterimpact (event_id, deaths, injuries, economic_loss, affected_people, description) VALUES
  (1, 12, 340,  5800000.00, 820000, 'Storm surge destroyed coastal infrastructure; fishing boats lost.'),
  (2,  3,  45,   950000.00, 150000, 'Floodwater entered 12,000 homes; crop damage in peri-urban areas.'),
  (3,  0,   8,    120000.00,  25000, 'Minor structural cracks; panic-induced injuries during evacuation.'),
  (4,  7, 210,   450000.00, 600000, 'Heat-stroke hospitalisations; power grid overloaded.'),
  (5,  1,  18,    80000.00,  10000, 'Road closure disrupted supply chains; one fatality during evacuation.');

-- =============================================================================
-- 21. GeologicalEvent (depends on: DisasterEvent)
-- Linked to the Sylhet earthquake (event_id = 3)
-- =============================================================================
INSERT INTO geologicalevent (event_id, magnitude, depth, epicenter, description) VALUES
  (3, 5.1, 12.5, ST_SetSRID(ST_MakePoint(91.8500, 24.9200), 4326),
   'Shallow crustal earthquake at ~12 km depth beneath Sylhet fold belt.');

-- =============================================================================
-- 22. MeteorologicalEvent (depends on: DisasterEvent)
-- Linked to Cyclone Remal (event_id = 1)
-- =============================================================================
INSERT INTO meteorologicalevent (event_id, wind_speed, pressure, precipitation, description) VALUES
  (1, 42.5, 963.0, 285.0, 'Sustained winds 42.5 m/s; central pressure 963 hPa; 285 mm rainfall over 48 h.'),
  (4, 10.2, 996.0,   2.0, 'Heatwave: very low wind, near-record low humidity, minimal cloud cover.');

-- =============================================================================
-- 23. HydrologicalEvent (depends on: DisasterEvent)
-- Linked to Buriganga flood (event_id = 2)
-- =============================================================================
INSERT INTO hydrologicalevent (event_id, water_level, discharge_rate, flood_extent,
                               affected_area_location, description) VALUES
  (2, 6.88, 1850.0, 48500.0,
   ST_SetSRID(
     ST_MakePolygon(ST_GeomFromText(
       'LINESTRING(90.370 23.700, 90.395 23.700, 90.395 23.720, 90.370 23.720, 90.370 23.700)'
     )),
     4326
   ),
   'Flood extent ~48.5 km²; discharge 1850 m³/s at Sadarghat gauge.');

-- =============================================================================
-- 24. ClimateIndicator (depends on: HistoricalAggregation)
-- =============================================================================
INSERT INTO climateindicator (name, value, period, agg_id) VALUES
  ('Annual PM2.5 Mean',             125.3, '2025-Annual',   3),
  ('Bangladesh Temperature Anomaly', +1.4, '2024-Annual',   2),
  ('Monsoon Rainfall Departure',    -12.3, '2024-Monsoon',  4),
  ('Urban Heat Island Intensity',     3.1, '2025-Summer',   2),
  ('Flood Frequency Index',           2.8, '2025-Decadal',  4);

-- =============================================================================
-- 25. WeatherModel (no dependencies)
-- =============================================================================
INSERT INTO weathermodel (model_name, source, description) VALUES
  ('GFS',         'NOAA/NCEP',       'Global Forecast System — 25 km resolution, 16-day horizon.'),
  ('ECMWF-IFS',   'ECMWF',           'Integrated Forecasting System — 9 km NWP, gold standard.'),
  ('BMD-WRF',     'BMD Bangladesh',  'Bangladesh Met Department regional WRF configuration.'),
  ('CFS v2',      'NOAA/NCEP',       'Climate Forecast System v2 — seasonal 9-month outlook.');

-- =============================================================================
-- 26. Forecast (depends on: WeatherModel, Location)
-- =============================================================================
INSERT INTO forecast (weather_model_id, predicted_timestamp, probability, description, location_id) VALUES
  (3, '2025-06-13 00:00:00+06', 0.88, '88 % chance of continued heavy rain — flood risk extreme.',              3),
  (1, '2025-05-15 00:00:00+06', 0.72, '72 % probability: tropical depression intensification over Bay of Bengal.',7),
  (2, '2025-01-17 00:00:00+06', 0.65, 'PM2.5 forecast: 110–145 µg/m³ under calm northerly winds.',             1),
  (4, '2025-10-01 00:00:00+06', 0.55, 'Seasonal outlook: above-normal monsoon withdrawal; late flooding likely.',4),
  (3, '2025-07-04 00:00:00+06', 0.80, 'Heavy rainfall advisory for Sylhet: 120 mm+ expected in 24 h.',          6);

-- =============================================================================
-- 27. SatelliteObservation (depends on: Reading)
-- =============================================================================
INSERT INTO satelliteobservation (timestamp, resolution, orbit_type, data_json, reading_id) VALUES
  ('2025-01-15 10:30:00+06', '500m',  'Polar', '{"satellite":"Terra MODIS","aod":0.72,"cloud_cover_pct":15,"band":"Red-Blue"}',     1),
  ('2025-01-16 10:45:00+06', '500m',  'Polar', '{"satellite":"Aqua MODIS","aod":0.91,"cloud_cover_pct":8, "band":"Red-Blue"}',      4),
  ('2025-06-12 09:00:00+06', '250m',  'Polar', '{"satellite":"Sentinel-2","flood_extent_km2":48.5,"ndwi":0.62,"band":"NIR-SWIR"}', 13),
  ('2025-05-14 12:00:00+06', '1km',   'Geostationary','{"satellite":"Himawari-9","cloud_top_temp":-72,"cyclone_radius_km":320}',   15),
  ('2025-01-15 04:30:00+00', '3km',   'Polar', '{"satellite":"NOAA-20 VIIRS","nightfire_detections":0,"smoke_plume":false}',        2);

-- =============================================================================
-- End of seed data — all 25 tables populated.
-- =============================================================================
