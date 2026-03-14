const express = require('express');
const router = express.Router();
const { getSensors, getSensorTypes, getLocations } = require('../controllers/sensorsController');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/sensors - list sensors with optional filters
router.get('/', verifyToken, getSensors);

// GET /api/sensors/types - list all sensor types
router.get('/types', verifyToken, getSensorTypes);

// GET /api/sensors/locations - list all locations
router.get('/locations', verifyToken, getLocations);

module.exports = router;
