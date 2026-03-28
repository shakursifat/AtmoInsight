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

router.get('/pollution-average', getPollutionAverage);
router.get('/nearby-sensors', getNearbySensors);
router.get('/monthly-trend', getMonthlyTrend);
router.get('/satellite-correlation', getSatelliteCorrelation);
router.get('/climate-indicators', getClimateIndicators);

router.get('/daily', verifyToken, getDailyAverages);

module.exports = router;
