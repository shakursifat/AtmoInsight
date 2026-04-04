const pool = require('../db/pool');

// OpenAQ v3 parameter name normalisation map
// OpenAQ v3 uses names like 'pm25', 'pm10', 'no2', 'co', 'o3', 'so2'
// but older stations sometimes return 'pm2.5' — we handle both.
const PARAM_NORMALISE = {
    'pm2.5': 'pm25',
    'pm 2.5': 'pm25',
    'pm25': 'pm25',
    'pm10': 'pm10',
    'pm 10': 'pm10',
    'no2': 'no2',
    'co': 'co',
    'o3': 'o3',
    'so2': 'so2',
};

const OPENAQ_MEASUREMENT_TYPES = {
    'pm25': { name: 'PM2.5',    unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'pm10': { name: 'PM10',     unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'no2':  { name: 'NO2',      unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'co':   { name: 'CO',       unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'o3':   { name: 'O3',       unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    'so2':  { name: 'SO2',      unit_name: 'Micrograms per cubic metre', symbol: 'µg/m³' },
};

// Max age for a reading to be considered "fresh" (48 hours)
const MAX_READING_AGE_MS = 48 * 60 * 60 * 1000;

async function getOrCreateMeasurementType(typeName, description) {
    let res = await pool.query(
        'SELECT measurement_type_id FROM MeasurementType WHERE type_name = $1',
        [typeName]
    );
    if (res.rows.length > 0) return res.rows[0].measurement_type_id;

    await pool.query(
        `SELECT setval(pg_get_serial_sequence('measurementtype', 'measurement_type_id'),
         COALESCE((SELECT MAX(measurement_type_id) FROM MeasurementType), 0) + 1, false);`
    );
    res = await pool.query(
        'INSERT INTO MeasurementType (type_name, description) VALUES ($1, $2) RETURNING measurement_type_id',
        [typeName, description]
    );
    return res.rows[0].measurement_type_id;
}

async function getOrCreateUnit(unitName, symbol) {
    let res = await pool.query(
        'SELECT unit_id FROM MeasurementUnit WHERE symbol = $1',
        [symbol]
    );
    if (res.rows.length > 0) return res.rows[0].unit_id;

    await pool.query(
        `SELECT setval(pg_get_serial_sequence('measurementunit', 'unit_id'),
         COALESCE((SELECT MAX(unit_id) FROM MeasurementUnit), 0) + 1, false);`
    );
    res = await pool.query(
        'INSERT INTO MeasurementUnit (unit_name, symbol) VALUES ($1, $2) RETURNING unit_id',
        [unitName, symbol]
    );
    return res.rows[0].unit_id;
}

/**
 * Normalise an OpenAQ v3 parameter name to our internal key.
 * Handles both the old dotted format ('pm2.5') and modern ('pm25').
 */
function normaliseParam(rawName) {
    if (!rawName) return null;
    const key = rawName.toLowerCase().trim().replace(/\s+/g, ' ');
    return PARAM_NORMALISE[key] ?? null;
}

/**
 * Extract the latest readings from an OpenAQ v3 station object.
 *
 * OpenAQ v3 /locations response nests pollutant data under station.parameters[].
 * Each parameter object looks like:
 *   {
 *     parameter: { name: "pm25", displayName: "PM2.5", ... },
 *     latest: { value: 45.2, datetime: "2024-01-01T12:00:00Z", ... }
 *   }
 *
 * Older endpoints / some stations may still use station.sensors[] with the
 * same inner shape — we try both to maximise compatibility.
 */
function extractReadings(station) {
    const results = [];
    const now = Date.now();

    // Try the modern v3 field first, fall back to legacy 'sensors'
    const paramList = station.parameters ?? station.sensors ?? [];

    for (const entry of paramList) {
        // Resolve the raw parameter name from either shape
        const rawName =
            entry.parameter?.name ??   // modern: { parameter: { name: "pm25" } }
            entry.parameter ??          // some stations: { parameter: "pm25" }
            null;

        const param = normaliseParam(rawName);
        if (!param || !OPENAQ_MEASUREMENT_TYPES[param]) continue;

        const latest = entry.latest ?? entry.lastUpdated ?? null;
        if (!latest) continue;

        const value = typeof latest === 'object' ? latest.value : null;
        const timestampStr = typeof latest === 'object'
            ? (latest.datetime ?? latest.date ?? latest.timestamp)
            : null;

        // Skip null or negative sensor values (sensor fault)
        if (value === null || value === undefined || value < 0) continue;

        // Skip readings older than MAX_READING_AGE_MS
        if (timestampStr) {
            const readingAge = now - new Date(timestampStr).getTime();
            if (readingAge > MAX_READING_AGE_MS) continue;
        }

        results.push({
            param,
            value,
            timestamp: timestampStr ? new Date(timestampStr).toISOString() : new Date().toISOString(),
        });
    }

    return results;
}

/**
 * Fetches real-world air quality measurements from OpenAQ v3.
 * Requires OPENAQ_API_KEY in environment variables (free tier: https://openaq.org).
 */
async function fetchAndStoreOpenAQData() {
    const apiKey = process.env.OPENAQ_API_KEY;
    if (!apiKey) {
        console.warn(
            '[OpenAQ] OPENAQ_API_KEY not found in .env — skipping. ' +
            'Get a free key at https://openaq.org'
        );
        return { status: 'skipped', message: 'OPENAQ_API_KEY missing' };
    }

    try {
        console.log('[OpenAQ] Starting air quality update...');

        // Pre-resolve measurement type IDs and unit IDs
        const typeIds = {};
        const unitIds = {};
        for (const [key, meta] of Object.entries(OPENAQ_MEASUREMENT_TYPES)) {
            typeIds[key] = await getOrCreateMeasurementType(
                meta.name,
                `Auto-generated for OpenAQ: ${meta.name}`
            );
            unitIds[key] = await getOrCreateUnit(meta.unit_name, meta.symbol);
        }

        // Fetch all locations that have geographic coordinates
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

            const { location_id, latitude, longitude, name: locName } = location;

            // Find an active sensor for this location
            const sensorRes = await pool.query(
                `SELECT sensor_id FROM Sensor
                 WHERE location_id = $1 AND status = 'Active'
                 LIMIT 1`,
                [location_id]
            );
            if (sensorRes.rows.length === 0) {
                console.log(`[OpenAQ] No active sensor for "${locName}" (loc ${location_id}) — skipping.`);
                continue;
            }
            const sensorId = sensorRes.rows[0].sensor_id;

            // Search for OpenAQ v3 stations within 25 km
            const url =
                `https://api.openaq.org/v3/locations` +
                `?coordinates=${latitude},${longitude}` +
                `&radius=25000` +
                `&limit=5` +
                `&order_by=distance`;

            let data;
            try {
                const response = await fetch(url, {
                    headers: {
                        'X-API-Key': apiKey,
                        'Accept': 'application/json',
                    },
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        console.error('[OpenAQ] 401 Unauthorized — invalid or expired API key.');
                        return { status: 'error', message: 'Unauthorized API Key for OpenAQ' };
                    }
                    if (response.status === 429) {
                        console.warn('[OpenAQ] 429 Rate limit hit — pausing 5 s before next location.');
                        await new Promise(r => setTimeout(r, 5000));
                        continue;
                    }
                    console.error(
                        `[OpenAQ] HTTP ${response.status} for location "${locName}". ` +
                        `Body: ${await response.text().catch(() => '(unreadable)')}`
                    );
                    continue;
                }

                data = await response.json();
            } catch (fetchErr) {
                console.error(`[OpenAQ] Network error for "${locName}":`, fetchErr.message);
                continue;
            }

            if (!data.results || data.results.length === 0) {
                console.log(`[OpenAQ] No stations found near "${locName}".`);
                continue;
            }

            // Collect readings from all nearby stations
            const sensorIds        = [];
            const timestamps       = [];
            const values           = [];
            const measurementTypeIds = [];
            const unitIdsArr       = [];

            for (const station of data.results) {
                const readings = extractReadings(station);
                for (const r of readings) {
                    sensorIds.push(sensorId);
                    timestamps.push(r.timestamp);
                    values.push(r.value);
                    measurementTypeIds.push(typeIds[r.param]);
                    unitIdsArr.push(unitIds[r.param]);
                }
            }

            if (sensorIds.length === 0) {
                console.log(`[OpenAQ] Stations found near "${locName}" but no usable readings.`);
                continue;
            }

            // Bulk insert with duplicate guard
            const bulkInsertQuery = `
                INSERT INTO Reading (sensor_id, timestamp, value, measurement_type_id, unit_id)
                SELECT u.sensor_id, u.timestamp, u.value, u.measurement_type_id, u.unit_id
                FROM UNNEST($1::int[], $2::timestamptz[], $3::numeric[], $4::int[], $5::int[])
                    AS u(sensor_id, timestamp, value, measurement_type_id, unit_id)
                WHERE NOT EXISTS (
                    SELECT 1 FROM Reading r
                    WHERE r.sensor_id            = u.sensor_id
                      AND r.timestamp            = u.timestamp
                      AND r.measurement_type_id  = u.measurement_type_id
                )
                RETURNING reading_id;
            `;

            try {
                const insertResult = await pool.query(bulkInsertQuery, [
                    sensorIds, timestamps, values, measurementTypeIds, unitIdsArr,
                ]);
                totalReadingsInserted += insertResult.rowCount;
                console.log(
                    `[OpenAQ] "${locName}": ${sensorIds.length} candidates → ` +
                    `${insertResult.rowCount} new readings inserted.`
                );
            } catch (insertError) {
                console.error(
                    `[OpenAQ] Bulk insert failed for "${locName}":`,
                    insertError.message
                );
            }

            // Small delay between locations to respect rate limits
            await new Promise(r => setTimeout(r, 300));
        }

        console.log(`[OpenAQ] Done. Total new readings inserted: ${totalReadingsInserted}.`);
        return {
            status: 'success',
            message: `Inserted ${totalReadingsInserted} new readings.`,
            count: totalReadingsInserted,
        };

    } catch (error) {
        console.error('[OpenAQ] Fatal error:', error);
        return { status: 'error', message: error.message };
    }
}

module.exports = { fetchAndStoreOpenAQData };
