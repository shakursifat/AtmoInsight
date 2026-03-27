const pool = require('../db/pool');

const OWM_MEASUREMENT_TYPES = {
    'temperature': { name: 'Temperature', unit_name: 'Degrees Celsius',            symbol: '°C'    },
    'humidity':    { name: 'Humidity',    unit_name: 'Percentage',                 symbol: '%'     },
    'pressure':    { name: 'Pressure',    unit_name: 'Hectopascal',                symbol: 'hPa'   },
    'wind_speed':  { name: 'Wind Speed',  unit_name: 'Metres per second',          symbol: 'm/s'   },
    'aqi':         { name: 'AQI',         unit_name: 'Dimensionless',              symbol: '-'     },
    'pm2_5':       { name: 'PM2.5',       unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'pm10':        { name: 'PM10',        unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'no2':         { name: 'NO2',         unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'co':          { name: 'CO',          unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'o3':          { name: 'O3',          unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'so2':         { name: 'SO2',         unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
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

async function getOrCreateUnit(unitName, symbol) {
    let res = await pool.query('SELECT unit_id FROM MeasurementUnit WHERE symbol = $1', [symbol]);
    if (res.rows.length > 0) return res.rows[0].unit_id;

    await pool.query(`SELECT setval(pg_get_serial_sequence('measurementunit', 'unit_id'), COALESCE((SELECT MAX(unit_id) FROM MeasurementUnit), 0) + 1, false);`);
    res = await pool.query(
        'INSERT INTO MeasurementUnit (unit_name, symbol) VALUES ($1, $2) RETURNING unit_id',
        [unitName, symbol]
    );
    return res.rows[0].unit_id;
}

/**
 * Fetches current weather + air pollution from OpenWeatherMap for all Bangladesh locations.
 * Requires OPENWEATHERMAP_API_KEY in environment variables (free tier: 1000 calls/day).
 */
async function fetchAndStoreCurrentConditions() {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
        console.warn('[OWM] OPENWEATHERMAP_API_KEY not found in .env — skipping. Get a free key at https://openweathermap.org/api');
        return { status: 'skipped', message: 'OPENWEATHERMAP_API_KEY missing' };
    }

    try {
        console.log('[OWM] Starting weather + air pollution fetch...');

        const typeIds = {};
        const unitIds = {};
        for (const [key, meta] of Object.entries(OWM_MEASUREMENT_TYPES)) {
            typeIds[key] = await getOrCreateMeasurementType(meta.name, `Auto-generated for OWM API: ${meta.name}`);
            unitIds[key] = await getOrCreateUnit(meta.unit_name, meta.symbol);
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

        let totalInserted = 0;
        const results = [];

        for (const location of locationRes.rows) {
            if (!location.latitude || !location.longitude) continue;

            const { location_id, latitude, longitude } = location;

            const sensorRes = await pool.query('SELECT sensor_id FROM Sensor WHERE location_id = $1 AND status = \'Active\' LIMIT 1', [location_id]);
            if (sensorRes.rows.length === 0) continue;
            const sensorId = sensorRes.rows[0].sensor_id;

            const timestamp = new Date().toISOString();
            const payload = {};

            // Fetch weather
            try {
                const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;
                const weatherRes = await fetch(weatherUrl);
                if (weatherRes.ok) {
                    const w = await weatherRes.json();
                    if (w.main) {
                        payload.temperature = w.main.temp;
                        payload.humidity = w.main.humidity;
                        payload.pressure = w.main.pressure;
                    }
                    if (w.wind) payload.wind_speed = w.wind.speed;
                } else {
                    console.error(`[OWM] Weather fetch failed for ${location.name}: HTTP ${weatherRes.status}`);
                }
            } catch (e) {
                console.error(`[OWM] Weather fetch error for ${location.name}:`, e.message);
            }

            // Fetch air pollution
            try {
                const pollutionUrl = `http://api.openweathermap.org/data/2.5/air_pollution?lat=${latitude}&lon=${longitude}&appid=${apiKey}`;
                const pollutionRes = await fetch(pollutionUrl);
                if (pollutionRes.ok) {
                    const p = await pollutionRes.json();
                    if (p.list && p.list.length > 0) {
                        const entry = p.list[0];
                        payload.aqi = entry.main.aqi;
                        if (entry.components) {
                            payload.pm2_5 = entry.components.pm2_5;
                            payload.pm10  = entry.components.pm10;
                            payload.no2   = entry.components.no2;
                            payload.co    = entry.components.co;
                            payload.o3    = entry.components.o3;
                            payload.so2   = entry.components.so2;
                        }
                    }
                } else {
                    console.error(`[OWM] Pollution fetch failed for ${location.name}: HTTP ${pollutionRes.status}`);
                }
            } catch (e) {
                console.error(`[OWM] Pollution fetch error for ${location.name}:`, e.message);
            }

            // Bulk insert readings
            const sensorIds = [];
            const timestamps = [];
            const vals = [];
            const mtIds = [];
            const uIds = [];

            for (const [key, value] of Object.entries(payload)) {
                if (value !== undefined && value !== null && typeIds[key]) {
                    sensorIds.push(sensorId);
                    timestamps.push(timestamp);
                    vals.push(value);
                    mtIds.push(typeIds[key]);
                    uIds.push(unitIds[key]);
                }
            }

            if (sensorIds.length > 0) {
                try {
                    const insertResult = await pool.query(`
                        INSERT INTO Reading (sensor_id, timestamp, value, measurement_type_id, unit_id)
                        SELECT u.sensor_id, u.timestamp, u.value, u.measurement_type_id, u.unit_id
                        FROM UNNEST($1::int[], $2::timestamptz[], $3::numeric[], $4::int[], $5::int[])
                            AS u(sensor_id, timestamp, value, measurement_type_id, unit_id)
                        WHERE NOT EXISTS (
                            SELECT 1 FROM Reading r
                            WHERE r.sensor_id = u.sensor_id
                              AND r.timestamp = u.timestamp
                              AND r.measurement_type_id = u.measurement_type_id
                        )
                        RETURNING reading_id;
                    `, [sensorIds, timestamps, vals, mtIds, uIds]);
                    totalInserted += insertResult.rowCount;
                    console.log(`[OWM] ${location.name}: inserted ${insertResult.rowCount} readings`);
                } catch (insertError) {
                    console.error(`[OWM] Bulk insert failed for ${location.name}:`, insertError.message);
                }
            }

            results.push({ location_id, location_name: location.name, conditions: payload });
        }

        console.log(`[OWM] Done. Total inserted: ${totalInserted} readings.`);
        return { status: 'success', count: totalInserted, data: results };

    } catch (error) {
        console.error('[OWM] Fatal error:', error);
        return { status: 'error', message: error.message };
    }
}

module.exports = { fetchAndStoreCurrentConditions };
