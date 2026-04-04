const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/disasters
// Accepts optional ?limit=N (default 500, max 1000), ?offset=N for pagination, and ?subgroup=
router.get('/', async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 500, 1000);
        const offset = Math.max(parseInt(req.query.offset) || 0,   0);
        const subgroup = req.query.subgroup;

        let conditions = [];
        let params = [];
        
        if (subgroup) {
            conditions.push(`ds.subgroup_name ILIKE $${params.length + 1}`);
            params.push(subgroup);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
            ${whereClause}
            ORDER BY d.start_timestamp DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        params.push(limit, offset);

        const result = await pool.query(query, params);
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

// PATCH /api/disasters/:id/impact
router.patch('/:id/impact', async (req, res) => {
    try {
        const eventId = req.params.id;
        const { field, value } = req.body;
        
        const validFields = ['deaths', 'injuries', 'affected_people', 'economic_loss'];
        if (!validFields.includes(field)) {
            return res.status(400).json({ error: 'Invalid field' });
        }
        
        const numValue = value === '' || value === null ? null : Number(value);

        const query = `
            INSERT INTO disasterimpact (event_id, ${field})
            VALUES ($1, $2)
            ON CONFLICT (event_id)
            DO UPDATE SET ${field} = EXCLUDED.${field}
            RETURNING *;
        `;
        const result = await pool.query(query, [eventId, numValue]);
        res.json({ updated: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
