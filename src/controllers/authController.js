const pool = require('../db/pool');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Register a new user
const register = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        // Map textual role to database ID
        let roleId = 3; // Default Citizen
        if (role === 'Admin') roleId = 1;
        else if (role === 'Scientist') roleId = 2;

        // Check if user exists
        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new user into the database
        const newUser = await pool.query(
            'INSERT INTO users (username, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING user_id, username, email, role_id',
            [username, email, hashedPassword, roleId]
        );

        res.status(201).json(newUser.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const user = userResult.rows[0];

        // Compare password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.user_id, email: user.email, role_id: user.role_id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.user_id, username: user.username, role_id: user.role_id }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    register,
    login
};
