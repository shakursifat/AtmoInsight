const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/disasters
// Accepts optional ?limit=N (default 100, max 500) and ?offset=N for pagination
router.get('/', async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
        const offset = Math.max(parseInt(req.query.offset) || 0,   0);

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
            LIMIT $1 OFFSET $2
        `;
        const result = await pool.query(query, [limit, offset]);
        res.json({ disasters: result.rows, limit, offset });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/disasters/summary
// Accepts optional ?subgroup= and ?year= filters
// Delegates to the get_disaster_impact_summary database function
router.get('/summary', async (req, res) => {
    try {
        const subgroup = req.query.subgroup != null && String(req.query.subgroup).trim() !== ''
            ? req.query.subgroup
            : null;
        const yearParam = req.query.year;
        let year =
            yearParam !== undefined && yearParam !== null && String(yearParam).trim() !== ''
                ? parseInt(yearParam, 10)
                : null;
        if (year !== null && !Number.isFinite(year)) {
            year = null;
        }

        const result = await pool.query(
            'SELECT * FROM get_disaster_impact_summary($1::text, $2::integer)',
            [subgroup, year]
        );
        res.json({ summary: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
