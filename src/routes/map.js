const express = require('express');
const router = express.Router();
const { getSensorLocations } = require('../controllers/mapController');

// GET /api/map/sensors (Public or Token protected depending on preference)
router.get('/sensors', getSensorLocations);

module.exports = router;
