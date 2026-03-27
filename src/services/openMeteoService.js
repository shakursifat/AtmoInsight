const pool = require('../db/pool');

const MEASUREMENT_TYPES = {
    'temperature_2m':         { name: 'Temperature', unit_name: 'Degrees Celsius',            symbol: '°C'   },
    'relative_humidity_2m':   { name: 'Humidity',    unit_name: 'Percentage',                 symbol: '%'    },
    'surface_pressure':       { name: 'Pressure',    unit_name: 'Hectopascal',                symbol: 'hPa'  },
    'wind_speed_10m':         { name: 'Wind Speed',  unit_name: 'Metres per second',          symbol: 'm/s'  },
    'dew_point_2m':           { name: 'Dew Point',   unit_name: 'Degrees Celsius',            symbol: '°C'   },
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
 * Fetches current weather and 7-day hourly forecast from Open-Meteo
 * and securely bulk-inserts the data into the Reading table without duplicates.
 * No API key required — completely free.
 */
async function fetchAndStoreWeatherData() {
    try {
        console.log('[Open-Meteo] Starting weather update (Current + 7-Day Hourly) ...');

        // Pre-fetch or create measurement types AND units
        const typeIds = {};
        const unitIds = {};
        for (const [key, meta] of Object.entries(MEASUREMENT_TYPES)) {
            typeIds[key] = await getOrCreateMeasurementType(meta.name, `Auto-generated for Open-Meteo: ${meta.name}`);
            unitIds[key] = await getOrCreateUnit(meta.unit_name, meta.symbol);
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
            console.log('[Open-Meteo] No locations with coordinates found.');
            return { status: 'success', message: 'No locations found with coordinates' };
        }

        let totalReadingsInserted = 0;

        for (const location of locationRes.rows) {
            if (!location.latitude || !location.longitude) continue;

            const { location_id, latitude, longitude } = location;

            const sensorRes = await pool.query('SELECT sensor_id FROM Sensor WHERE location_id = $1 AND status = \'Active\' LIMIT 1', [location_id]);
            if (sensorRes.rows.length === 0) {
                console.log(`[Open-Meteo] No active sensor for location ${location_id} (${location.name}). Skipping.`);
                continue;
            }
            const sensorId = sensorRes.rows[0].sensor_id;

            const params = new URLSearchParams({
                latitude,
                longitude,
                current: Object.keys(MEASUREMENT_TYPES).join(','),
                hourly: Object.keys(MEASUREMENT_TYPES).join(','),
                timezone: 'Asia/Dhaka',
                forecast_days: 3
            });

            const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.error(`[Open-Meteo] Failed for location ${location_id}. HTTP ${response.status}`);
                continue;
            }

            const data = await response.json();

            const sensorIds = [];
            const timestamps = [];
            const values = [];
            const measurementTypeIds = [];
            const unitIdsArr = [];

            // Current conditions
            if (data.current) {
                const current = data.current;
                const timestamp = new Date(current.time || Date.now()).toISOString();

                for (const [key] of Object.entries(MEASUREMENT_TYPES)) {
                    if (current[key] !== undefined && current[key] !== null) {
                        sensorIds.push(sensorId);
                        timestamps.push(timestamp);
                        values.push(current[key]);
                        measurementTypeIds.push(typeIds[key]);
                        unitIdsArr.push(unitIds[key]);
                    }
                }
            }

            // Hourly forecast
            if (data.hourly && data.hourly.time) {
                const hourly = data.hourly;
                for (let i = 0; i < hourly.time.length; i++) {
                    const timestampStr = hourly.time[i];
                    if (!timestampStr) continue;
                    const timestamp = new Date(timestampStr).toISOString();

                    for (const [key] of Object.entries(MEASUREMENT_TYPES)) {
                        if (hourly[key] && hourly[key][i] !== undefined && hourly[key][i] !== null) {
                            sensorIds.push(sensorId);
                            timestamps.push(timestamp);
                            values.push(hourly[key][i]);
                            measurementTypeIds.push(typeIds[key]);
                            unitIdsArr.push(unitIds[key]);
                        }
                    }
                }
            }

            if (sensorIds.length > 0) {
                const bulkInsertQuery = `
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
                `;

                try {
                    const insertResult = await pool.query(bulkInsertQuery, [
                        sensorIds, timestamps, values, measurementTypeIds, unitIdsArr
                    ]);
                    totalReadingsInserted += insertResult.rowCount;
                    console.log(`[Open-Meteo] ${location.name}: inserted ${insertResult.rowCount} readings`);
                } catch (insertError) {
                    console.error(`[Open-Meteo] Bulk insert failed for ${location.name}:`, insertError.message);
                }
            }
        }

        console.log(`[Open-Meteo] Done. Total inserted: ${totalReadingsInserted} readings.`);
        return { status: 'success', message: `Inserted ${totalReadingsInserted} new readings.`, count: totalReadingsInserted };

    } catch (error) {
        console.error('[Open-Meteo] Fatal error:', error);
        return { status: 'error', message: error.message };
    }
}

module.exports = { fetchAndStoreWeatherData };
