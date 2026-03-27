const express = require('express');
const router = express.Router();
const { getAllReadings, createReading, getWeeklyTrend } = require('../controllers/readingsController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { fetchAndStoreWeatherData } = require('../services/openMeteoService');
const { fetchAndStoreOpenAQData } = require('../services/openAQService');

// GET /api/readings/weekly-trend — daily averages per measurement type for last 7 days
router.get('/weekly-trend', verifyToken, getWeeklyTrend);


// GET /api/readings
// Allow only authenticated users to view readings
router.get('/', verifyToken, getAllReadings);

// POST /api/readings
// Example: Only authenticated admins can manually post standard readings
router.post('/', [verifyToken, verifyAdmin], createReading);

// POST /api/readings/update-weather
// Manually fetch and update weather data from Open-Meteo
router.post('/update-weather', verifyToken, async (req, res) => {
    try {
        const result = await fetchAndStoreWeatherData();
        if (result && result.status === 'error') {
            return res.status(500).json(result);
        }
        res.status(200).json(result || { status: 'success' });
    } catch (error) {
        console.error('API Error updating weather:', error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

// GET /api/readings/update-air-quality
// Manually fetch and update data through OpenAQ 
router.get('/update-air-quality', verifyToken, async (req, res) => {
    try {
        const result = await fetchAndStoreOpenAQData();
        if (result && result.status === 'error') {
            return res.status(500).json(result);
        }
        res.status(200).json(result || { status: 'success' });
    } catch (error) {
        console.error('API Error updating air quality:', error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

module.exports = router;
