'use strict';

/**
 * iqairService.js
 * ---------------
 * Fetches real-time air quality & weather data from the IQAir (AirVisual) API
 * for every Bangladesh location stored in the Location table and persists
 * each measurement into the Reading table.
 *
 * Environment variable required:
 *   IQAIR_API_KEY  — from https://www.iqair.com/dashboard/account
 *
 * IQAir free-tier endpoint used:
 *   GET https://api.airvisual.com/v2/nearest_city?lat=&lon=&key=
 *
 * Mapped to existing MeasurementTypes seeded in DB:
 *   PM2.5, Temperature, Humidity, Pressure, Wind Speed
 *
 * Follows the same getOrCreate pattern as openWeatherMapService.js so new
 * types / units are created automatically if they ever go missing.
 */

const axios = require('axios');
const pool  = require('../db/pool');

const IQAIR_BASE = 'https://api.airvisual.com/v2';

// ─── AQI Category Helper ─────────────────────────────────────────────────────
function aqiCategory(aqi) {
    if (aqi <= 50)  return { label: 'Good',                   color: '#00e400' };
    if (aqi <= 100) return { label: 'Moderate',               color: '#ffff00' };
    if (aqi <= 150) return { label: 'Unhealthy for Sensitive', color: '#ff7e00' };
    if (aqi <= 200) return { label: 'Unhealthy',              color: '#ff0000' };
    if (aqi <= 300) return { label: 'Very Unhealthy',         color: '#8f3f97' };
    return               { label: 'Hazardous',                color: '#7e0023' };
}

// ─── DB helpers (mirrors openWeatherMapService pattern) ──────────────────────
async function getOrCreateMeasurementType(typeName, description) {
    let res = await pool.query(
        'SELECT measurement_type_id FROM MeasurementType WHERE type_name = $1',
        [typeName]
    );
    if (res.rows.length > 0) return res.rows[0].measurement_type_id;

    await pool.query(`
        SELECT setval(
            pg_get_serial_sequence('measurementtype','measurement_type_id'),
            COALESCE((SELECT MAX(measurement_type_id) FROM MeasurementType), 0) + 1,
            false
        )`);
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

    await pool.query(`
        SELECT setval(
            pg_get_serial_sequence('measurementunit','unit_id'),
            COALESCE((SELECT MAX(unit_id) FROM MeasurementUnit), 0) + 1,
            false
        )`);
    res = await pool.query(
        'INSERT INTO MeasurementUnit (unit_name, symbol) VALUES ($1, $2) RETURNING unit_id',
        [unitName, symbol]
    );
    return res.rows[0].unit_id;
}

// Measurement types this service writes — must align with seed.sql names
const IQAIR_TYPES = {
    aqi:       { name: 'PM2.5',      unitName: 'Micrograms per cubic metre', symbol: 'µg/m³' },
    temp:      { name: 'Temperature', unitName: 'Degrees Celsius',            symbol: '°C'    },
    humidity:  { name: 'Humidity',    unitName: 'Percentage',                 symbol: '%'     },
    pressure:  { name: 'Pressure',    unitName: 'Hectopascal',                symbol: 'hPa'   },
    windSpeed: { name: 'Wind Speed',  unitName: 'Metres per second',          symbol: 'm/s'   },
};

// ─── Core fetch + store ───────────────────────────────────────────────────────

/**
 * Fetches IQAir data for every sensor whose source is "IQAir AirVisual"
 * and inserts fresh readings into the Reading table.
 *
 * Called on startup and by the 30-min cron in server.js.
 * Run seedIQAirSensors.js first to populate the sensors.
 *
 * @returns {{ status: string, count: number, data: array }}
 */
async function fetchAndStoreIQAirData() {
    const apiKey = process.env.IQAIR_API_KEY;
    if (!apiKey) {
        console.warn('[IQAir] IQAIR_API_KEY not set — skipping. Get a free key at https://www.iqair.com/dashboard/account');
        return { status: 'skipped', message: 'IQAIR_API_KEY missing', count: 0 };
    }

    try {
        // Resolve the IQAir DataSource row
        const srcRes = await pool.query(
            `SELECT source_id FROM datasource WHERE name = 'IQAir AirVisual' LIMIT 1`
        );
        if (srcRes.rows.length === 0) {
            console.warn('[IQAir] DataSource "IQAir AirVisual" not found. Run seedIQAirSensors.js first.');
            return { status: 'skipped', message: 'IQAir DataSource not seeded', count: 0 };
        }
        const sourceId = srcRes.rows[0].source_id;

        // Pre-resolve type IDs and unit IDs once
        const typeIds = {};
        const unitIds = {};
        for (const [key, meta] of Object.entries(IQAIR_TYPES)) {
            typeIds[key] = await getOrCreateMeasurementType(meta.name, `IQAir AirVisual: ${meta.name}`);
            unitIds[key] = await getOrCreateUnit(meta.unitName, meta.symbol);
        }

        // Load all IQAir sensors with their location coordinates
        console.log('[IQAir] Fetching readings for all IQAir sensors...');
        const sensorRes = await pool.query(`
            SELECT s.sensor_id, s.name AS sensor_name,
                   l.name AS location_name,
                   ST_Y(l.coordinates::geometry) AS latitude,
                   ST_X(l.coordinates::geometry) AS longitude
            FROM sensor s
            JOIN location l ON s.location_id = l.location_id
            WHERE s.source_id = $1
              AND s.status = 'Active'
              AND l.coordinates IS NOT NULL
        `, [sourceId]);

        if (sensorRes.rows.length === 0) {
            console.warn('[IQAir] No IQAir sensors found. Run: node seedIQAirSensors.js');
            return { status: 'skipped', message: 'No IQAir sensors in DB — run seedIQAirSensors.js', count: 0 };
        }

        console.log(`[IQAir] Found ${sensorRes.rows.length} IQAir sensor(s) to refresh.`);

        let totalInserted = 0;
        const results = [];

        for (const sensor of sensorRes.rows) {
            const { sensor_id: sensorId, sensor_name, location_name, latitude, longitude } = sensor;

            // Call IQAir nearest-city endpoint
            let iqData;
            try {
                const response = await axios.get(`${IQAIR_BASE}/nearest_city`, {
                    params: { lat: latitude, lon: longitude, key: apiKey },
                    timeout: 10000,
                });
                if (response.data.status !== 'success') {
                    console.warn(`[IQAir] ${location_name}: API status "${response.data.status}" — skipped`);
                    continue;
                }
                iqData = response.data.data;
            } catch (fetchErr) {
                console.error(`[IQAir] ${location_name}: fetch error —`, fetchErr.message);
                continue;
            }

            const pollution = iqData.current?.pollution;
            const weather   = iqData.current?.weather;
            if (!pollution && !weather) continue;

            // Build payload — only defined, non-null values
            const payload = {};
            if (pollution?.aqius != null) payload.aqi       = pollution.aqius;
            if (weather?.tp      != null) payload.temp      = weather.tp;
            if (weather?.hu      != null) payload.humidity  = weather.hu;
            if (weather?.pr      != null) payload.pressure  = weather.pr;
            if (weather?.ws      != null) payload.windSpeed = weather.ws;

            if (Object.keys(payload).length === 0) continue;

            // Bulk insert, skip exact duplicates
            const timestamp = new Date().toISOString();
            const sIds = [], ts = [], vals = [], mtIds = [], uIds = [], srcIds = [];

            for (const [key, value] of Object.entries(payload)) {
                if (typeIds[key] && unitIds[key]) {
                    sIds.push(sensorId);
                    ts.push(timestamp);
                    vals.push(value);
                    mtIds.push(typeIds[key]);
                    uIds.push(unitIds[key]);
                    srcIds.push(sourceId);
                }
            }

            if (sIds.length > 0) {
                try {
                    const ins = await pool.query(`
                        INSERT INTO reading (sensor_id, timestamp, value, measurement_type_id, unit_id, source_id)
                        SELECT u.sensor_id, u.timestamp, u.value, u.measurement_type_id, u.unit_id, u.source_id
                        FROM UNNEST($1::int[], $2::timestamptz[], $3::numeric[], $4::int[], $5::int[], $6::int[])
                            AS u(sensor_id, timestamp, value, measurement_type_id, unit_id, source_id)
                        WHERE NOT EXISTS (
                            SELECT 1 FROM reading r
                            WHERE r.sensor_id          = u.sensor_id
                              AND r.timestamp           = u.timestamp
                              AND r.measurement_type_id = u.measurement_type_id
                        )
                        RETURNING reading_id
                    `, [sIds, ts, vals, mtIds, uIds, srcIds]);
                    totalInserted += ins.rowCount;
                    console.log(`[IQAir] ${location_name} (${sensor_name}): +${ins.rowCount} readings (AQI=${payload.aqi ?? '-'}, Temp=${payload.temp ?? '-'}°C)`);
                } catch (insErr) {
                    console.error(`[IQAir] ${location_name}: insert error —`, insErr.message);
                }
            }

            results.push({ sensor_id: sensorId, sensor_name, location_name, aqi: payload.aqi ?? null, temp: payload.temp ?? null });
        }

        console.log(`[IQAir] Done. Total inserted: ${totalInserted} readings across ${results.length} sensor(s).`);
        return { status: 'success', count: totalInserted, data: results };

    } catch (err) {
        console.error('[IQAir] Fatal error:', err.message);
        return { status: 'error', message: err.message, count: 0 };
    }
}

// ─── On-demand single-location fetch (for GET /api/current-conditions) ───────

/**
 * Fetches IQAir for ONE location and returns a clean frontend object.
 * Does NOT persist to DB (use fetchAndStoreIQAirData for persistence).
 *
 * @param {{ location_id?: number, lat?: number, lon?: number }} opts
 */
async function getCurrentConditions({ location_id = null, lat = null, lon = null } = {}) {
    const apiKey = process.env.IQAIR_API_KEY;
    if (!apiKey) throw new Error('IQAIR_API_KEY is not set in environment variables.');

    let resolvedLat = lat;
    let resolvedLon = lon;

    if (location_id) {
        const locRes = await pool.query(
            `SELECT ST_Y(coordinates::geometry) AS lat, ST_X(coordinates::geometry) AS lon
             FROM location WHERE location_id = $1`,
            [location_id]
        );
        if (locRes.rows.length === 0) throw new Error(`Location id=${location_id} not found.`);
        resolvedLat = parseFloat(locRes.rows[0].lat);
        resolvedLon = parseFloat(locRes.rows[0].lon);
    }

    if (resolvedLat == null || resolvedLon == null) {
        throw new Error('Provide location_id or both lat & lon.');
    }

    const response = await axios.get(`${IQAIR_BASE}/nearest_city`, {
        params: { lat: resolvedLat, lon: resolvedLon, key: apiKey },
        timeout: 10000,
    });
    if (response.data.status !== 'success') {
        throw new Error(`IQAir API error: ${JSON.stringify(response.data)}`);
    }

    const d         = response.data.data;
    const pollution = d.current?.pollution ?? {};
    const weather   = d.current?.weather   ?? {};
    const aqiValue  = pollution.aqius ?? null;

    return {
        location:   { city: d.city, state: d.state, country: d.country, lat: resolvedLat, lon: resolvedLon },
        aqi:        { value: aqiValue, ...(aqiValue != null ? aqiCategory(aqiValue) : {}) },
        pollutants: { pm25: aqiValue, pm10: null, no2: null, co: null, o3: null, so2: null },
        weather:    {
            temperature: weather.tp  ?? null,
            feelsLike:   null,
            humidity:    weather.hu  ?? null,
            pressure:    weather.pr  ?? null,
            windSpeed:   weather.ws  ?? null,
            icon:        weather.ic  ?? null,
        },
        fetchedAt: new Date().toISOString(),
    };
}

module.exports = { fetchAndStoreIQAirData, getCurrentConditions };
