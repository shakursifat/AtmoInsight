const pool = require('../db/pool');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Register a new user
const register = async (req, res) => {
    const client = await pool.connect();
    try {
        const { username, email, password, role } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await client.query('BEGIN');

        const emailCheck = await client.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (emailCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Map textual role to database ID
        let roleId = 3; // Default Citizen
        if (role === 'Admin') roleId = 1;
        else if (role === 'Scientist') roleId = 2;

        const insertQuery = `
            INSERT INTO users (username, email, password_hash, role_id)
            VALUES ($1, $2, $3, $4)
            RETURNING user_id, username, email, role_id
        `;
        const result = await client.query(insertQuery, [username, email, hashedPassword, roleId]);

        await client.query('COMMIT');

        const user = {
            ...result.rows[0],
            role_name: role || 'Citizen'
        };

        res.status(201).json({ message: 'User registered successfully', user });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Missing email or password' });
        }

        const userQuery = `
            SELECT u.user_id, u.username, u.email, u.password_hash, u.role_id, r.role_name
            FROM users u
            JOIN userrole r ON u.role_id = r.role_id
            WHERE u.email = $1
        `;
        const userRes = await pool.query(userQuery, [email]);

        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = userRes.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const tokenPayload = {
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            role_id: user.role_id,
            role_name: user.role_name
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({
            token,
            user: {
                id: user.user_id,
                user_id: user.user_id,
                username: user.username,
                email: user.email,
                role_name: user.role_name,
                role_id: user.role_id
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    register,
    login
};
