const pool = require('../db/pool');

const getAllAlerts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const result = await pool.query(
            'SELECT * FROM alert ORDER BY timestamp DESC LIMIT $1',
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createAlert = async (req, res) => {
    try {
        const { reading_id, alert_type_id, timestamp, message, severity } = req.body;

        const newAlert = await pool.query(
            `INSERT INTO alert (reading_id, alert_type_id, timestamp, message, severity, sensor_id, is_active, last_triggered_at)
             VALUES ($1, $2, COALESCE($3, NOW()), $4, $5,
               (SELECT sensor_id FROM reading WHERE reading_id = $1),
               true, NOW())
             RETURNING *`,
            [reading_id, alert_type_id, timestamp, message, severity]
        );

        // Broadcast using websockets
        if (req.io) {
            req.io.emit('new_alert', newAlert.rows[0]);
        }

        res.status(201).json(newAlert.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getAllAlerts,
    createAlert
};
