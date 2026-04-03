const express = require('express');
const router = express.Router();
const { getSensors, getSensorTypes, getLocations, createSensor, getNearbySensors } = require('../controllers/sensorsController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// GET /api/sensors - list sensors with optional filters
router.get('/', verifyToken, getSensors);

// GET /api/sensors/types - list all sensor types
router.get('/types', verifyToken, getSensorTypes);

// GET /api/sensors/locations - list all locations
router.get('/locations', verifyToken, getLocations);

// GET /api/sensors/nearby - find sensors near a coordinate (admin only)
// Query params: lat, lng, radius_metres (default 10000), measurement (optional)
router.get('/nearby', verifyToken, verifyAdmin, getNearbySensors);

// POST /api/sensors - create a new sensor (admin only)
router.post('/', verifyToken, verifyAdmin, createSensor);

module.exports = router;
