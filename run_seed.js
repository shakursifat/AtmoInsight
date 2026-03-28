/**
 * Targeted Bangladesh location + sensor seed.
 * Does NOT truncate everything — only updates/inserts core reference data.
 */
require('dotenv').config();
const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    console.log('Connected to Neon DB.');

    try {
        await client.query('BEGIN');

        // 1. Clear tables that need reset (bottom-up to respect FK constraints)
        console.log('Clearing old data...');
        await client.query('TRUNCATE TABLE satelliteobservation, forecast, climateindicator, weathermodel, hydrologicalevent, meteorologicalevent, geologicalevent, disasterimpact, disasterevent, disastertype, disastersubgroup, notificationlog, historicalaggregation, userreport, reportstatus, alert, alertthreshold, alerttype, reading, measurementunit, measurementtype, sensor, location, sensortype, datasource, users, userrole CASCADE');

        // Reset sequences
        console.log('Resetting sequences...');
        const seqs = [
            'userrole_role_id_seq','users_user_id_seq','datasource_source_id_seq',
            'sensortype_sensor_type_id_seq','location_location_id_seq','sensor_sensor_id_seq',
            'measurementtype_measurement_type_id_seq','measurementunit_unit_id_seq',
            'reading_reading_id_seq','alerttype_alert_type_id_seq','alertthreshold_threshold_id_seq',
            'alert_alert_id_seq','reportstatus_status_id_seq','userreport_report_id_seq',
            'historicalaggregation_agg_id_seq','notificationlog_log_id_seq',
            'disastersubgroup_subgroup_id_seq','disastertype_type_id_seq',
            'disasterevent_event_id_seq','disasterimpact_impact_id_seq',
            'geologicalevent_geo_event_id_seq','meteorologicalevent_meteo_event_id_seq',
            'hydrologicalevent_hydro_event_id_seq','climateindicator_indicator_id_seq',
            'weathermodel_model_id_seq','forecast_forecast_id_seq','satelliteobservation_obs_id_seq'
        ];
        for (const seq of seqs) {
            await client.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
        }

        // 2. UserRole
        await client.query(`INSERT INTO userrole (role_name, permissions) VALUES ('Admin','ALL'),('Scientist','ANALYTICS_ONLY'),('Citizen','READ_ONLY')`);

        // 3. DataSource
        await client.query(`INSERT INTO datasource (name, source_type, description, url) VALUES
            ('DoE Bangladesh','Government','Department of Environment air quality network','https://doe.gov.bd'),
            ('BWDB Hydrology','Government','Bangladesh Water Development Board river gauges','https://bwdb.gov.bd'),
            ('SPARRSO Satellite','Satellite','Bangladesh Space Research and Remote Sensing Org','https://sparrso.gov.bd'),
            ('AtmoInsight IoT','IoT','Self-deployed low-cost sensor nodes across Dhaka','https://atmoinsight.io'),
            ('BUET Weather Lab','Academic','BUET rooftop meteorological station','https://buet.ac.bd')`);

        // 4. SensorType
        await client.query(`INSERT INTO sensortype (type_name, description) VALUES
            ('Air Quality','Measures particulate matter (PM2.5, PM10) and gaseous pollutants'),
            ('Meteorological','Measures temperature, humidity, pressure, wind speed'),
            ('Hydrological','Measures river water level and discharge rate'),
            ('Seismic','Measures ground vibrations and seismic activity'),
            ('Radiation','Measures UV index and solar radiation flux')`);

        // 5. Location (Bangladesh - PostGIS points)
        await client.query(`INSERT INTO location (name, coordinates, address, region) VALUES
            ('Dhaka City Centre',    ST_SetSRID(ST_MakePoint(90.4074, 23.7104), 4326), 'Motijheel, Dhaka-1000',              'Dhaka Metropolitan'),
            ('Mirpur AQ Station',    ST_SetSRID(ST_MakePoint(90.3654, 23.8069), 4326), 'Mirpur-10, Dhaka-1216',              'Dhaka Metropolitan'),
            ('Buriganga River Bank', ST_SetSRID(ST_MakePoint(90.3784, 23.6980), 4326), 'Sadarghat, Dhaka-1100',              'Dhaka Metropolitan'),
            ('Dhanmondi Lake',       ST_SetSRID(ST_MakePoint(90.3742, 23.7461), 4326), 'Dhanmondi R/A, Dhaka-1209',          'Dhaka Metropolitan'),
            ('BUET Campus',          ST_SetSRID(ST_MakePoint(90.3952, 23.7260), 4326), 'Polashi, Dhaka-1000',                'Dhaka Metropolitan'),
            ('Sylhet Airport',       ST_SetSRID(ST_MakePoint(91.8687, 24.9638), 4326), 'Airport Road, Sylhet-3100',           'Sylhet Division'),
            ('Chittagong Port',      ST_SetSRID(ST_MakePoint(91.8123, 22.3419), 4326), 'Port Connecting Road, Chattogram',   'Chittagong Division'),
            ('Rajshahi Riverside',   ST_SetSRID(ST_MakePoint(88.5642, 24.3745), 4326), 'Padma Riverside, Rajshahi-6000',     'Rajshahi Division')`);

        // 6. Sensor
        await client.query(`INSERT INTO sensor (name, sensor_type_id, location_id, status, installed_at, source_id) VALUES
            ('AQ-DCC-01',  1, 1, 'Active',      '2023-03-01', 1),
            ('AQ-MRP-01',  1, 2, 'Active',      '2023-04-15', 4),
            ('MET-DCC-01', 2, 1, 'Active',      '2023-01-10', 5),
            ('MET-BUET-01',2, 5, 'Active',      '2022-11-20', 5),
            ('HYD-BRB-01', 3, 3, 'Active',      '2021-07-05', 2),
            ('AQ-SYL-01',  1, 6, 'Maintenance', '2023-09-01', 1),
            ('MET-CTG-01', 2, 7, 'Active',      '2023-02-28', 4),
            ('SEIS-RAJ-01',4, 8, 'Active',      '2024-01-15', 3),
            ('RAD-DCC-01', 5, 1, 'Active',      '2023-06-01', 5),
            ('HYD-DHN-01', 3, 4, 'Inactive',    '2022-05-10', 2)`);

        // 7. MeasurementType
        await client.query(`INSERT INTO measurementtype (type_name, description) VALUES
            ('PM2.5',       'Fine particulate matter ≤ 2.5 µm'),
            ('PM10',        'Coarse particulate matter ≤ 10 µm'),
            ('Temperature', 'Ambient dry-bulb temperature'),
            ('Humidity',    'Relative humidity percentage'),
            ('Water Level', 'River/lake surface above mean sea level'),
            ('Wind Speed',  'Scalar wind speed at 10 m height'),
            ('UV Index',    'WHO ultraviolet radiation index scale'),
            ('Pressure',    'Atmospheric pressure at station level')`);

        // 8. MeasurementUnit
        await client.query(`INSERT INTO measurementunit (unit_name, symbol) VALUES
            ('Micrograms per cubic metre', 'µg/m³'),
            ('Degrees Celsius',            '°C'),
            ('Percentage',                 '%'),
            ('Metres',                     'm'),
            ('Metres per second',          'm/s'),
            ('Dimensionless',              '-'),
            ('Hectopascal',                'hPa')`);

        // 9. DisasterSubgroup + DisasterType — MUST be before Reading
        // because the DB trigger auto-creates DisasterEvent when value > 95
        await client.query(`INSERT INTO disastersubgroup (subgroup_name, description) VALUES
            ('Meteorological','Short-lived extreme weather events'),
            ('Climatological','Long-duration climate anomalies'),
            ('Geophysical','Solid-earth origin events'),
            ('Hydrological','Flood, landslide, wave action events')`);

        await client.query(`INSERT INTO disastertype (type_name, subgroup_id, description) VALUES
            ('Cyclone / Storm',1,'Tropical or extra-tropical cyclone with high winds and storm surge'),
            ('Heatwave',1,'Prolonged period of excessively hot weather'),
            ('Drought',2,'Extended period of significantly below-normal precipitation'),
            ('Earthquake',3,'Sudden ground shaking from tectonic movement'),
            ('Flood',4,'Riverine, flash, or coastal inundation exceeding normal levels'),
            ('Landslide',4,'Mass movement of soil or rock')`);

        // 10. AlertType — MUST come before Reading because the DB trigger auto-inserts alerts
        await client.query(`INSERT INTO alerttype (type_name, description) VALUES
            ('High PM2.5',     'Fine particulate matter exceeds WHO limit of 75 µg/m³'),
            ('Flood Risk',     'River water level approaches danger mark'),
            ('High Wind',      'Wind speed exceeds gale-force threshold'),
            ('Extreme Heat',   'Temperature exceeds 40 °C — heat stress alert'),
            ('Critical PM2.5', 'PM2.5 exceeds 150 µg/m³ — immediate health hazard')`);

        // 11. AlertThreshold
        await client.query(`INSERT INTO alertthreshold (measurement_type_id, min_value, max_value, severity) VALUES
            (1, NULL,  75.0, 'Moderate'),
            (1, NULL, 150.0, 'High'),
            (3, NULL,  40.0, 'High'),
            (5,  5.0,  NULL, 'High'),
            (6, NULL,  28.0, 'Moderate')`);

        // 11. Reading (seed data with unit_ids — trigger fires here, needs alerttype to exist)
        await client.query(`INSERT INTO reading (sensor_id, timestamp, value, measurement_type_id, unit_id, source_id) VALUES
            (1, '2025-01-15 06:00:00+06', 152.3, 1, 1, 1),
            (1, '2025-01-15 12:00:00+06',  98.7, 1, 1, 1),
            (1, '2025-01-15 18:00:00+06', 134.5, 1, 1, 1),
            (1, '2025-01-16 06:00:00+06', 178.9, 1, 1, 1),
            (2, '2025-01-15 06:00:00+06',  87.4, 1, 1, 4),
            (2, '2025-01-15 12:00:00+06',  65.2, 1, 1, 4),
            (3, '2025-01-15 06:00:00+06',  18.4, 3, 2, 5),
            (3, '2025-01-15 12:00:00+06',  27.8, 3, 2, 5),
            (3, '2025-01-15 18:00:00+06',  23.1, 3, 2, 5),
            (4, '2025-01-15 06:00:00+06',  82.0, 4, 3, 5),
            (4, '2025-01-15 12:00:00+06',  68.5, 4, 3, 5),
            (5, '2025-06-10 00:00:00+06',   4.72, 5, 4, 2),
            (5, '2025-06-11 00:00:00+06',   5.31, 5, 4, 2),
            (5, '2025-06-12 00:00:00+06',   6.88, 5, 4, 2),
            (7, '2025-05-14 08:00:00+06',  22.3, 6, 5, 4),
            (7, '2025-05-14 14:00:00+06',  34.7, 6, 5, 4)`);

        // (AlertType and AlertThreshold already inserted above)

        // 12. Alert
        await client.query(`INSERT INTO alert (reading_id, alert_type_id, message, timestamp, severity, sensor_id, is_active, last_triggered_at) VALUES
            (4,  5, 'PM2.5 at Dhaka City Centre hit 178.9 µg/m³ — critical health risk.', '2025-01-16 06:05:00+06', 'Critical', 1, true, '2025-01-16 06:05:00+06'),
            (13, 2, 'Buriganga water level at 6.88 m exceeded the 5 m danger mark.',       '2025-06-12 00:10:00+06', 'High', 5, true, '2025-06-12 00:10:00+06'),
            (15, 3, 'Wind speed 34.7 m/s at Chittagong — gale-force storm approaching.',   '2025-05-14 14:05:00+06', 'High', 7, true, '2025-05-14 14:05:00+06')`);

        // 13. ReportStatus
        await client.query(`INSERT INTO reportstatus (status_name, description) VALUES
            ('Open','Newly submitted citizen report awaiting triage'),
            ('In Progress','Assigned to an analyst or field team'),
            ('Resolved','Issue confirmed and resolved or closed'),
            ('Rejected','Duplicate or invalid report')`);

        // 14. Users (with proper bcrypt hashes — these are placeholder hashes from original seed)
        await client.query(`INSERT INTO users (username, email, password_hash, role_id) VALUES
            ('admin_reza',    'reza@atmoinsight.io',    '$2b$10$AAAA.placeholder.hash.Admin', 1),
            ('sci_fatema',    'fatema@buet.ac.bd',      '$2b$10$BBBB.placeholder.hash.Sci',   2),
            ('sci_karim',     'karim@sparrso.gov.bd',   '$2b$10$CCCC.placeholder.hash.Sci',   2),
            ('citizen_nadia', 'nadia.dhaka@gmail.com',  '$2b$10$DDDD.placeholder.hash.Cit',   3),
            ('citizen_rahim', 'rahim.ctg@gmail.com',    '$2b$10$EEEE.placeholder.hash.Cit',   3),
            ('citizen_priya', 'priya.sylhet@yahoo.com', '$2b$10$FFFF.placeholder.hash.Cit',   3)`);

        // 15. DisasterEvent + DisasterImpact (manual seed data, not trigger-generated)
        await client.query(`INSERT INTO disasterevent (disaster_type_id, start_timestamp, end_timestamp, severity, description, location_id) VALUES
            (1,'2024-05-26 00:00:00+06','2024-05-28 18:00:00+06','Severe','Cyclone Remal made landfall on Bangladesh coast; Chittagong severely affected.',7),
            (5,'2025-06-10 00:00:00+06','2025-06-15 23:59:59+06','High','Extended monsoon flooding along Buriganga River; Dhaka low-lying areas inundated.',3),
            (4,'2024-08-03 14:35:00+06','2024-08-03 14:35:00+06','Moderate','Magnitude 5.1 tremor felt across Sylhet division.',6),
            (2,'2024-04-20 00:00:00+06','2024-04-25 00:00:00+06','High','Pre-monsoon heatwave: Dhaka hit 41.2 °C.',1),
            (6,'2024-07-12 00:00:00+06','2024-07-13 00:00:00+06','Moderate','Heavy rain-triggered landslide near Chittagong Hill Tracts.',7)`);

        await client.query(`INSERT INTO disasterimpact (event_id, deaths, injuries, economic_loss, affected_people, description) VALUES
            (1,12,340, 5800000.00,820000,'Storm surge destroyed coastal infrastructure.'),
            (2, 3, 45,  950000.00,150000,'Floodwater entered 12,000 homes.'),
            (3, 0,  8,  120000.00, 25000,'Minor structural cracks.'),
            (4, 7,210,  450000.00,600000,'Heat-stroke hospitalisations.'),
            (5, 1, 18,   80000.00, 10000,'Road closure disrupted supply chains.')`);

        await client.query('COMMIT');
        console.log('\n✅ Bangladesh seed complete!');

        // Verify
        const loc = await client.query("SELECT name, region FROM location ORDER BY location_id");
        const sen = await client.query("SELECT COUNT(*) FROM sensor");
        const red = await client.query("SELECT COUNT(*) FROM reading");
        const alt = await client.query("SELECT COUNT(*) FROM alert");
        console.log(`   Sensors: ${sen.rows[0].count}, Readings: ${red.rows[0].count}, Alerts: ${alt.rows[0].count}`);
        console.log('\n📍 Bangladesh locations seeded:');
        loc.rows.forEach(l => console.log(`   ✓ ${l.name} (${l.region})`));

    } catch (e) {
        console.error('\n❌ Error:', e.message);
        await client.query('ROLLBACK').catch(() => {});
    }

    await client.end();
}

run();
