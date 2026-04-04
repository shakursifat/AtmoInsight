require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

let connStr = process.env.DATABASE_URL;
if (!connStr.includes('sslmode=require')) {
  connStr += (connStr.includes('?') ? '&' : '?') + 'sslmode=require';
}

const pool = new Pool({
  connectionString: connStr,
});

async function main() {
  try {
    const sensorRes = await pool.query('SELECT sensor_id FROM sensor LIMIT 1');
    const sensorId = sensorRes.rows[0].sensor_id;

    console.log(`Using sensor_id: ${sensorId}`);

    const mtRes = await pool.query('SELECT measurement_type_id, type_name FROM measurementtype');
    let tempId, pmId;
    mtRes.rows.forEach(r => {
      if (r.type_name.toLowerCase().includes('temp')) tempId = r.measurement_type_id;
      if (r.type_name.toLowerCase() === 'pm2.5' || r.type_name.toLowerCase().includes('pm')) pmId = r.measurement_type_id;
    });

    console.log(`Temperature ID: ${tempId}, PM ID: ${pmId}`);

    if (tempId) {
      await pool.query(
        'INSERT INTO reading (sensor_id, measurement_type_id, value, timestamp, unit_id) VALUES ($1, $2, $3, NOW(), 1)',
        [sensorId, tempId, 45.5]
      );
      console.log('Inserted high Temperature reading');
    }

    if (pmId) {
      await pool.query(
        'INSERT INTO reading (sensor_id, measurement_type_id, value, timestamp, unit_id) VALUES ($1, $2, $3, NOW(), 1)',
        [sensorId, pmId, 320.0]
      );
      console.log('Inserted high PM reading');
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

main();
