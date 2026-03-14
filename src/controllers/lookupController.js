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

module.exports = { getMeasurementTypes, getMeasurementUnits };
