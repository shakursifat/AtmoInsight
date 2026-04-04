const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { fetchCurrentConditionsByLocation } = require('../services/openWeatherService');

// GET /api/current-conditions?location_id=<id>
// Fetches OpenWeatherMap current weather + air pollution, stores readings, returns JSON.
// GET /api/current-conditions (no query)
// Returns the latest reading for each unique measurement type across all active sensors.
router.get('/', async (req, res) => {
    if (req.query.location_id !== undefined && req.query.location_id !== '') {
        const locationId = parseInt(req.query.location_id, 10);
        if (Number.isNaN(locationId) || locationId <= 0) {
            return res.status(400).json({ error: 'location_id must be a positive integer' });
        }
        try {
            const data = await fetchCurrentConditionsByLocation(locationId);
            return res.json(data);
        } catch (err) {
            if (err.code === 'MISSING_KEY') {
                return res.status(500).json({ error: err.message });
            }
            if (err.code === 'NOT_FOUND') {
                return res.status(404).json({ error: err.message });
            }
            if (err.code === 'NO_SENSOR') {
                return res.status(404).json({ error: err.message });
            }
            if (err.code === 'OWM_ERROR') {
                return res.status(502).json({ error: err.message, details: err.details });
            }
            console.error('[currentConditions] OpenWeatherMap:', err);
            return res.status(500).json({ error: 'Failed to fetch current conditions' });
        }
    }

    try {
        const query = `
SELECT DISTINCT ON (mt.type_name)
  r.reading_id,
  mt.type_name                              AS measurement,
  ROUND(r.value::numeric, 2)               AS value,
  COALESCE(mu.symbol, '')                  AS unit,
  s.sensor_id,
  s.name                                   AS sensor_name,
  l.name                                   AS location_name,
  l.region,
  ST_Y(l.coordinates)                      AS latitude,
  ST_X(l.coordinates)                      AS longitude,
  r.timestamp
FROM reading r
JOIN sensor s            ON r.sensor_id         = s.sensor_id
JOIN location l          ON s.location_id       = l.location_id
JOIN measurementtype mt  ON r.measurement_type_id = mt.measurement_type_id
LEFT JOIN measurementunit mu ON r.unit_id       = mu.unit_id
WHERE s.status IN ('Active', 'Maintenance')
ORDER BY mt.type_name, r.timestamp DESC;
        `;
        const result = await pool.query(query);
        res.json({ conditions: result.rows });
    } catch (err) {
        console.error('[currentConditions]', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
