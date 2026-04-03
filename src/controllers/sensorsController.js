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
                s.location_id,
                ST_Y(l.coordinates::geometry) as lat,
                ST_X(l.coordinates::geometry) as lng,
                (SELECT value FROM reading r WHERE r.sensor_id = s.sensor_id AND r.measurement_type_id = 1 ORDER BY timestamp DESC LIMIT 1) as latest_pm25,
                (SELECT value FROM reading r WHERE r.sensor_id = s.sensor_id AND r.measurement_type_id = 3 ORDER BY timestamp DESC LIMIT 1) as latest_temp,
                (SELECT value FROM reading r WHERE r.sensor_id = s.sensor_id AND r.measurement_type_id = 4 ORDER BY timestamp DESC LIMIT 1) as latest_humidity,
                (SELECT timestamp FROM reading r WHERE r.sensor_id = s.sensor_id ORDER BY timestamp DESC LIMIT 1) as last_reading_timestamp
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

// POST /api/sensors  (admin only)
const createSensor = async (req, res) => {
    const client = await pool.connect();
    try {
        const {
            name,
            sensor_type_id,
            lat,
            lng,
            location_name,
            address,
            region,
            status,
        } = req.body;

        // Validate required fields
        if (!name || !sensor_type_id || lat == null || lng == null) {
            return res.status(400).json({ error: 'name, sensor_type_id, lat, and lng are required' });
        }

        await client.query('BEGIN');

        // 1. Create Location with PostGIS point
        const locResult = await client.query(
            `INSERT INTO location (name, coordinates, address, region)
             VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5)
             RETURNING location_id, name, address, region`,
            [location_name || name, lng, lat, address || '', region || '']
        );
        const location = locResult.rows[0];

        // 2. Create Sensor linked to the new location
        const sensorResult = await client.query(
            `INSERT INTO sensor (name, sensor_type_id, location_id, status, installed_at)
             VALUES ($1, $2, $3, $4, CURRENT_DATE)
             RETURNING sensor_id, name, sensor_type_id, location_id, status, installed_at`,
            [name, sensor_type_id, location.location_id, status || 'Active']
        );
        const sensor = sensorResult.rows[0];

        // 3. Fetch the sensor type name for the response
        const typeResult = await client.query(
            'SELECT type_name FROM sensortype WHERE sensor_type_id = $1',
            [sensor_type_id]
        );

        await client.query('COMMIT');

        res.status(201).json({
            ...sensor,
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            location_name: location.name,
            address: location.address,
            region: location.region,
            type_name: typeResult.rows[0]?.type_name || null,
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[createSensor] Error:', error.message);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

module.exports = { getSensors, getSensorTypes, getLocations, createSensor };
