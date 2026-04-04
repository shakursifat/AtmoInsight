const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, async (req, res) => {
    try {
        const minProb = req.query.min_probability != null ? parseFloat(req.query.min_probability) : 0;
        const upcomingParam = req.query.upcoming_only;
        const upcomingOnly =
            upcomingParam === undefined || upcomingParam === null
                ? true
                : !['false', '0', 'no'].includes(String(upcomingParam).toLowerCase());

        const query = `
SELECT
  f.forecast_id,
  wm.model_name,
  wm.source AS model_source,
  f.predicted_timestamp,
  ROUND(f.probability * 100, 1) AS probability_pct,
  f.probability AS probability_raw,
  l.name AS location_name,
  l.region,
  f.description
FROM forecast f
JOIN weathermodel wm ON f.weather_model_id = wm.model_id
JOIN location l ON f.location_id = l.location_id
WHERE f.probability >= $1
  AND ($2::boolean = false OR f.predicted_timestamp > NOW())
ORDER BY f.probability DESC, f.predicted_timestamp`;

        const result = await pool.query(query, [minProb, upcomingOnly]);
        res.json({ forecasts: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
