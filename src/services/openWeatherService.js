const pool = require('../db/pool');

const OWM_MEASUREMENT_TYPES = {
    'temperature': 'Temperature',
    'feels_like': 'Feels Like',
    'humidity': 'Humidity',
    'pressure': 'Pressure',
    'wind_speed': 'Wind Speed',
    'aqi': 'AQI',
    'pm2_5': 'PM2.5',
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
 * Fetches current weather and pollution from OpenWeatherMap for a specific location.
 * Inserts readings and returns dashboard-ready data.
 */
async function fetchCurrentConditionsByLocation(locationId) {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
        throw new Error('OPENWEATHERMAP_API_KEY missing in environment variables');
    }

    try {
        console.log(`Starting OpenWeatherMap fetch for location_id: ${locationId}...`);

        // Pre-fetch or create measurement types
        const typeIds = {};
        for (const [key, typeName] of Object.entries(OWM_MEASUREMENT_TYPES)) {
            typeIds[key] = await getOrCreateMeasurementType(typeName, `Auto-generated for OWM API: ${typeName}`);
        }

        // Fetch location coordinates
        const locationRes = await pool.query(`
            SELECT location_id, name,
                   ST_X(coordinates::geometry) AS longitude,
                   ST_Y(coordinates::geometry) AS latitude
            FROM Location
            WHERE location_id = $1 AND coordinates IS NOT NULL
        `, [locationId]);

        if (locationRes.rows.length === 0) {
            throw new Error(`Location ID ${locationId} not found or has no coordinates.`);
        }

        const location = locationRes.rows[0];
        const { latitude, longitude } = location;

        // Find an existing sensor for this location
        const sensorRes = await pool.query('SELECT sensor_id FROM Sensor WHERE location_id = $1 LIMIT 1', [locationId]);
        if (sensorRes.rows.length === 0) {
            throw new Error(`No sensor found for location ${locationId}. Cannot insert readings.`);
        }
        const sensorId = sensorRes.rows[0].sensor_id;

        // 1. Fetch Current Weather
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;
        const weatherRes = await fetch(weatherUrl);
        if (!weatherRes.ok) {
            throw new Error(`OWM Weather API failed with status ${weatherRes.status}`);
        }
        const weatherData = await weatherRes.json();

        // 2. Fetch Air Pollution
        const pollutionUrl = `http://api.openweathermap.org/data/2.5/air_pollution?lat=${latitude}&lon=${longitude}&appid=${apiKey}`;
        const pollutionRes = await fetch(pollutionUrl);
        if (!pollutionRes.ok) {
            throw new Error(`OWM Pollution API failed with status ${pollutionRes.status}`);
        }
        const pollutionData = await pollutionRes.json();

        const timestampStr = new Date().toISOString();
        const payloadToInsert = {};

        // Extract Weather
        if (weatherData.main) {
            payloadToInsert.temperature = weatherData.main.temp;
            payloadToInsert.feels_like = weatherData.main.feels_like; // Dashboard requested "feels-like"
            payloadToInsert.humidity = weatherData.main.humidity;
            payloadToInsert.pressure = weatherData.main.pressure;
        }
        if (weatherData.wind) {
            payloadToInsert.wind_speed = weatherData.wind.speed;
        }

        // Extract Pollution
        if (pollutionData.list && pollutionData.list.length > 0) {
            const p = pollutionData.list[0];
            payloadToInsert.aqi = p.main.aqi;
            payloadToInsert.pm2_5 = p.components.pm2_5;
            payloadToInsert.pm10 = p.components.pm10;
            payloadToInsert.no2 = p.components.no2;
            payloadToInsert.co = p.components.co;
            payloadToInsert.o3 = p.components.o3;
            payloadToInsert.so2 = p.components.so2;
        }

        // Safe Parameterized Bulk Insert
        const sensorIds = [];
        const timestamps = [];
        const values = [];
        const measurementTypeIds = [];

        for (const [key, value] of Object.entries(payloadToInsert)) {
            if (value !== undefined && value !== null) {
                const measurementTypeId = typeIds[key];
                if (measurementTypeId) {
                    sensorIds.push(sensorId);
                    timestamps.push(timestampStr);
                    values.push(value);
                    measurementTypeIds.push(measurementTypeId);
                }
            }
        }

        let insertedCount = 0;
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
            `;
            const result = await pool.query(bulkInsertQuery, [sensorIds, timestamps, values, measurementTypeIds]);
            insertedCount = result.rowCount;
        }

        // Frontend Dashboard format requirement
        return {
            status: 'success',
            location: {
                id: location_id,
                name: location.name
            },
            current_conditions: {
                temperature: payloadToInsert.temperature,
                feels_like: payloadToInsert.feels_like,
                aqi: payloadToInsert.aqi,
                pollution_breakdown: {
                    pm2_5: payloadToInsert.pm2_5,
                    pm10: payloadToInsert.pm10,
                    no2: payloadToInsert.no2,
                    co: payloadToInsert.co,
                    o3: payloadToInsert.o3,
                    so2: payloadToInsert.so2
                }
            },
            db_sync: `Inserted ${insertedCount} new readings.`
        };

    } catch (error) {
        console.error('Error in openWeatherService:', error);
        throw error;
    }
}

module.exports = { fetchCurrentConditionsByLocation };
