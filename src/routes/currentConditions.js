const express = require('express');
const router = express.Router();
const { getCurrentConditions } = require('../controllers/currentConditionsController');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/current-conditions?location_id=<id>
// Fetches OpenWeatherMap current weather + air pollution, stores readings, returns JSON.
// GET /api/current-conditions (no query)
// Returns the latest reading for each unique measurement type across all active sensors.
router.get('/', verifyToken, getCurrentConditions);

module.exports = router;
