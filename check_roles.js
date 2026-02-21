require('dotenv').config();
const pool = require('./src/db/pool');

async function checkRoles() {
    try {
        const res = await pool.query('SELECT * FROM role');
        console.table(res.rows);
    } catch (err) {
        console.error("Error querying roles:", err);
    } finally {
        pool.end();
    }
}
checkRoles();
