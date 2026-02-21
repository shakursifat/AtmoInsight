const pool = require('../db/pool');

const getDailyAverages = async (req, res) => {
    try {
        const sensor_id = parseInt(req.query.sensor_id);
        const limit = parseInt(req.query.limit) || 30; // defaults to 30 days

        // Refresh the view before querying to ensure we have the absolute latest data!
        await pool.query('SELECT refresh_daily_sensor_averages()');

        let query = 'SELECT * FROM daily_sensor_averages';
        let values = [];

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

module.exports = {
    getDailyAverages
};
