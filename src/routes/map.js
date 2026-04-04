const express = require('express');
const router = express.Router();
const { getMapSensors, getMapDisasters } = require('../controllers/mapController');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/map/sensors
router.get('/sensors', verifyToken, getMapSensors);

// GET /api/map/disasters
router.get('/disasters', verifyToken, getMapDisasters);

module.exports = router;
