const pool = require('../db/pool');

const MEASUREMENT_TYPES = {
    'temperature_2m': 'Temperature',
    'relative_humidity_2m': 'Humidity',
    'surface_pressure': 'Pressure',
    'wind_speed_10m': 'Wind Speed',
    'dew_point_2m': 'Dew Point'
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
 * Fetches current weather and 7-day hourly forecast from Open-Meteo
 * and securely bulk-inserts the data into the Reading table without duplicates.
 */
async function fetchAndStoreWeatherData() {
    try {
        console.log('Starting Open-Meteo weather update (Current + 7-Day Hourly) ...');

        // Pre-fetch or create measurement types
        const typeIds = {};
        for (const [key, typeName] of Object.entries(MEASUREMENT_TYPES)) {
            typeIds[key] = await getOrCreateMeasurementType(typeName, `Auto-generated for Open-Meteo: ${typeName}`);
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
                console.log(`No sensor found for location ${location_id} (${location.name}). Skipping weather fetch.`);
                continue;
            }
            const sensorId = sensorRes.rows[0].sensor_id;

            // Fetch current weather and 7-day hourly forecast
            const params = new URLSearchParams({
                latitude: latitude,
                longitude: longitude,
                current: 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,dew_point_2m',
                hourly: 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,dew_point_2m',
                timezone: 'auto'
            });

            const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.error(`Failed to fetch weather for location ${location_id}. Status: ${response.status}`);
                continue;
            }

            const data = await response.json();
            
            // Build arrays for parameterized bulk insertion 
            const sensorIds = [];
            const timestamps = [];
            const values = [];
            const measurementTypeIds = [];

            // 1. Process Current Condition
            if (data.current) {
                const current = data.current;
                const timestamp = new Date(current.time || Date.now()).toISOString();
                
                for (const [key, _] of Object.entries(MEASUREMENT_TYPES)) {
                    if (current[key] !== undefined && current[key] !== null) {
                        sensorIds.push(sensorId);
                        timestamps.push(timestamp);
                        values.push(current[key]);
                        measurementTypeIds.push(typeIds[key]);
                    }
                }
            }

            // 2. Process Hourly Forecast Array
            if (data.hourly && data.hourly.time) {
                const hourly = data.hourly;
                for (let i = 0; i < hourly.time.length; i++) {
                    const timestampStr = hourly.time[i];
                    if (!timestampStr) continue;

                    const timestamp = new Date(timestampStr).toISOString();

                    for (const [key, _] of Object.entries(MEASUREMENT_TYPES)) {
                        if (hourly[key] && hourly[key][i] !== undefined && hourly[key][i] !== null) {
                            sensorIds.push(sensorId);
                            timestamps.push(timestamp);
                            values.push(hourly[key][i]);
                            measurementTypeIds.push(typeIds[key]);
                        }
                    }
                }
            }

            // Execute the Parameterized Bulk Insert using array unnesting.
            // This is clean, safe from SQL injection, incredibly efficient, and highly educational logic mapping array columns 
            // inside a singular insert without relying on loops executing individual PostgreSQL queries.
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
                    console.error(`Failed to bulk insert readings for location ${location_id}`, insertError.message);
                }
            }
        }

        console.log(`Successfully finished Open-Meteo update. Inserted ${totalReadingsInserted} new readings.`);
        return { status: 'success', message: `Inserted ${totalReadingsInserted} new readings.` };

    } catch (error) {
        console.error('Error fetching and storing weather data from Open-Meteo:', error);
        return { status: 'error', message: error.message };
    }
}

module.exports = { fetchAndStoreWeatherData };
