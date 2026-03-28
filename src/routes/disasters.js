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

        const query = `
            SELECT
                ds.subgroup_name::TEXT AS subgroup,
                dt.type_name::TEXT AS disaster_type,
                COUNT(DISTINCT de.event_id) AS event_count,
                COALESCE(SUM(di.deaths), 0)::BIGINT AS total_deaths,
                COALESCE(SUM(di.injuries), 0)::BIGINT AS total_injuries,
                COALESCE(SUM(di.affected_people), 0)::BIGINT AS total_affected,
                COALESCE(SUM(di.economic_loss), 0) AS total_economic_loss,
                MODE() WITHIN GROUP (ORDER BY de.severity) AS avg_severity
            FROM disasterevent de
            JOIN disastertype dt ON de.disaster_type_id = dt.type_id
            JOIN disastersubgroup ds ON dt.subgroup_id = ds.subgroup_id
            LEFT JOIN disasterimpact di ON de.event_id = di.event_id
            WHERE ($1::text IS NULL OR ds.subgroup_name ILIKE $1)
              AND ($2::integer IS NULL OR EXTRACT(YEAR FROM de.start_timestamp) = $2)
            GROUP BY ds.subgroup_name, dt.type_name
            ORDER BY total_deaths DESC, total_affected DESC`;

        const result = await pool.query(query, [subgroup, year]);
        res.json({ summary: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
