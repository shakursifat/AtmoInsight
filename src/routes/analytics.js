const express = require('express');
const router = express.Router();
const { getDailyAverages } = require('../controllers/analyticsController');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/analytics/daily
router.get('/daily', verifyToken, getDailyAverages);

module.exports = router;
