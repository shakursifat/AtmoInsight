const pool = require('../db/pool');

const getAllReadings = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        // Matches the actual public.reading table schema structure
        const result = await pool.query(
            'SELECT * FROM reading ORDER BY timestamp DESC LIMIT $1',
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createReading = async (req, res) => {
    try {
        const { source_id, sensor_id, timestamp, value, measurement_type_id, unit_id } = req.body;

        // Using actual neon schema fields: source_id, sensor_id, timestamp, value, measurement_type_id, unit_id
        const newReading = await pool.query(
            `INSERT INTO reading (source_id, sensor_id, timestamp, value, measurement_type_id, unit_id) 
       VALUES ($1, $2, COALESCE($3, NOW()), $4, $5, $6) RETURNING *`,
            [source_id, sensor_id, timestamp, value, measurement_type_id, unit_id]
        );

        // Alert real-time connected clients via attached socket
        if (req.io) {
            req.io.emit('new_reading', newReading.rows[0]);
        }

        res.status(201).json(newReading.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getAllReadings,
    createReading
};
