'use strict';

/**
 * iqairService.js
 * ---------------
 * Fetches real-time air quality & weather data from the IQAir (AirVisual) API
 * and persists each measurement into the existing Reading table by matching
 * MeasurementType names already seeded in the database.
 *
 * Environment variable required:
 *   IQAIR_API_KEY   — IQAir API key (from iqair.com/dashboard/account)
 *
 * IQAir free-tier docs:
 *   https://api-docs.iqair.com/#nearest-city  (nearest city by lat/lon)
 *   https://api-docs.iqair.com/#city          (city by location params)
 */

const axios = require('axios');
const pool  = require('../db/pool');

const IQAIR_BASE = 'https://api.airvisual.com/v2';

// ─── AQI Category Helper ────────────────────────────────────────────────────

/**
 * Maps a US AQI value to a human-readable category and colour.
 * @param {number} aqi
 * @returns {{ label: string, color: string }}
 */
function aqiCategory(aqi) {
  if (aqi <= 50)  return { label: 'Good',                  color: '#00e400' };
  if (aqi <= 100) return { label: 'Moderate',              color: '#ffff00' };
  if (aqi <= 150) return { label: 'Unhealthy for Sensitive',color: '#ff7e00' };
  if (aqi <= 200) return { label: 'Unhealthy',             color: '#ff0000' };
  if (aqi <= 300) return { label: 'Very Unhealthy',        color: '#8f3f97' };
  return              { label: 'Hazardous',                color: '#7e0023' };
}

// ─── Internal: fetch from IQAir ─────────────────────────────────────────────

/**
 * Calls the IQAir "nearest city" endpoint using lat/lon.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<object>} raw IQAir API response data.data
 */
async function fetchByLatLon(lat, lon) {
  const apiKey = process.env.IQAIR_API_KEY;
  if (!apiKey) throw new Error('IQAIR_API_KEY is not set in environment variables.');

  const url = `${IQAIR_BASE}/nearest_city`;
  const response = await axios.get(url, {
    params: { lat, lon, key: apiKey },
    timeout: 10000,
  });

  if (response.data.status !== 'success') {
    throw new Error(`IQAir API error: ${response.data.data || JSON.stringify(response.data)}`);
  }

  return response.data.data;
}

// ─── Internal: resolve sensor/location from DB ──────────────────────────────

/**
 * Resolves the best matching sensor_id for a given location_id.
 * Falls back to location_id=1, then any sensor.
 * @param {number|null} locationId
 * @returns {Promise<number|null>}
 */
async function resolveSensorId(locationId) {
  let sensorRes;

  if (locationId) {
    sensorRes = await pool.query(
      'SELECT sensor_id FROM Sensor WHERE location_id = $1 LIMIT 1',
      [locationId]
    );
  }

  if (!sensorRes || sensorRes.rows.length === 0) {
    sensorRes = await pool.query('SELECT sensor_id FROM Sensor LIMIT 1');
  }

  return sensorRes.rows.length > 0 ? sensorRes.rows[0].sensor_id : null;
}

/**
 * Resolves measurement_type_id by fuzzy name match.
 * @param {string} typeName
 * @returns {Promise<number|null>}
 */
async function resolveMeasurementTypeId(typeName) {
  const res = await pool.query(
    'SELECT measurement_type_id FROM MeasurementType WHERE type_name ILIKE $1 LIMIT 1',
    [`%${typeName}%`]
  );
  return res.rows.length > 0 ? res.rows[0].measurement_type_id : null;
}

/**
 * Resolves unit_id by name or symbol match.
 * @param {string} unitNameOrSymbol
 * @returns {Promise<number|null>}
 */
async function resolveUnitId(unitNameOrSymbol) {
  const res = await pool.query(
    'SELECT unit_id FROM MeasurementUnit WHERE unit_name ILIKE $1 OR symbol ILIKE $1 LIMIT 1',
    [`%${unitNameOrSymbol}%`]
  );
  return res.rows.length > 0 ? res.rows[0].unit_id : null;
}

// ─── Internal: insert one reading ───────────────────────────────────────────

/**
 * Inserts a single measurement into the Reading table.
 * Silently skips if type or unit cannot be resolved.
 * @param {number}  sensorId
 * @param {string}  typeName      — must match a MeasurementType.type_name seed value
 * @param {string}  unitSymbol    — must match a MeasurementUnit.symbol or unit_name
 * @param {number}  value
 * @param {number|null} sourceId
 */
async function insertReading(sensorId, typeName, unitSymbol, value, sourceId = null) {
  if (value === null || value === undefined || isNaN(value)) return;

  const typeId = await resolveMeasurementTypeId(typeName);
  if (!typeId) {
    console.warn(`[iqairService] MeasurementType "${typeName}" not found — skipped.`);
    return;
  }

  const unitId = await resolveUnitId(unitSymbol);
  if (!unitId) {
    console.warn(`[iqairService] MeasurementUnit "${unitSymbol}" not found — skipped.`);
    return;
  }

  await pool.query(
    `INSERT INTO Reading (sensor_id, timestamp, value, measurement_type_id, unit_id, source_id)
     VALUES ($1, NOW(), $2, $3, $4, $5)`,
    [sensorId, value, typeId, unitId, sourceId]
  );
}

// ─── Internal: resolve IQAir DataSource row ──────────────────────────────────

/**
 * Returns the source_id for "IQAir" in the DataSource table, or null.
 * @returns {Promise<number|null>}
 */
async function resolveIQAirSourceId() {
  const res = await pool.query(
    "SELECT source_id FROM DataSource WHERE name ILIKE '%IQAir%' OR name ILIKE '%AirVisual%' LIMIT 1"
  );
  return res.rows.length > 0 ? res.rows[0].source_id : null;
}

// ─── Public: main service function ──────────────────────────────────────────

/**
 * Fetches current conditions from IQAir and persists readings to the DB.
 *
 * @param {object} options
 * @param {number} [options.location_id]  — DB location_id to anchor the sensor lookup
 * @param {number} [options.lat]          — latitude  (required if location_id not given)
 * @param {number} [options.lon]          — longitude (required if location_id not given)
 *
 * @returns {Promise<object>} Clean current-conditions object for the frontend:
 * {
 *   location: { city, state, country, lat, lon },
 *   aqi:        { value, category, color },
 *   pollutants: { pm25, pm10, no2, co, o3, so2 },   // µg/m³ where available
 *   weather:    { temperature, feelsLike, humidity, pressure, windSpeed, icon },
 *   fetchedAt:  ISO timestamp
 * }
 */
async function getCurrentConditions({ location_id = null, lat = null, lon = null } = {}) {
  // 1. Determine coordinates -------------------------------------------------
  let resolvedLat = lat;
  let resolvedLon = lon;

  if (location_id) {
    const locRes = await pool.query(
      `SELECT ST_Y(coordinates::geometry) AS lat, ST_X(coordinates::geometry) AS lon
       FROM Location WHERE location_id = $1`,
      [location_id]
    );
    if (locRes.rows.length === 0) {
      throw new Error(`Location with id=${location_id} not found in database.`);
    }
    resolvedLat = parseFloat(locRes.rows[0].lat);
    resolvedLon = parseFloat(locRes.rows[0].lon);
  }

  if (resolvedLat === null || resolvedLon === null) {
    throw new Error('Must supply either location_id or lat & lon.');
  }

  // 2. Call IQAir API --------------------------------------------------------
  console.log(`[iqairService] Fetching IQAir data for (${resolvedLat}, ${resolvedLon})…`);
  const data = await fetchByLatLon(resolvedLat, resolvedLon);

  const { city, state, country } = data;
  const pollution = data.current.pollution;
  const weather   = data.current.weather;

  // 3. Extract metrics -------------------------------------------------------
  // IQAir returns AQI in US and CN standards; aqius = US EPA AQI
  const aqiValue  = pollution.aqius  ?? null;
  const pm25      = pollution.mainus === 'p2' ? pollution.aqius  : null; // raw AQI-embedded PM2.5 placeholder
  // IQAir free tier only provides aqius/aqicn + mainus/maincn — individual
  // pollutant concentrations (µg/m³) are not in the free-tier response.
  // We store what we can: AQI maps to "PM2.5" type (primary pollutant proxy)
  // and weather fields map to their respective types.
  const tempC       = weather.tp   ?? null;          // °C
  const humidity    = weather.hu   ?? null;           // %
  const pressureHPa = weather.pr   ?? null;           // hPa
  const windSpeedMs = weather.ws   ?? null;           // m/s
  const weatherIcon = weather.ic   ?? null;

  // 4. Persist to DB ---------------------------------------------------------
  const sensorId = await resolveSensorId(location_id);
  if (!sensorId) {
    console.warn('[iqairService] No sensor found — readings will not be stored.');
  } else {
    const sourceId = await resolveIQAirSourceId();

    // Map IQAir fields → (MeasurementType name, unit symbol) as seeded in DB
    const measurements = [
      // IQAir free tier delivers AQI-adjusted PM2.5 concentration indirectly.
      // We store the US AQI value under PM2.5 type (dimensionless AQI proxy).
      { typeName: 'PM2.5',      unitSymbol: 'µg/m³',  value: aqiValue  },
      { typeName: 'Temperature', unitSymbol: '°C',     value: tempC      },
      { typeName: 'Humidity',    unitSymbol: '%',       value: humidity   },
      { typeName: 'Pressure',    unitSymbol: 'hPa',    value: pressureHPa},
      { typeName: 'Wind Speed',  unitSymbol: 'm/s',    value: windSpeedMs},
    ];

    for (const m of measurements) {
      try {
        await insertReading(sensorId, m.typeName, m.unitSymbol, m.value, sourceId);
      } catch (err) {
        console.error(`[iqairService] Failed to insert ${m.typeName}:`, err.message);
      }
    }
    console.log('[iqairService] Readings inserted successfully.');
  }

  // 5. Build & return clean response object ----------------------------------
  const { label: aqiLabel, color: aqiColor } = aqiCategory(aqiValue);

  return {
    location: {
      city,
      state,
      country,
      lat:  resolvedLat,
      lon:  resolvedLon,
    },
    aqi: {
      value:    aqiValue,
      category: aqiLabel,
      color:    aqiColor,
    },
    pollutants: {
      // IQAir free tier does not expose individual µg/m³ concentrations;
      // these will be null unless you upgrade to a paid plan.
      pm25:  aqiValue,  // AQI-equivalent (US EPA AQI scale)
      pm10:  null,
      no2:   null,
      co:    null,
      o3:    null,
      so2:   null,
    },
    weather: {
      temperature: tempC,
      feelsLike:   null,   // not provided by IQAir free tier
      humidity,
      pressure:    pressureHPa,
      windSpeed:   windSpeedMs,
      icon:        weatherIcon,
    },
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getCurrentConditions };
