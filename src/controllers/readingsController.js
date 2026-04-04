const pool = require('../db/pool');

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

module.exports = {
    getAllReadings,
    createReading,
    getWeeklyTrend
};
