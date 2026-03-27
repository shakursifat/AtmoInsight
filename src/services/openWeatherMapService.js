const pool = require('../db/pool');

const OWM_MEASUREMENT_TYPES = {
    'temperature': 'Temperature',
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

async function getOrCreateMeasurementType(typeName, description) {
    let res = await pool.query('SELECT measurement_type_id FROM MeasurementType WHERE type_name = $1', [typeName]);
    if (res.rows.length > 0) return res.rows[0].measurement_type_id;

    await pool.query(`SELECT setval(pg_get_serial_sequence('measurementtype', 'measurement_type_id'), COALESCE((SELECT MAX(measurement_type_id) FROM MeasurementType), 0) + 1, false);`);

    res = await pool.query(
        'INSERT INTO MeasurementType (type_name, description) VALUES ($1, $2) RETURNING measurement_type_id',
        [typeName, description]
    );
    return res.rows[0].measurement_type_id;
}

async function fetchAndStoreCurrentConditions() {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
        console.error('OPENWEATHERMAP_API_KEY missing in .env');
        return { status: 'error', message: 'OPENWEATHERMAP_API_KEY missing in environment variables' };
    }

    try {
        console.log('Starting OpenWeatherMap fetch for current conditions...');
        
        const typeIds = {};
        for (const [key, typeName] of Object.entries(OWM_MEASUREMENT_TYPES)) {
            typeIds[key] = await getOrCreateMeasurementType(typeName, `Auto-generated for OWM API: ${typeName}`);
        }

        const locationRes = await pool.query(`
            SELECT location_id, name,
                   ST_X(coordinates::geometry) AS longitude,
                   ST_Y(coordinates::geometry) AS latitude
            FROM Location
            WHERE coordinates IS NOT NULL
        `);

        if (locationRes.rows.length === 0) {
            return { status: 'success', message: 'No locations found', data: [] };
        }

        const currentConditionsData = [];

        for (const location of locationRes.rows) {
            if (!location.latitude || !location.longitude) continue;

            const { location_id, latitude, longitude } = location;

            let sensorRes = await pool.query('SELECT sensor_id FROM Sensor WHERE location_id = $1 LIMIT 1', [location_id]);
            if (sensorRes.rows.length === 0) continue;
            const sensorId = sensorRes.rows[0].sensor_id;

            // Fetch Weather
            const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;
            const weatherRes = await fetch(weatherUrl);
            let weatherData = {};
            if (weatherRes.ok) {
                weatherData = await weatherRes.json();
            } else {
                console.error(`OWM Weather failed for location ${location_id} with status ${weatherRes.status}`);
            }

            // Fetch Pollution
            const pollutionUrl = `http://api.openweathermap.org/data/2.5/air_pollution?lat=${latitude}&lon=${longitude}&appid=${apiKey}`;
            const pollutionRes = await fetch(pollutionUrl);
            let pollutionData = {};
            if (pollutionRes.ok) {
                pollutionData = await pollutionRes.json();
            } else {
                console.error(`OWM Pollution failed for location ${location_id} with status ${pollutionRes.status}`);
            }

            const timestamp = new Date().toISOString();
            const payloadToInsert = {};

            if (weatherData.main) {
                payloadToInsert.temperature = weatherData.main.temp;
                payloadToInsert.humidity = weatherData.main.humidity;
                payloadToInsert.pressure = weatherData.main.pressure;
                if (weatherData.wind) payloadToInsert.wind_speed = weatherData.wind.speed;
            }

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

            // Insert readings
            let insertedCount = 0;
            for (const [key, value] of Object.entries(payloadToInsert)) {
                if (value !== undefined && value !== null) {
                    const measurementTypeId = typeIds[key];
                    if (measurementTypeId) {
                        await pool.query(
                            `INSERT INTO Reading (sensor_id, timestamp, value, measurement_type_id)
                             VALUES ($1, $2, $3, $4)`,
                            [sensorId, timestamp, value, measurementTypeId]
                        );
                        insertedCount++;
                    }
                }
            }

            // Add to response data
            currentConditionsData.push({
                location_id,
                location_name: location.name,
                inserted_readings: insertedCount,
                weather: weatherData,
                pollution: pollutionData,
                conditions: payloadToInsert
            });
        }

        console.log(`Finished OpenWeatherMap update for ${locationRes.rows.length} locations`);
        return { status: 'success', data: currentConditionsData };
    } catch (error) {
        console.error('Error fetching OWM data:', error);
        return { status: 'error', message: error.message };
    }
}

module.exports = { fetchAndStoreCurrentConditions };
