const axios = require('axios');
const pool = require('../db/pool');

/**
 * Service to fetch data from Open-Meteo and OpenAQ and insert into the Reading table.
 * It uses existing MeasurementType and MeasurementUnit records by matching their names.
 */
const fetchAndStoreData = async () => {
    try {
        console.log('Starting data fetch from Open-Meteo and OpenAQ...');

        // Hardcode Dhaka coordinates as per requirements
        const latitude = 23.8103;
        const longitude = 90.4125;

        // 1. Identify a Sensor to attach the readings to.
        // We'll try to find a location that matches "Dhaka", else fallback to any location, then get a sensor.
        let locationRes = await pool.query("SELECT location_id FROM Location WHERE name ILIKE '%Dhaka%' LIMIT 1");
        if (locationRes.rows.length === 0) {
            locationRes = await pool.query("SELECT location_id FROM Location LIMIT 1");
        }
        
        const locationId = locationRes.rows.length > 0 ? locationRes.rows[0].location_id : null;
        
        let sensorRes = await pool.query("SELECT sensor_id FROM Sensor WHERE location_id = $1 LIMIT 1", [locationId]);
        if (sensorRes.rows.length === 0) {
            sensorRes = await pool.query("SELECT sensor_id FROM Sensor LIMIT 1");
        }
        
        const sensorId = sensorRes.rows.length > 0 ? sensorRes.rows[0].sensor_id : null;

        if (!sensorId) {
            console.error('No sensor available to associate with readings. Please ensure at least one Sensor exists in the database.');
            return;
        }

        const dataPoints = [];

        // 2. Fetch Open-Meteo Weather Data (Free, no API key required)
        try {
            const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure,dew_point_2m`;
            const meteoRes = await axios.get(meteoUrl);
            const currentMeteo = meteoRes.data.current;

            dataPoints.push({ typeName: 'Temperature', unitName: 'Celsius', value: currentMeteo.temperature_2m });
            dataPoints.push({ typeName: 'Humidity', unitName: 'Percentage', value: currentMeteo.relative_humidity_2m });
            dataPoints.push({ typeName: 'Wind Speed', unitName: 'km/h', value: currentMeteo.wind_speed_10m });
            dataPoints.push({ typeName: 'Pressure', unitName: 'hPa', value: currentMeteo.surface_pressure });
            dataPoints.push({ typeName: 'Dew Point', unitName: 'Celsius', value: currentMeteo.dew_point_2m });
        } catch (meteoErr) {
            console.error('Error fetching Open-Meteo data:', meteoErr.message);
        }

        // 3. Fetch OpenAQ Air Quality Data (Free, PM2.5)
        try {
            const openaqUrl = `https://api.openaq.org/v2/latest?coordinates=${latitude},${longitude}&radius=25000&parameter=pm25&limit=1`;
            const aqRes = await axios.get(openaqUrl);
            
            if (aqRes.data && aqRes.data.results && aqRes.data.results.length > 0) {
                const measurements = aqRes.data.results[0].measurements;
                const pm25Measurement = measurements.find(m => m.parameter === 'pm25');
                if (pm25Measurement && pm25Measurement.value !== undefined) {
                    dataPoints.push({ typeName: 'PM2.5', unitName: 'µg/m³', value: pm25Measurement.value });
                }
            }
        } catch (aqErr) {
            console.error('Error fetching OpenAQ data:', aqErr.message);
        }

        // 4. Insert Readings into the Database matching by Name
        for (const data of dataPoints) {
            if (data.value === null || data.value === undefined) continue;

            // Find matching MeasurementType
            const typeRes = await pool.query(
                "SELECT measurement_type_id FROM MeasurementType WHERE type_name ILIKE $1 LIMIT 1",
                [`%${data.typeName}%`]
            );
            
            if (typeRes.rows.length === 0) {
                console.warn(`Warning: MeasurementType '${data.typeName}' not found in DB. Skipping measurement.`);
                continue;
            }
            const typeId = typeRes.rows[0].measurement_type_id;

            // Find matching MeasurementUnit (checking either name or symbol)
            const unitRes = await pool.query(
                "SELECT unit_id FROM MeasurementUnit WHERE unit_name ILIKE $1 OR symbol ILIKE $1 LIMIT 1",
                [`%${data.unitName}%`]
            );
            
            if (unitRes.rows.length === 0) {
                console.warn(`Warning: MeasurementUnit '${data.unitName}' not found in DB. Skipping measurement.`);
                continue;
            }
            const unitId = unitRes.rows[0].unit_id;

            // Insert using parameterized query
            await pool.query(
                `INSERT INTO Reading (sensor_id, timestamp, value, measurement_type_id, unit_id) 
                 VALUES ($1, NOW(), $2, $3, $4)`,
                [sensorId, data.value, typeId, unitId]
            );
        }
        
        console.log('Successfully fetched and inserted external real-time data from APIs.');
    } catch (error) {
        console.error('Unexpected error in fetchAndStoreData service:', error.message);
    }
};

module.exports = { fetchAndStoreData };
