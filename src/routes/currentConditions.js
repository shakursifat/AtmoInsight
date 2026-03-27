const express = require('express');
const router = express.Router();
const { fetchCurrentConditionsByLocation } = require('../services/openWeatherService');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/current-conditions?location_id=XX
// Returns dashboard format specifically crafted for AtmoInsight location
router.get('/', verifyToken, async (req, res) => {
    const locationId = req.query.location_id;
    if (!locationId) {
        return res.status(400).json({ status: 'error', message: 'Query parameter location_id is required' });
    }

    try {
        const result = await fetchCurrentConditionsByLocation(locationId);
        res.status(200).json(result);
    } catch (error) {
        console.error('API Error fetching current conditions:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Internal Server Error' });
    }
});

module.exports = router;
