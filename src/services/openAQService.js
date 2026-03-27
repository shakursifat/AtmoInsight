const pool = require('../db/pool');

const OPENAQ_MEASUREMENT_TYPES = {
    'pm25': 'PM2.5',
    'pm10': 'PM10',
    'no2': 'NO2',
    'co': 'CO',
    'o3': 'O3',
    'so2': 'SO2'
};

/**
 * Ensures the measurement type exists in the database.
 */
async function getOrCreateMeasurementType(typeName, description) {
    let res = await pool.query('SELECT measurement_type_id FROM MeasurementType WHERE type_name = $1', [typeName]);
    if (res.rows.length > 0) return res.rows[0].measurement_type_id;

    // Resync sequence safely before insert for educational database consistency
    await pool.query(`SELECT setval(pg_get_serial_sequence('measurementtype', 'measurement_type_id'), COALESCE((SELECT MAX(measurement_type_id) FROM MeasurementType), 0) + 1, false);`);

    res = await pool.query(
        'INSERT INTO MeasurementType (type_name, description) VALUES ($1, $2) RETURNING measurement_type_id',
        [typeName, description]
    );
    return res.rows[0].measurement_type_id;
}

/**
 * Fetches current real-world global air quality measurements from OpenAQ.
 * Maps components appropriately to existing MeasurementTypes and bulk inserts non-duplicated readings.
 */
async function fetchAndStoreOpenAQData() {
    try {
        console.log('Starting OpenAQ air quality update...');

        // Pre-fetch or create measurement types
        const typeIds = {};
        for (const [key, typeName] of Object.entries(OPENAQ_MEASUREMENT_TYPES)) {
            typeIds[key] = await getOrCreateMeasurementType(typeName, `Auto-generated for OpenAQ: ${typeName}`);
        }

        // Fetch all locations with coordinates
        const locationRes = await pool.query(`
            SELECT location_id, name,
                   ST_X(coordinates::geometry) AS longitude,
                   ST_Y(coordinates::geometry) AS latitude
            FROM Location
            WHERE coordinates IS NOT NULL
        `);

        if (locationRes.rows.length === 0) {
            console.log('No locations with coordinates found.');
            return { status: 'success', message: 'No locations found with coordinates' };
        }

        let totalReadingsInserted = 0;

        for (const location of locationRes.rows) {
            if (!location.latitude || !location.longitude) continue;

            const { location_id, latitude, longitude } = location;

            // Find an existing sensor for this location
            const sensorRes = await pool.query('SELECT sensor_id FROM Sensor WHERE location_id = $1 LIMIT 1', [location_id]);
            if (sensorRes.rows.length === 0) {
                console.log(`No sensor found for location ${location_id} (${location.name}). Skipping OpenAQ fetch.`);
                continue;
            }
            const sensorId = sensorRes.rows[0].sensor_id;

            // Fetch locations from OpenAQ v3 API within a 25km radius
            const url = `https://api.openaq.org/v3/locations?coordinates=${latitude},${longitude}&radius=25000&limit=1`;
            const apiKey = process.env.OPENAQ_API_KEY;
            
            if (!apiKey) {
                console.error('OPENAQ_API_KEY missing in .env');
                return { status: 'error', message: 'OPENAQ_API_KEY is required for OpenAQ API v3. Please add it to your environment variables.' };
            }

            const response = await fetch(url, {
                headers: { 'X-API-Key': apiKey }
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    return { status: 'error', message: 'Unauthorized API Key for OpenAQ' };
                }
                console.error(`Failed to fetch OpenAQ for location ${location_id}. Status: ${response.status}`);
                continue;
            }

            const data = await response.json();
            if (!data.results || data.results.length === 0) {
                console.log(`No OpenAQ sensors found near location ${location_id}.`);
                continue;
            }

            // OpenAQ v3 encapsulates parameters within a sensors array on each location
            const aqSensors = data.results[0].sensors;
            if (!aqSensors || aqSensors.length === 0) continue;
            
            // Build arrays for parameterized bulk insertion 
            const sensorIds = [];
            const timestamps = [];
            const values = [];
            const measurementTypeIds = [];

            for (const s of aqSensors) {
                const param = s.parameter ? s.parameter.name.toLowerCase() : null; // e.g. 'pm25'
                if (!param || !s.latest) continue;

                const value = s.latest.value;
                const timestampStr = s.latest.datetime;
                
                if (OPENAQ_MEASUREMENT_TYPES[param] && value !== undefined && value !== null) {
                    const ts = new Date(timestampStr || Date.now()).toISOString();
                    sensorIds.push(sensorId);
                    timestamps.push(ts);
                    values.push(value);
                    measurementTypeIds.push(typeIds[param]);
                }
            }

            // Execute the Parameterized Bulk Insert using array unnesting safely
            if (sensorIds.length > 0) {
                const bulkInsertQuery = `
                    INSERT INTO Reading (sensor_id, timestamp, value, measurement_type_id)
                    SELECT u.sensor_id, u.timestamp, u.value, u.measurement_type_id
                    FROM UNNEST($1::int[], $2::timestamptz[], $3::numeric[], $4::int[]) 
                        AS u(sensor_id, timestamp, value, measurement_type_id)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM Reading r 
                        WHERE r.sensor_id = u.sensor_id 
                          AND r.timestamp = u.timestamp 
                          AND r.measurement_type_id = u.measurement_type_id
                    )
                    RETURNING reading_id;
                `;
                
                try {
                    const insertResult = await pool.query(bulkInsertQuery, [
                        sensorIds, 
                        timestamps, 
                        values, 
                        measurementTypeIds
                    ]);
                    totalReadingsInserted += insertResult.rowCount;
                } catch (insertError) {
                    console.error(`Failed to bulk insert OpenAQ readings for location ${location_id}`, insertError.message);
                }
            }
        }

        console.log(`Successfully finished OpenAQ update. Inserted ${totalReadingsInserted} new readings.`);
        return { status: 'success', message: `Inserted ${totalReadingsInserted} new readings.` };

    } catch (error) {
        console.error('Error fetching and storing OpenAQ data:', error);
        return { status: 'error', message: error.message };
    }
}

module.exports = { fetchAndStoreOpenAQData };
