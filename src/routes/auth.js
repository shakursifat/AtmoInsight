const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const emailCheck = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (emailCheck.rows.length > 0) {
            return res.status(409).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertQuery = `
            INSERT INTO users (username, email, password_hash, role_id)
            VALUES ($1, $2, $3, 3)
            RETURNING user_id, username, email
        `;
        const result = await pool.query(insertQuery, [username, email, hashedPassword]);

        const user = {
            ...result.rows[0],
            role_name: 'Citizen'
        };

        res.status(201).json({ message: 'User registered successfully', user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
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
                user_id: user.user_id,
                username: user.username,
                email: user.email,
                role_name: user.role_name
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
