const pool = require('../db/pool');

const OPENAQ_MEASUREMENT_TYPES = {
    'pm25': { name: 'PM2.5',    unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'pm10': { name: 'PM10',     unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'no2':  { name: 'NO2',      unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'co':   { name: 'CO',       unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'o3':   { name: 'O3',       unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'so2':  { name: 'SO2',      unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
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
 * Fetches real-world air quality measurements from OpenAQ v3.
 * Requires OPENAQ_API_KEY in environment variables (free tier: https://openaq.org).
 */
async function fetchAndStoreOpenAQData() {
    const apiKey = process.env.OPENAQ_API_KEY;
    if (!apiKey) {
        console.warn('[OpenAQ] OPENAQ_API_KEY not found in .env — skipping air quality fetch. Get a free key at https://openaq.org');
        return { status: 'skipped', message: 'OPENAQ_API_KEY missing' };
    }

    try {
        console.log('[OpenAQ] Starting air quality update...');

        const typeIds = {};
        const unitIds = {};
        for (const [key, meta] of Object.entries(OPENAQ_MEASUREMENT_TYPES)) {
            typeIds[key] = await getOrCreateMeasurementType(meta.name, `Auto-generated for OpenAQ: ${meta.name}`);
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
            console.log('[OpenAQ] No locations with coordinates found.');
            return { status: 'success', message: 'No locations found with coordinates' };
        }

        let totalReadingsInserted = 0;

        for (const location of locationRes.rows) {
            if (!location.latitude || !location.longitude) continue;

            const { location_id, latitude, longitude } = location;

            const sensorRes = await pool.query('SELECT sensor_id FROM Sensor WHERE location_id = $1 AND status = \'Active\' LIMIT 1', [location_id]);
            if (sensorRes.rows.length === 0) {
                console.log(`[OpenAQ] No active sensor for location ${location_id} (${location.name}). Skipping.`);
                continue;
            }
            const sensorId = sensorRes.rows[0].sensor_id;

            // Search for OpenAQ stations within 25 km radius
            const url = `https://api.openaq.org/v3/locations?coordinates=${latitude},${longitude}&radius=25000&limit=3`;

            const response = await fetch(url, {
                headers: { 'X-API-Key': apiKey }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    console.error('[OpenAQ] Unauthorized — check your API key.');
                    return { status: 'error', message: 'Unauthorized API Key for OpenAQ' };
                }
                console.error(`[OpenAQ] Request failed for location ${location_id}. HTTP ${response.status}`);
                continue;
            }

            const data = await response.json();
            if (!data.results || data.results.length === 0) {
                console.log(`[OpenAQ] No stations found near ${location.name}.`);
                continue;
            }

            const sensorIds = [];
            const timestamps = [];
            const values = [];
            const measurementTypeIds = [];
            const unitIdsArr = [];

            // Collect readings from all nearby stations (up to 3)
            for (const station of data.results) {
                const aqSensors = station.sensors;
                if (!aqSensors || aqSensors.length === 0) continue;

                for (const s of aqSensors) {
                    const param = s.parameter ? s.parameter.name.toLowerCase().replace('.', '') : null;
                    if (!param || !s.latest || !OPENAQ_MEASUREMENT_TYPES[param]) continue;

                    const value = s.latest.value;
                    const timestampStr = s.latest.datetime;

                    if (value !== undefined && value !== null) {
                        const ts = new Date(timestampStr || Date.now()).toISOString();
                        sensorIds.push(sensorId);
                        timestamps.push(ts);
                        values.push(value);
                        measurementTypeIds.push(typeIds[param]);
                        unitIdsArr.push(unitIds[param]);
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
                    console.log(`[OpenAQ] ${location.name}: inserted ${insertResult.rowCount} readings`);
                } catch (insertError) {
                    console.error(`[OpenAQ] Bulk insert failed for ${location.name}:`, insertError.message);
                }
            }
        }

        console.log(`[OpenAQ] Done. Total inserted: ${totalReadingsInserted} readings.`);
        return { status: 'success', message: `Inserted ${totalReadingsInserted} new readings.`, count: totalReadingsInserted };

    } catch (error) {
        console.error('[OpenAQ] Fatal error:', error);
        return { status: 'error', message: error.message };
    }
}

module.exports = { fetchAndStoreOpenAQData };
