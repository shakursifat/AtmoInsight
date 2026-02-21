require('dotenv').config();
const pool = require('./src/db/pool');

async function listTables() {
    try {
        const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.table(res.rows);
    } catch (err) {
        console.error("Error querying tables:", err);
    } finally {
        pool.end();
    }
}
listTables();
