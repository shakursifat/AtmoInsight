const express = require('express');
const router = express.Router();
const { getAllReadings, createReading } = require('../controllers/readingsController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// GET /api/readings
// Allow only authenticated users to view readings
router.get('/', verifyToken, getAllReadings);

// POST /api/readings
// Example: Only authenticated admins can manually post standard readings
router.post('/', [verifyToken, verifyAdmin], createReading);

module.exports = router;
