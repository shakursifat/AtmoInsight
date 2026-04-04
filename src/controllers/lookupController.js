const pool = require('../db/pool');

// GET /api/lookup/measurement-types
const getMeasurementTypes = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM measurementtype ORDER BY measurement_type_id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/lookup/measurement-units
const getMeasurementUnits = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM measurementunit ORDER BY unit_id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/lookup/locations
const getLocations = async (req, res) => {
    try {
        const query = `
            SELECT 
                location_id, 
                name, 
                address, 
                ST_Y(coordinates::geometry) AS latitude, 
                ST_X(coordinates::geometry) AS longitude 
            FROM location 
            ORDER BY name
        `;
        const result = await pool.query(query);
        res.json({ locations: result.rows });
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
};

module.exports = { getMeasurementTypes, getMeasurementUnits, getLocations };
