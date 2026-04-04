const express = require('express');
const router = express.Router();
const {
    getDailyAverages,
    getPollutionAverage,
    getNearbySensors,
    getMonthlyTrend,
    getSatelliteCorrelation,
    getClimateIndicators
} = require('../controllers/analyticsController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/pollution-average', verifyToken, getPollutionAverage);
router.get('/nearby-sensors', verifyToken, getNearbySensors);
router.get('/monthly-trend', verifyToken, getMonthlyTrend);
router.get('/satellite-correlation', verifyToken, getSatelliteCorrelation);
router.get('/climate-indicators', verifyToken, getClimateIndicators);

router.get('/daily', verifyToken, getDailyAverages);

module.exports = router;
