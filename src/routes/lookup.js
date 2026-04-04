const express = require('express');
const router = express.Router();
const { getMeasurementTypes, getMeasurementUnits } = require('../controllers/lookupController');
const { verifyToken } = require('../middleware/authMiddleware');
const pool = require('../db/pool');

// GET /api/lookup/measurement-types
router.get('/measurement-types', verifyToken, getMeasurementTypes);

// GET /api/lookup/measurement-units
router.get('/measurement-units', verifyToken, getMeasurementUnits);

// GET /api/lookup/locations
router.get('/locations', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                location_id, 
                name, 
                address, 
                ST_Y(coordinates::geometry) AS latitude, 
                ST_X(coordinates::geometry) AS longitude 
            FROM location 
            ORDER BY name
        `;
        const result = await pool.query(query);
        res.json({ locations: result.rows });
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

module.exports = router;
