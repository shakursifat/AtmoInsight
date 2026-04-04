const express = require('express');
const router = express.Router();
const { getMeasurementTypes, getMeasurementUnits, getLocations } = require('../controllers/lookupController');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/lookup/measurement-types
router.get('/measurement-types', verifyToken, getMeasurementTypes);

// GET /api/lookup/measurement-units
router.get('/measurement-units', verifyToken, getMeasurementUnits);

// GET /api/lookup/locations
router.get('/locations', verifyToken, getLocations);

module.exports = router;
