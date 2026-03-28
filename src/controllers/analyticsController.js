const pool = require('../db/pool');

const getDailyAverages = async (req, res) => {
    try {
        const sensor_id = parseInt(req.query.sensor_id);
        const limit = parseInt(req.query.limit) || 30;

        await pool.query('SELECT refresh_daily_sensor_averages()');

        let query = 'SELECT * FROM daily_sensor_averages';
        const values = [];

        if (sensor_id) {
            query += ' WHERE sensor_id = $1';
            values.push(sensor_id);
        }

        query += ` ORDER BY reading_date ASC LIMIT $${values.length > 0 ? 2 : 1}`;
        values.push(limit);

        const result = await pool.query(query, values);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getPollutionAverage = async (req, res) => {
    try {
        const locationId = req.query.location_id;
        if (locationId === undefined || locationId === null || String(locationId).trim() === '') {
            return res.status(400).json({ error: 'location_id is required' });
        }
        const type = req.query.type || 'PM2.5';
        const interval = req.query.interval || '30 days';

        const result = await pool.query(
            'SELECT * FROM get_pollution_average($1::integer, $2::text, $3::interval)',
            [parseInt(locationId, 10), type, interval]
        );

        if (result.rows.length === 0) {
            return res.json({ data: null });
        }

        res.json({ data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getNearbySensors = async (req, res) => {
    try {
        const { lng, lat } = req.query;
        if (lng === undefined || lng === null || String(lng).trim() === '') {
            return res.status(400).json({ error: 'lng is required' });
        }
        if (lat === undefined || lat === null || String(lat).trim() === '') {
            return res.status(400).json({ error: 'lat is required' });
        }

        const radius = req.query.radius != null ? parseFloat(req.query.radius) : 10000;
        const typeParam = req.query.type;
        const type = typeParam === undefined || typeParam === '' ? null : typeParam;

        const result = await pool.query(
            'SELECT * FROM get_nearby_sensors($1::float8, $2::float8, $3::float8, $4::text)',
            [parseFloat(lng), parseFloat(lat), radius, type]
        );

        res.json({ sensors: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getMonthlyTrend = async (req, res) => {
    try {
        const type = req.query.type || 'PM2.5';
        const months = parseInt(req.query.months, 10) || 12;

        const query = `
SELECT
  DATE_TRUNC('month', r.timestamp) AS month,
  l.region,
  ROUND(AVG(r.value)::numeric, 2) AS avg_value,
  COUNT(*) AS reading_count,
  CASE WHEN AVG(r.value) > 75 THEN 'EXCEEDS WHO LIMIT' ELSE 'WITHIN LIMIT' END AS who_status
FROM reading r
JOIN sensor s ON r.sensor_id = s.sensor_id
JOIN location l ON s.location_id = l.location_id
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
WHERE mt.type_name = $1
  AND r.timestamp >= NOW() - ($2::integer * INTERVAL '1 month')
GROUP BY DATE_TRUNC('month', r.timestamp), l.region
ORDER BY month DESC, avg_value DESC`;

        const result = await pool.query(query, [type, months]);

        res.json({ type, months, data: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getSatelliteCorrelation = async (req, res) => {
    try {
        const query = `
SELECT
  so.obs_id,
  so.timestamp AS satellite_time,
  so.resolution,
  so.data_json ->> 'satellite' AS satellite_name,
  (so.data_json ->> 'aod')::numeric AS aerosol_optical_depth,
  r.value AS ground_pm25,
  r.timestamp AS ground_reading_time,
  s.name AS sensor_name,
  l.name AS location_name
FROM satelliteobservation so
JOIN reading r ON so.reading_id = r.reading_id
JOIN sensor s ON r.sensor_id = s.sensor_id
JOIN location l ON s.location_id = l.location_id
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
WHERE mt.type_name = 'PM2.5'
  AND so.data_json ? 'aod'
ORDER BY so.timestamp`;

        const result = await pool.query(query);
        res.json({ correlations: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getClimateIndicators = async (req, res) => {
    try {
        const query = `
SELECT
  ci.indicator_id, ci.name, ci.value, ci.period,
  mt.type_name AS measurement_type,
  ha.avg_value AS period_avg, ha.max_value AS period_max, ha.min_value AS period_min
FROM climateindicator ci
JOIN historicalaggregation ha ON ci.agg_id = ha.agg_id
JOIN measurementtype mt ON ha.measurement_type_id = mt.measurement_type_id
ORDER BY ci.period`;

        const result = await pool.query(query);
        res.json({ indicators: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getDailyAverages,
    getPollutionAverage,
    getNearbySensors,
    getMonthlyTrend,
    getSatelliteCorrelation,
    getClimateIndicators
};
