const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/disasters
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT 
                d.event_id, 
                dt.type_name AS disaster_type, 
                ds.subgroup_name AS subgroup, 
                d.severity, 
                d.start_timestamp, 
                d.end_timestamp, 
                d.description, 
                l.name AS location_name, 
                l.region,
                ST_Y(l.coordinates::geometry) AS latitude,
                ST_X(l.coordinates::geometry) AS longitude,
                di.deaths, 
                di.injuries, 
                di.affected_people, 
                di.economic_loss
            FROM disasterevent d
            JOIN disastertype dt ON d.disaster_type_id = dt.type_id
            JOIN disastersubgroup ds ON dt.subgroup_id = ds.subgroup_id
            JOIN location l ON d.location_id = l.location_id
            LEFT JOIN disasterimpact di ON d.event_id = di.event_id
            ORDER BY d.start_timestamp DESC
        `;
        const result = await pool.query(query);
        res.json({ disasters: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/disasters/summary
router.get('/summary', async (req, res) => {
    try {
        const query = `SELECT * FROM get_disaster_impact_summary(NULL, NULL)`;
        const result = await pool.query(query);
        res.json({ summary: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
