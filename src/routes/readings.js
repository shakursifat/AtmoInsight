const express = require('express');
const router = express.Router();
const { getAllReadings, createReading, getWeeklyTrend, updateWeather, updateAirQuality, getTimeseries } = require('../controllers/readingsController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// GET /api/readings/weekly-trend
router.get('/weekly-trend', verifyToken, getWeeklyTrend);

// GET /api/readings — authenticated users only
router.get('/', verifyToken, getAllReadings);

// POST /api/readings — admin only manual insert
router.post('/', [verifyToken, verifyAdmin], createReading);

// POST /api/readings/update-weather — trigger Open-Meteo sync manually
router.post('/update-weather', verifyToken, updateWeather);

// GET /api/readings/update-air-quality — trigger OpenAQ sync manually
router.get('/update-air-quality', verifyToken, updateAirQuality);

// GET /api/readings/timeseries/:sensorId
router.get('/timeseries/:sensorId', verifyToken, getTimeseries);

module.exports = router;
