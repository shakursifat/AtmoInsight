const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { getAllReadings, createReading, getWeeklyTrend } = require('../controllers/readingsController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { fetchAndStoreWeatherData } = require('../services/openMeteoService');
const { fetchAndStoreOpenAQData } = require('../services/openAQService');

// GET /api/readings/weekly-trend
router.get('/weekly-trend', verifyToken, getWeeklyTrend);

// GET /api/readings — authenticated users only
router.get('/', verifyToken, getAllReadings);

// POST /api/readings — admin only manual insert
router.post('/', [verifyToken, verifyAdmin], createReading);

// POST /api/readings/update-weather — trigger Open-Meteo sync manually
router.post('/update-weather', verifyToken, async (req, res) => {
    try {
        const result = await fetchAndStoreWeatherData();
        if (result?.status === 'error') return res.status(500).json(result);
        if (req.io) req.io.emit('sensor_update', { source: 'update-weather', timestamp: new Date().toISOString() });
        res.status(200).json(result || { status: 'success' });
    } catch (error) {
        console.error('[readings] update-weather error:', error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

// GET /api/readings/update-air-quality — trigger OpenAQ sync manually
router.get('/update-air-quality', verifyToken, async (req, res) => {
    try {
        const result = await fetchAndStoreOpenAQData();
        if (result?.status === 'error') return res.status(500).json(result);
        if (req.io) req.io.emit('sensor_update', { source: 'update-air-quality', timestamp: new Date().toISOString() });
        res.status(200).json(result || { status: 'success' });
    } catch (error) {
        console.error('[readings] update-air-quality error:', error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

// GET /api/readings/timeseries/:sensorId
router.get('/timeseries/:sensorId', verifyToken, async (req, res) => {
    try {
        const { sensorId } = req.params;
        const type = req.query.type;
        const days = parseInt(req.query.days) || 30;

        if (!type) {
            return res.status(400).json({ error: 'measurement type is required' });
        }

        const query = `
SELECT
  DATE_TRUNC('day', r.timestamp) AS date,
  ROUND(AVG(r.value)::numeric, 2) AS avg_value,
  ROUND(MIN(r.value)::numeric, 2) AS min_value,
  ROUND(MAX(r.value)::numeric, 2) AS max_value,
  COUNT(*) AS reading_count
FROM reading r
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
WHERE r.sensor_id = $1
  AND mt.type_name = $2
  AND r.timestamp >= NOW() - ($3 || ' days')::INTERVAL
GROUP BY DATE_TRUNC('day', r.timestamp)
ORDER BY date DESC;
        `;
        const result = await pool.query(query, [sensorId, type, days]);
        res.json({
            sensor_id: sensorId,
            measurement_type: type,
            days,
            data: result.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
