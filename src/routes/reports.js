const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken, roleGuard } = require('../middleware/authMiddleware');

// POST /api/reports/submit
router.post('/submit', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { description, location_id, latitude, longitude, location_name } = req.body;
        const user_id = req.user.user_id;

        if (!description || description.trim() === '') {
            return res.status(400).json({ error: 'Description is required' });
        }

        if (!location_id && (latitude == null || longitude == null)) {
            return res.status(400).json({ error: 'Either location_id OR (latitude and longitude) must be provided' });
        }

        let final_location_id = location_id;

        await client.query('BEGIN');

        if (!final_location_id) {
            // Insert a new location
            const locName = location_name || "User-reported location";
            const insertLocQuery = `
                INSERT INTO location (name, coordinates)
                VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326))
                RETURNING location_id
            `;
            const locRes = await client.query(insertLocQuery, [locName, longitude, latitude]);
            final_location_id = locRes.rows[0].location_id;
        }

        const insertReportQuery = `
            INSERT INTO userreport (user_id, description, location_id, status_id)
            VALUES ($1, $2, $3, 1)
            RETURNING report_id, timestamp
        `;
        const repRes = await client.query(insertReportQuery, [user_id, description, final_location_id]);
        
        await client.query('COMMIT');

        const { report_id, timestamp } = repRes.rows[0];

        // Fetch the created report with joins for return value
        const getReportQuery = `
            SELECT ur.report_id, ur.description, l.name AS location_name, rs.status_name AS status, ur.timestamp
            FROM userreport ur
            JOIN location l ON ur.location_id = l.location_id
            JOIN reportstatus rs ON ur.status_id = rs.status_id
            WHERE ur.report_id = $1
        `;
        const finalRes = await client.query(getReportQuery, [report_id]);

        res.status(201).json({ report: finalRes.rows[0] });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error submitting report:', error);
        res.status(500).json({ error: 'Failed to submit report' });
    } finally {
        client.release();
    }
});

// GET /api/reports/my
router.get('/my', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                ur.report_id, 
                ur.description, 
                l.name AS location_name, 
                ST_Y(l.coordinates::geometry) AS latitude, 
                ST_X(l.coordinates::geometry) AS longitude, 
                rs.status_name AS status, 
                ur.timestamp
            FROM userreport ur
            JOIN location l ON ur.location_id = l.location_id
            JOIN reportstatus rs ON ur.status_id = rs.status_id
            WHERE ur.user_id = $1
            ORDER BY ur.timestamp DESC
        `;
        const result = await pool.query(query, [req.user.user_id]);
        res.json({ reports: result.rows });
    } catch (error) {
        console.error('Error fetching my reports:', error);
        res.status(500).json({ error: 'Failed to fetch your reports' });
    }
});

// GET /api/reports/all
router.get('/all', [verifyToken, roleGuard(['Admin', 'Scientist'])], async (req, res) => {
    try {
        const query = `
            SELECT 
                ur.report_id, 
                ur.description, 
                l.name AS location_name, 
                ST_Y(l.coordinates::geometry) AS latitude, 
                ST_X(l.coordinates::geometry) AS longitude, 
                rs.status_name AS status, 
                ur.timestamp,
                u.username,
                u.email
            FROM userreport ur
            JOIN location l ON ur.location_id = l.location_id
            JOIN reportstatus rs ON ur.status_id = rs.status_id
            JOIN users u ON ur.user_id = u.user_id
            ORDER BY ur.timestamp DESC
        `;
        const result = await pool.query(query);
        res.json({ reports: result.rows });
    } catch (error) {
        console.error('Error fetching all reports:', error);
        res.status(500).json({ error: 'Failed to fetch all reports' });
    }
});

// PUT /api/reports/:id/status
router.put('/:id/status', [verifyToken, roleGuard(['Admin', 'Scientist'])], async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status_id } = req.body;

        await client.query('BEGIN');

        const updated = await client.query(
            'UPDATE userreport SET status_id = $1 WHERE report_id = $2 RETURNING *',
            [status_id, id]
        );

        if (updated.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Report not found' });
        }

        await client.query('COMMIT');
        res.json({ message: 'Report status updated', report: updated.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating report status:', error);
        res.status(500).json({ error: 'Failed to update report status' });
    } finally {
        client.release();
    }
});

module.exports = router;
