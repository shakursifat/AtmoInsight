const pool = require('../db/pool');
const { fetchAndStoreWeatherData } = require('../services/openMeteoService');
const { fetchAndStoreOpenAQData } = require('../services/openAQService');

const getAllReadings = async (req, res) => {
    try {
        const { sensor_id, measurement_type_id, unit_id, start, end, limit } = req.query;
        const maxLimit = parseInt(limit) || 200;

        let query = `
            SELECT 
                r.reading_id,
                r.sensor_id,
                r.timestamp,
                r.value,
                r.measurement_type_id,
                r.unit_id,
                mt.type_name AS measurement_type_name,
                mu.unit_name,
                mu.symbol AS unit_symbol
            FROM reading r
            LEFT JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
            LEFT JOIN measurementunit mu ON r.unit_id = mu.unit_id
            WHERE 1=1
        `;
        const params = [];

        if (sensor_id) {
            params.push(sensor_id);
            query += ` AND r.sensor_id = $${params.length}`;
        }
        if (measurement_type_id) {
            params.push(measurement_type_id);
            query += ` AND r.measurement_type_id = $${params.length}`;
        }
        if (unit_id) {
            params.push(unit_id);
            query += ` AND r.unit_id = $${params.length}`;
        }
        if (start) {
            params.push(start);
            query += ` AND r.timestamp >= $${params.length}`;
        }
        if (end) {
            params.push(end);
            query += ` AND r.timestamp <= $${params.length}`;
        }

        params.push(maxLimit);
        query += ` ORDER BY r.timestamp DESC LIMIT $${params.length}`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createReading = async (req, res) => {
    const client = await pool.connect();
    try {
        const { source_id, sensor_id, timestamp, value, measurement_type_id, unit_id } = req.body;

        await client.query('BEGIN');

        // Using actual neon schema fields: source_id, sensor_id, timestamp, value, measurement_type_id, unit_id
        const newReading = await client.query(
            `INSERT INTO reading (source_id, sensor_id, timestamp, value, measurement_type_id, unit_id) 
             VALUES ($1, $2, COALESCE($3, NOW()), $4, $5, $6) RETURNING *`,
            [source_id, sensor_id, timestamp, value, measurement_type_id, unit_id]
        );

        await client.query('COMMIT');

        // Alert real-time connected clients via attached socket
        if (req.io) {
            req.io.emit('new_reading', newReading.rows[0]);
        }

        res.status(201).json(newReading.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

const getWeeklyTrend = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                DATE(r.timestamp) AS day,
                r.measurement_type_id,
                mt.type_name,
                ROUND(AVG(r.value)::numeric, 2) AS avg_value
            FROM reading r
            LEFT JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
            WHERE r.timestamp >= NOW() - INTERVAL '7 days'
            GROUP BY DATE(r.timestamp), r.measurement_type_id, mt.type_name
            ORDER BY day ASC, r.measurement_type_id
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateWeather = async (req, res) => {
    try {
        const result = await fetchAndStoreWeatherData();
        if (result?.status === 'error') return res.status(500).json(result);
        if (req.io) req.io.emit('sensor_update', { source: 'update-weather', timestamp: new Date().toISOString() });
        res.status(200).json(result || { status: 'success' });
    } catch (error) {
        console.error('[readings] update-weather error:', error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
};

const updateAirQuality = async (req, res) => {
    try {
        const result = await fetchAndStoreOpenAQData();
        if (result?.status === 'error') return res.status(500).json(result);
        if (req.io) req.io.emit('sensor_update', { source: 'update-air-quality', timestamp: new Date().toISOString() });
        res.status(200).json(result || { status: 'success' });
    } catch (error) {
        console.error('[readings] update-air-quality error:', error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
};

const getTimeseries = async (req, res) => {
    try {
        const { sensorId } = req.params;
        const type = req.query.type;
        const days = parseInt(req.query.days) || 30;

        if (!type) {
            return res.status(400).json({ error: 'measurement type is required' });
        }

        const query = `
SELECT
  DATE_TRUNC('day', r.timestamp) AS date,
  ROUND(AVG(r.value)::numeric, 2) AS avg_value,
  ROUND(MIN(r.value)::numeric, 2) AS min_value,
  ROUND(MAX(r.value)::numeric, 2) AS max_value,
  COUNT(*) AS reading_count
FROM reading r
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
WHERE r.sensor_id = $1
  AND mt.type_name = $2
  AND r.timestamp >= NOW() - ($3 || ' days')::INTERVAL
GROUP BY DATE_TRUNC('day', r.timestamp)
ORDER BY date DESC;
        `;
        const result = await pool.query(query, [sensorId, type, days]);
        res.json({
            sensor_id: sensorId,
            measurement_type: type,
            days,
            data: result.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getAllReadings,
    createReading,
    getWeeklyTrend,
    updateWeather,
    updateAirQuality,
    getTimeseries
};
