require('dotenv').config();
const pool = require('./src/db/pool');

async function viewUsers() {
    try {
        console.log("Fetching registered users from the Neon Database...\n");

        // We query the 'users' table, joining with 'userrole' to see their clearance level
        const query = `
            SELECT 
                u.user_id, 
                u.username, 
                u.email, 
                r.role_name as "Role",
                u.password_hash as "Secure Password Hash"
            FROM users u
            JOIN userrole r ON u.role_id = r.role_id
            ORDER BY u.user_id DESC
        `;

        const res = await pool.query(query);

        if (res.rows.length === 0) {
            console.log("No users are currently registered in the database!");
        } else {
            console.table(res.rows);
        }

    } catch (err) {
        console.error("Error querying users table:", err);
    } finally {
        pool.end();
    }
}

viewUsers();
