const pool = require('../db/pool');

const createReport = async (req, res) => {
    try {
        const { location_id, description } = req.body;
        const user_id = req.user.user_id || req.user.id; // From JWT

        // Assume 1 = Pending, 2 = In Review, 3 = Resolved based on standard schemas
        const newReport = await pool.query(
            `INSERT INTO userreport (user_id, location_id, timestamp, description, status_id) 
       VALUES ($1, $2, NOW(), $3, 1) RETURNING *`,
            [user_id, location_id || 1, description]
        );

        res.status(201).json(newReport.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getAllReports = async (req, res) => {
    try {
        const user_id = req.user.user_id || req.user.id;
        const isAdmin = req.user.role_id === 1 || req.user.role_name === 'Admin' || req.user.role === 'admin';

        let query = `
            SELECT ur.*, u.username 
            FROM userreport ur
            LEFT JOIN users u ON ur.user_id = u.user_id
        `;
        let params = [];

        if (!isAdmin) {
            query += ` WHERE ur.user_id = $1`;
            params.push(user_id);
        }

        query += ` ORDER BY ur.timestamp DESC LIMIT 50`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateReportStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status_id } = req.body;

        const updated = await pool.query(
            'UPDATE userreport SET status_id = $1 WHERE report_id = $2 RETURNING *',
            [status_id, id]
        );

        if (updated.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        res.json(updated.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    createReport,
    getAllReports,
    updateReportStatus
};
