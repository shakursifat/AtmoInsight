const pool = require('../db/pool');

const getSensorLocations = async (req, res) => {
    try {
        // 1. Join sensor with location mapping
        // 2. Use PostGIS ST_Y and ST_X to convert the geometry 'coordinates' column into standard Lat/Lng floats
        // 3. Left join the latest reading value via a subquery
        const result = await pool.query(`
      SELECT 
        s.sensor_id,
        s.name as sensor_name,
        l.name as location_name,
        ST_Y(l.coordinates::geometry) as lat,
        ST_X(l.coordinates::geometry) as lng,
        (
          SELECT value 
          FROM reading r 
          WHERE r.sensor_id = s.sensor_id 
          ORDER BY timestamp DESC 
          LIMIT 1
        ) as latest_value
      FROM sensor s
      JOIN location l ON s.location_id = l.location_id
      WHERE l.coordinates IS NOT NULL
    `);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getSensorLocations
};
