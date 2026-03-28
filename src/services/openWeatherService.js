'use strict';

/**
 * OpenWeatherMap — current weather + air pollution.
 * Reads OPENWEATHER_API_KEY from the environment.
 * Persists into Reading by matching MeasurementType.type_name and MeasurementUnit.symbol.
 * Does not create new measurement types or units.
 */

const axios = require('axios');
const pool = require('../db/pool');

const OWM_BASE = 'https://api.openweathermap.org/data/2.5';

/** Maps payload keys to DB measurement type names and unit symbols (seed schema). */
const METRIC_MAP = {
  temperature: { typeName: 'Temperature', unitSymbol: '°C', category: 'met' },
  feels_like: { typeName: 'Feels Like', unitSymbol: '°C', category: 'met' },
  dew_point: { typeName: 'Dew Point', unitSymbol: '°C', category: 'met' },
  humidity: { typeName: 'Humidity', unitSymbol: '%', category: 'met' },
  pressure: { typeName: 'Pressure', unitSymbol: 'hPa', category: 'met' },
  wind_speed: { typeName: 'Wind Speed', unitSymbol: 'm/s', category: 'met' },
  aqi: { typeName: 'AQI', unitSymbol: '-', category: 'aq' },
  pm2_5: { typeName: 'PM2.5', unitSymbol: 'µg/m³', category: 'aq' },
  pm10: { typeName: 'PM10', unitSymbol: 'µg/m³', category: 'aq' },
  no2: { typeName: 'NO2', unitSymbol: 'µg/m³', category: 'aq' },
  co: { typeName: 'CO', unitSymbol: 'µg/m³', category: 'aq' },
  o3: { typeName: 'O3', unitSymbol: 'µg/m³', category: 'aq' },
  so2: { typeName: 'SO2', unitSymbol: 'µg/m³', category: 'aq' },
};

const typeIdCache = new Map();
const unitIdCache = new Map();

function owmAqiLabel(index) {
  const n = Number(index);
  if (n === 1) return 'Good';
  if (n === 2) return 'Fair';
  if (n === 3) return 'Moderate';
  if (n === 4) return 'Poor';
  if (n === 5) return 'Very Poor';
  return 'Unknown';
}

/** Magnus approximation for dew point (°C) from dry-bulb T (°C) and RH (%). */
function dewPointCelsius(tempC, humidityPct) {
  if (tempC == null || humidityPct == null || humidityPct <= 0) return null;
  const a = 17.27;
  const b = 237.7;
  const hs = Math.log(humidityPct / 100.0) + (a * tempC) / (b + tempC);
  const dp = (b * hs) / (a - hs);
  return Number.isFinite(dp) ? Math.round(dp * 100) / 100 : null;
}

async function resolveMeasurementTypeId(typeName) {
  if (typeIdCache.has(typeName)) return typeIdCache.get(typeName);
  const res = await pool.query(
    'SELECT measurement_type_id FROM measurementtype WHERE type_name = $1 LIMIT 1',
    [typeName]
  );
  const id = res.rows.length ? res.rows[0].measurement_type_id : null;
  typeIdCache.set(typeName, id);
  if (!id) console.warn(`[openWeatherService] MeasurementType "${typeName}" not found — skipped.`);
  return id;
}

async function resolveUnitId(unitSymbol) {
  if (unitIdCache.has(unitSymbol)) return unitIdCache.get(unitSymbol);
  const res = await pool.query(
    `SELECT unit_id FROM measurementunit
     WHERE symbol = $1 OR unit_name = $1
     LIMIT 1`,
    [unitSymbol]
  );
  const id = res.rows.length ? res.rows[0].unit_id : null;
  unitIdCache.set(unitSymbol, id);
  if (!id) console.warn(`[openWeatherService] MeasurementUnit for "${unitSymbol}" not found — skipped.`);
  return id;
}

/**
 * Prefer a Meteorological sensor for weather, Air Quality for pollutants; else first active sensor.
 */
async function resolveSensorId(locationId, category) {
  const typeName = category === 'aq' ? 'Air Quality' : 'Meteorological';
  const preferred = await pool.query(
    `SELECT s.sensor_id
     FROM sensor s
     JOIN sensortype st ON s.sensor_type_id = st.sensor_type_id
     WHERE s.location_id = $1 AND s.status IN ('Active', 'Maintenance') AND st.type_name = $2
     LIMIT 1`,
    [locationId, typeName]
  );
  if (preferred.rows.length) return preferred.rows[0].sensor_id;

  const fallback = await pool.query(
    `SELECT sensor_id FROM sensor WHERE location_id = $1 AND status IN ('Active', 'Maintenance') LIMIT 1`,
    [locationId]
  );
  return fallback.rows.length ? fallback.rows[0].sensor_id : null;
}

async function insertReading(sensorId, timestampIso, value, measurementTypeId, unitId) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
  const result = await pool.query(
    `INSERT INTO reading (sensor_id, timestamp, value, measurement_type_id, unit_id, source_id)
     SELECT $1, $2::timestamptz, $3, $4, $5, NULL
     WHERE NOT EXISTS (
       SELECT 1 FROM reading r
       WHERE r.sensor_id = $1
         AND r.timestamp = $2::timestamptz
         AND r.measurement_type_id = $4
     )`,
    [sensorId, timestampIso, value, measurementTypeId, unitId]
  );
  return result.rowCount || 0;
}

function buildPayloadFromOwm(weatherData, pollutionData) {
  const payload = {};

  if (weatherData?.main) {
    const m = weatherData.main;
    if (m.temp != null) payload.temperature = m.temp;
    if (m.feels_like != null) payload.feels_like = m.feels_like;
    if (m.humidity != null) payload.humidity = m.humidity;
    if (m.pressure != null) payload.pressure = m.pressure;
    const dp = m.dew_point != null ? m.dew_point : dewPointCelsius(m.temp, m.humidity);
    if (dp != null) payload.dew_point = dp;
  }
  if (weatherData?.wind?.speed != null) payload.wind_speed = weatherData.wind.speed;

  const entry = pollutionData?.list?.[0];
  if (entry) {
    if (entry.main?.aqi != null) payload.aqi = entry.main.aqi;
    const c = entry.components;
    if (c) {
      if (c.pm2_5 != null) payload.pm2_5 = c.pm2_5;
      if (c.pm10 != null) payload.pm10 = c.pm10;
      if (c.no2 != null) payload.no2 = c.no2;
      if (c.co != null) payload.co = c.co;
      if (c.o3 != null) payload.o3 = c.o3;
      if (c.so2 != null) payload.so2 = c.so2;
    }
  }

  return payload;
}

/**
 * Fetches OWM data for coordinates, inserts readings, returns a frontend-friendly object.
 * @param {number} locationId
 */
async function fetchCurrentConditionsByLocation(locationId) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    const err = new Error('OPENWEATHER_API_KEY is not set in environment variables.');
    err.code = 'MISSING_KEY';
    throw err;
  }

  const locRes = await pool.query(
    `SELECT location_id, name,
            ST_Y(coordinates::geometry) AS latitude,
            ST_X(coordinates::geometry) AS longitude
     FROM location
     WHERE location_id = $1 AND coordinates IS NOT NULL`,
    [locationId]
  );

  if (locRes.rows.length === 0) {
    const err = new Error(`Location ${locationId} not found or has no coordinates.`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  const location = locRes.rows[0];
  const { latitude: lat, longitude: lon } = location;

  const metSensorId = await resolveSensorId(locationId, 'met');
  const aqSensorId = await resolveSensorId(locationId, 'aq');
  if (!metSensorId && !aqSensorId) {
    const err = new Error(`No active sensor for location_id ${locationId}.`);
    err.code = 'NO_SENSOR';
    throw err;
  }

  const [weatherRes, pollutionRes] = await Promise.all([
    axios.get(`${OWM_BASE}/weather`, {
      params: { lat, lon, appid: apiKey, units: 'metric' },
      timeout: 15000,
      validateStatus: () => true,
    }),
    axios.get(`${OWM_BASE}/air_pollution`, {
      params: { lat, lon, appid: apiKey },
      timeout: 15000,
      validateStatus: () => true,
    }),
  ]);

  if (weatherRes.status !== 200) {
    const err = new Error(`OpenWeatherMap weather API failed: HTTP ${weatherRes.status}`);
    err.code = 'OWM_ERROR';
    err.details = weatherRes.data;
    throw err;
  }
  if (pollutionRes.status !== 200) {
    const err = new Error(`OpenWeatherMap air pollution API failed: HTTP ${pollutionRes.status}`);
    err.code = 'OWM_ERROR';
    err.details = pollutionRes.data;
    throw err;
  }

  const payload = buildPayloadFromOwm(weatherRes.data, pollutionRes.data);
  const timestampIso = new Date().toISOString();

  let inserted = 0;
  for (const [key, rawVal] of Object.entries(payload)) {
    const meta = METRIC_MAP[key];
    if (!meta) continue;

    const sensorId = meta.category === 'aq' ? aqSensorId : metSensorId;
    if (!sensorId) continue;

    const typeId = await resolveMeasurementTypeId(meta.typeName);
    const unitId = await resolveUnitId(meta.unitSymbol);
    if (!typeId || !unitId) continue;

    inserted += await insertReading(sensorId, timestampIso, rawVal, typeId, unitId);
  }

  const w = payload;
  return {
    location: {
      id: location.location_id,
      name: location.name,
      latitude: lat,
      longitude: lon,
    },
    fetched_at: timestampIso,
    weather: {
      temperature_c: w.temperature ?? null,
      feels_like_c: w.feels_like ?? null,
      dew_point_c: w.dew_point ?? null,
      humidity_percent: w.humidity ?? null,
      pressure_hpa: w.pressure ?? null,
      wind_speed_ms: w.wind_speed ?? null,
    },
    air_quality: {
      aqi_index: w.aqi ?? null,
      aqi_label: w.aqi != null ? owmAqiLabel(w.aqi) : null,
      pm2_5_ug_m3: w.pm2_5 ?? null,
      pm10_ug_m3: w.pm10 ?? null,
      no2_ug_m3: w.no2 ?? null,
      co_ug_m3: w.co ?? null,
      o3_ug_m3: w.o3 ?? null,
      so2_ug_m3: w.so2 ?? null,
    },
    database: { readings_inserted: inserted },
  };
}

/**
 * Fetches and stores OWM data for every location that has coordinates (cron / manual sync).
 */
async function fetchAndStoreCurrentConditions() {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    console.warn('[openWeatherService] OPENWEATHER_API_KEY missing — skipping.');
    return { status: 'skipped', message: 'OPENWEATHER_API_KEY missing' };
  }

  try {
    const locRes = await pool.query(
      `SELECT location_id FROM location WHERE coordinates IS NOT NULL`
    );

    let totalInserted = 0;
    const results = [];

    for (const row of locRes.rows) {
      try {
        const data = await fetchCurrentConditionsByLocation(row.location_id);
        const n = data.database?.readings_inserted ?? 0;
        totalInserted += n;
        results.push({
          location_id: row.location_id,
          location_name: data.location.name,
          inserted: n,
        });
      } catch (e) {
        console.warn(`[openWeatherService] location ${row.location_id}: ${e.message}`);
        results.push({ location_id: row.location_id, error: e.message });
      }
    }

    console.log(`[openWeatherService] Done. Total new readings: ${totalInserted}.`);
    return { status: 'success', count: totalInserted, data: results };
  } catch (error) {
    console.error('[openWeatherService] Fatal error:', error);
    return { status: 'error', message: error.message };
  }
}

module.exports = {
  fetchCurrentConditionsByLocation,
  fetchAndStoreCurrentConditions,
};
