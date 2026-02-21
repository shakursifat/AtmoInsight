require('dotenv').config();
const pool = require('./src/db/pool');

async function fetchDisasterSchema() {
    try {
        const res = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN ('disasterevent', 'disastertype', 'disastersubgroup')
    `);

        const schema = {};
        for (const row of res.rows) {
            if (!schema[row.table_name]) schema[row.table_name] = [];
            schema[row.table_name].push({ column: row.column_name, type: row.data_type });
        }

        console.log(JSON.stringify(schema, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

fetchDisasterSchema();
