const pool = require('../db/pool');

// GET /api/sensors?type_id=XX&location_id=YY
const getSensors = async (req, res) => {
    try {
        const { type_id, location_id } = req.query;
        let query = `
            SELECT 
                s.sensor_id,
                s.name,
                st.type_name,
                l.name AS location_name,
                s.status,
                s.installed_at,
                s.sensor_type_id,
                s.location_id
            FROM sensor s
            LEFT JOIN sensortype st ON s.sensor_type_id = st.sensor_type_id
            LEFT JOIN location l ON s.location_id = l.location_id
            WHERE 1=1
        `;
        const params = [];
        if (type_id) {
            params.push(type_id);
            query += ` AND s.sensor_type_id = $${params.length}`;
        }
        if (location_id) {
            params.push(location_id);
            query += ` AND s.location_id = $${params.length}`;
        }
        query += ' ORDER BY s.sensor_id';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/sensors/types
const getSensorTypes = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM sensortype ORDER BY sensor_type_id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/sensors/locations
const getLocations = async (req, res) => {
    try {
        const result = await pool.query('SELECT location_id, name, address, region FROM location ORDER BY location_id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getSensors, getSensorTypes, getLocations };
