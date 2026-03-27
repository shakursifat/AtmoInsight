/**
 * seedIQAirSensors.js
 * -------------------
 * One-time (re-runnable) script that:
 *   1. Adds "IQAir AirVisual" to the DataSource table (idempotent)
 *   2. Adds "Air Quality" sensor_type_id if missing
 *   3. Discovers all IQAir-covered cities in Bangladesh via:
 *        /v2/states?country=Bangladesh
 *        /v2/cities?state=<S>&country=Bangladesh
 *        /v2/city?city=<C>&state=<S>&country=Bangladesh
 *   4. For each city with live data:
 *        - Upserts a Location row (matched by name)
 *        - Upserts a Sensor row  (matched by location_id + source_id)
 *   5. Inserts an initial Reading for each sensor
 *   6. Prints a summary table
 *
 * Rate limit: IQAir free tier = 10 req/min → we wait 7s between every call.
 * Retries once on 429 after a 65-second back-off.
 *
 * Run with:
 *   node seedIQAirSensors.js
 *
 * Requires IQAIR_API_KEY and DATABASE_URL in root .env
 */

require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const IQAIR_BASE = 'https://api.airvisual.com/v2';
const API_KEY    = process.env.IQAIR_API_KEY;
const COUNTRY    = 'Bangladesh';

// ─── Rate-limit helpers ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const CALL_DELAY_MS  = 7000;  // 7s between requests → ~8.5 req/min (safe under 10)
const RETRY_DELAY_MS = 65000; // 65s back-off on 429

/**
 * Throttled IQAir GET with one 429-retry.
 */
async function iqGet(endpoint, params, isRetry = false) {
    await sleep(CALL_DELAY_MS);
    try {
        const res = await axios.get(`${IQAIR_BASE}/${endpoint}`, {
            params: { ...params, key: API_KEY },
            timeout: 15000,
        });
        return res.data;
    } catch (err) {
        const status = err.response?.status;
        if (status === 429 && !isRetry) {
            console.warn(`[Seed] 429 rate-limit hit on ${endpoint}. Waiting ${RETRY_DELAY_MS / 1000}s then retrying...`);
            await sleep(RETRY_DELAY_MS);
            return iqGet(endpoint, params, true);
        }
        throw err;
    }
}

// ─── DB Helpers ──────────────────────────────────────────────────────────────

async function getOrCreateDataSource() {
    const r = await pool.query(`SELECT source_id FROM datasource WHERE name = 'IQAir AirVisual' LIMIT 1`);
    if (r.rows.length > 0) { console.log(`[Seed] DataSource already exists (id=${r.rows[0].source_id})`); return r.rows[0].source_id; }
    const ins = await pool.query(
        `INSERT INTO datasource (name, source_type, description, url)
         VALUES ('IQAir AirVisual', 'API', 'Real-time AQI and weather from IQAir AirVisual network', 'https://www.iqair.com')
         RETURNING source_id`
    );
    console.log(`[Seed] Created DataSource: IQAir AirVisual (id=${ins.rows[0].source_id})`);
    return ins.rows[0].source_id;
}

async function getOrCreateSensorType() {
    const r = await pool.query(`SELECT sensor_type_id FROM sensortype WHERE type_name = 'Air Quality' LIMIT 1`);
    if (r.rows.length > 0) return r.rows[0].sensor_type_id;
    const ins = await pool.query(
        `INSERT INTO sensortype (type_name, description)
         VALUES ('Air Quality', 'Measures particulate matter and gaseous pollutants')
         RETURNING sensor_type_id`
    );
    console.log(`[Seed] Created SensorType: Air Quality (id=${ins.rows[0].sensor_type_id})`);
    return ins.rows[0].sensor_type_id;
}

async function upsertLocation(name, lat, lon, address, region) {
    const r = await pool.query(`SELECT location_id FROM location WHERE name = $1 LIMIT 1`, [name]);
    if (r.rows.length > 0) return r.rows[0].location_id;
    const ins = await pool.query(
        `INSERT INTO location (name, coordinates, address, region)
         VALUES ($1, ST_SetSRID(ST_MakePoint($3, $2), 4326), $4, $5)
         RETURNING location_id`,
        [name, lat, lon, address, region]
    );
    return ins.rows[0].location_id;
}

async function upsertSensor(name, sensorTypeId, locationId, sourceId) {
    const r = await pool.query(
        `SELECT sensor_id FROM sensor WHERE location_id = $1 AND source_id = $2 LIMIT 1`,
        [locationId, sourceId]
    );
    if (r.rows.length > 0) return { sensor_id: r.rows[0].sensor_id, created: false };
    const ins = await pool.query(
        `INSERT INTO sensor (name, sensor_type_id, location_id, status, installed_at, source_id)
         VALUES ($1, $2, $3, 'Active', CURRENT_DATE, $4)
         RETURNING sensor_id`,
        [name, sensorTypeId, locationId, sourceId]
    );
    return { sensor_id: ins.rows[0].sensor_id, created: true };
}

async function getOrCreateMeasurementType(typeName, desc) {
    const r = await pool.query(`SELECT measurement_type_id FROM measurementtype WHERE type_name = $1`, [typeName]);
    if (r.rows.length > 0) return r.rows[0].measurement_type_id;
    const ins = await pool.query(
        `INSERT INTO measurementtype (type_name, description) VALUES ($1, $2) RETURNING measurement_type_id`,
        [typeName, desc]
    );
    return ins.rows[0].measurement_type_id;
}

async function getOrCreateUnit(unitName, symbol) {
    const r = await pool.query(`SELECT unit_id FROM measurementunit WHERE symbol = $1`, [symbol]);
    if (r.rows.length > 0) return r.rows[0].unit_id;
    const ins = await pool.query(
        `INSERT INTO measurementunit (unit_name, symbol) VALUES ($1, $2) RETURNING unit_id`,
        [unitName, symbol]
    );
    return ins.rows[0].unit_id;
}

async function insertReadings(sensorId, sourceId, typeIds, unitIds, payload) {
    const timestamp = new Date().toISOString();
    const sIds = [], ts = [], vals = [], mtIds = [], uIds = [], srcIds = [];
    for (const [key, value] of Object.entries(payload)) {
        if (value != null && typeIds[key] && unitIds[key]) {
            sIds.push(sensorId); ts.push(timestamp); vals.push(value);
            mtIds.push(typeIds[key]); uIds.push(unitIds[key]); srcIds.push(sourceId);
        }
    }
    if (sIds.length === 0) return 0;
    const res = await pool.query(
        `INSERT INTO reading (sensor_id, timestamp, value, measurement_type_id, unit_id, source_id)
         SELECT u.sensor_id, u.timestamp, u.value, u.measurement_type_id, u.unit_id, u.source_id
         FROM UNNEST($1::int[], $2::timestamptz[], $3::numeric[], $4::int[], $5::int[], $6::int[])
             AS u(sensor_id, timestamp, value, measurement_type_id, unit_id, source_id)
         WHERE NOT EXISTS (
             SELECT 1 FROM reading r
             WHERE r.sensor_id = u.sensor_id
               AND r.timestamp = u.timestamp
               AND r.measurement_type_id = u.measurement_type_id
         )
         RETURNING reading_id`,
        [sIds, ts, vals, mtIds, uIds, srcIds]
    );
    return res.rowCount;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    if (!API_KEY) { console.error('[Seed] ERROR: IQAIR_API_KEY not set in .env'); process.exit(1); }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║     IQAir AirVisual Sensor Seeder — Bangladesh  ║');
    console.log(`║     Rate limit: 1 call per ${CALL_DELAY_MS / 1000}s                 ║`);
    console.log('╚══════════════════════════════════════════════════╝\n');

    // ── DB setup ──────────────────────────────────────────────────────────
    const sourceId     = await getOrCreateDataSource();
    const sensorTypeId = await getOrCreateSensorType();

    const TYPES = {
        aqi:       { name: 'PM2.5',      unitName: 'Micrograms per cubic metre', symbol: 'µg/m³' },
        temp:      { name: 'Temperature', unitName: 'Degrees Celsius',            symbol: '°C'    },
        humidity:  { name: 'Humidity',    unitName: 'Percentage',                 symbol: '%'     },
        pressure:  { name: 'Pressure',    unitName: 'Hectopascal',                symbol: 'hPa'   },
        windSpeed: { name: 'Wind Speed',  unitName: 'Metres per second',          symbol: 'm/s'   },
    };
    const typeIds = {}, unitIds = {};
    for (const [key, meta] of Object.entries(TYPES)) {
        typeIds[key] = await getOrCreateMeasurementType(meta.name, `IQAir AirVisual: ${meta.name}`);
        unitIds[key] = await getOrCreateUnit(meta.unitName, meta.symbol);
    }

    // ── Fetch states ─────────────────────────────────────────────────────
    console.log(`[Seed] Fetching states for ${COUNTRY}...`);
    let statesData;
    try {
        statesData = await iqGet('states', { country: COUNTRY });
    } catch (err) {
        console.error('[Seed] Failed to fetch states:', err.message); process.exit(1);
    }
    if (statesData.status !== 'success' || !statesData.data?.length) {
        console.error('[Seed] No states returned. Check API key.'); process.exit(1);
    }

    const states = statesData.data.map(s => s.state);
    console.log(`[Seed] Found ${states.length} state(s): ${states.join(', ')}\n`);

    // ── Process states & cities ───────────────────────────────────────────
    const summary = [];
    let totalSensors = 0, totalReadings = 0;

    for (const state of states) {
        console.log(`\n[Seed] ── State: ${state} ──`);

        let citiesData;
        try {
            citiesData = await iqGet('cities', { state, country: COUNTRY });
        } catch (err) {
            console.warn(`[Seed]   Cities fetch failed: ${err.message}`); continue;
        }
        if (citiesData.status !== 'success' || !citiesData.data?.length) {
            console.log(`[Seed]   No cities returned`); continue;
        }

        const cities = citiesData.data.map(c => c.city);
        console.log(`[Seed]   Found ${cities.length} city(ies): ${cities.join(', ')}`);

        for (const city of cities) {
            let cityData;
            try {
                cityData = await iqGet('city', { city, state, country: COUNTRY });
            } catch (err) {
                console.warn(`[Seed]   ${city}: error — ${err.message}`); continue;
            }
            if (cityData.status !== 'success' || !cityData.data) {
                console.log(`[Seed]   ${city}: no data (${cityData.status})`); continue;
            }

            const d         = cityData.data;
            const locCoords = d.location?.coordinates; // [lon, lat]
            const pollution = d.current?.pollution;
            const weather   = d.current?.weather;

            if (!locCoords || !pollution) {
                console.log(`[Seed]   ${city}: missing coords or pollution — skipped`); continue;
            }

            const lat = locCoords[1], lon = locCoords[0];
            const locationName = `${city}, ${state}`;

            const locationId = await upsertLocation(locationName, lat, lon, `${city}, ${state}, ${COUNTRY}`, state);
            const sensorName = `IQAir-${city.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase()}`;
            const { sensor_id: sensorId, created } = await upsertSensor(sensorName, sensorTypeId, locationId, sourceId);

            const payload = {};
            if (pollution.aqius != null) payload.aqi       = pollution.aqius;
            if (weather?.tp     != null) payload.temp      = weather.tp;
            if (weather?.hu     != null) payload.humidity  = weather.hu;
            if (weather?.pr     != null) payload.pressure  = weather.pr;
            if (weather?.ws     != null) payload.windSpeed = weather.ws;

            const inserted = await insertReadings(sensorId, sourceId, typeIds, unitIds, payload);
            totalSensors  += created ? 1 : 0;
            totalReadings += inserted;

            const badge = created ? '✅ NEW' : '🔄 existing';
            console.log(`[Seed]   ${badge} ${city}: ${sensorName} | AQI=${payload.aqi ?? '-'} Temp=${payload.temp ?? '-'}°C +${inserted} readings`);
            summary.push({ city, state, sensorName, sensorId, aqi: payload.aqi, created });
        }
    }

    // ── Summary ───────────────────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  COMPLETE  — ${String(summary.length).padEnd(3)} cities processed         ║`);
    console.log(`║             ${String(totalSensors).padEnd(3)} new sensors created       ║`);
    console.log(`║             ${String(totalReadings).padEnd(3)} readings inserted         ║`);
    console.log('╚══════════════════════════════════════════════════╝\n');

    if (summary.length > 0) {
        console.log('City                        | State                | AQI | Sensor');
        console.log('----------------------------|----------------------|-----|' + '-'.repeat(30));
        for (const r of summary) {
            console.log(
                `${r.city.padEnd(28)}| ${r.state.padEnd(21)}| ${String(r.aqi ?? '-').padEnd(4)}| ${r.sensorName}`
            );
        }
    }

    await pool.end();
    process.exit(0);
}

main().catch(err => {
    console.error('[Seed] Fatal:', err);
    pool.end();
    process.exit(1);
});
