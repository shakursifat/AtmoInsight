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
            `INSERT INTO alert (reading_id, alert_type_id, timestamp, message, severity) 
       VALUES ($1, $2, COALESCE($3, NOW()), $4, $5) RETURNING *`,
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
