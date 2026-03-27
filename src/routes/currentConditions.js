const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/current-conditions
// Returns the latest reading for each unique measurement type across all active sensors.
// Uses LEFT JOIN so readings stored without a unit_id still appear.
router.get('/', async (req, res) => {
    try {
        const query = `
SELECT DISTINCT ON (mt.type_name)
  mt.type_name                              AS measurement,
  ROUND(r.value::numeric, 2)               AS value,
  COALESCE(mu.symbol, '')                  AS unit,
  s.name                                   AS sensor_name,
  l.name                                   AS location_name,
  l.region,
  r.timestamp
FROM reading r
JOIN sensor s            ON r.sensor_id         = s.sensor_id
JOIN location l          ON s.location_id       = l.location_id
JOIN measurementtype mt  ON r.measurement_type_id = mt.measurement_type_id
LEFT JOIN measurementunit mu ON r.unit_id       = mu.unit_id
WHERE s.status = 'Active'
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
