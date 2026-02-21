require('dotenv').config();
const pool = require('./src/db/pool');

async function checkUserRoles() {
    try {
        const res = await pool.query('SELECT * FROM userrole');
        console.table(res.rows);
    } catch (err) {
        console.error("Error querying roles:", err);
    } finally {
        pool.end();
    }
}
checkUserRoles();
