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

const getMapSensors = async (req, res) => {
    try {
        const query = `
SELECT json_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(json_agg(
    json_build_object(
      'type', 'Feature',
      'geometry', ST_AsGeoJSON(l.coordinates)::json,
      'properties', json_build_object(
        'sensor_id', s.sensor_id,
        'location_id', l.location_id,
        'name', s.name,
        'status', s.status,
        'sensor_type', st.type_name,
        'location_name', l.name,
        'region', l.region,
        'latest_value', latest.value,
        'latest_unit', latest.symbol,
        'latest_measurement', latest.type_name,
        'latest_timestamp', latest.timestamp
      )
    )
  ), '[]'::json)
) AS geojson
FROM sensor s
JOIN sensortype st ON s.sensor_type_id = st.sensor_type_id
JOIN location l ON s.location_id = l.location_id
LEFT JOIN LATERAL (
  SELECT r.value, mu.symbol, mt.type_name, r.timestamp
  FROM reading r
  JOIN measurementunit mu ON r.unit_id = mu.unit_id
  JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
  WHERE r.sensor_id = s.sensor_id
  ORDER BY r.timestamp DESC LIMIT 1
) latest ON true
WHERE s.status IN ('Active', 'Maintenance');
        `;
        const result = await pool.query(query);
        res.json(result.rows[0].geojson);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const getMapDisasters = async (req, res) => {
    try {
        const query = `
SELECT json_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(json_agg(
    json_build_object(
      'type', 'Feature',
      'geometry', COALESCE(ST_AsGeoJSON(he.affected_area_location), ST_AsGeoJSON(l.coordinates))::json,
      'properties', json_build_object(
        'event_id', d.event_id,
        'disaster_type', dt.type_name,
        'subgroup', ds.subgroup_name,
        'severity', d.severity,
        'start_timestamp', d.start_timestamp,
        'end_timestamp', d.end_timestamp,
        'description', d.description,
        'location_name', l.name,
        'deaths', di.deaths,
        'injuries', di.injuries,
        'affected_people', di.affected_people,
        'economic_loss', di.economic_loss
      )
    )
  ), '[]'::json)
) AS geojson
FROM disasterevent d
JOIN disastertype dt ON d.disaster_type_id = dt.type_id
JOIN disastersubgroup ds ON dt.subgroup_id = ds.subgroup_id
JOIN location l ON d.location_id = l.location_id
LEFT JOIN disasterimpact di ON d.event_id = di.event_id
LEFT JOIN hydrologicalevent he ON d.event_id = he.event_id
        `;
        const result = await pool.query(query);
        res.json(result.rows[0].geojson);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getSensorLocations,
    getMapSensors,
    getMapDisasters
};
