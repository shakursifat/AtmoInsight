const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { getAllAlerts, createAlert } = require('../controllers/alertsController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// GET /api/alerts/active
router.get('/active', async (req, res) => {
    try {
        const query = `
            SELECT 
                a.alert_id,
                a.severity,
                a.timestamp AS alert_time,
                at.type_name AS alert_type,
                a.message,
                r.value AS trigger_value,
                mt.type_name AS measurement,
                mu.symbol AS unit,
                s.sensor_id,
                s.name AS sensor_name,
                l.name AS location_name,
                l.region,
                ST_Y(l.coordinates::geometry) AS latitude,
                ST_X(l.coordinates::geometry) AS longitude
            FROM alert a
            JOIN alerttype at ON a.alert_type_id = at.alert_type_id
            JOIN reading r ON a.reading_id = r.reading_id
            JOIN sensor s ON r.sensor_id = s.sensor_id
            JOIN location l ON s.location_id = l.location_id
            JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
            JOIN measurementunit mu ON r.unit_id = mu.unit_id
            WHERE COALESCE(a.is_active, true) = true
              AND a.timestamp >= NOW() - INTERVAL '24 hours'
            ORDER BY a.timestamp DESC
        `;
        const result = await pool.query(query);

        if (result.rows.length < 5) {
            const fallbackQuery = `
                SELECT 
                    a.alert_id,
                    a.severity,
                    a.timestamp AS alert_time,
                    at.type_name AS alert_type,
                    a.message,
                    r.value AS trigger_value,
                    mt.type_name AS measurement,
                    mu.symbol AS unit,
                    s.sensor_id,
                    s.name AS sensor_name,
                    l.name AS location_name,
                    l.region,
                    ST_Y(l.coordinates::geometry) AS latitude,
                    ST_X(l.coordinates::geometry) AS longitude
                FROM alert a
                JOIN alerttype at ON a.alert_type_id = at.alert_type_id
                JOIN reading r ON a.reading_id = r.reading_id
                JOIN sensor s ON r.sensor_id = s.sensor_id
                JOIN location l ON s.location_id = l.location_id
                JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
                JOIN measurementunit mu ON r.unit_id = mu.unit_id
                WHERE COALESCE(a.is_active, true) = true
                ORDER BY a.timestamp DESC
                LIMIT 20
            `;
            const fallbackResult = await pool.query(fallbackQuery);
            return res.json({ alerts: fallbackResult.rows });
        }

        res.json({ alerts: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/', verifyToken, getAllAlerts);
router.post('/', [verifyToken, verifyAdmin], createAlert);

module.exports = router;
