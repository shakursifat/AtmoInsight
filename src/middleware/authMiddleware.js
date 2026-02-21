const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) {
        return res.status(403).json({ error: 'A token is required for authentication' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Will contain id, email, role
    } catch (err) {
        return res.status(401).json({ error: 'Invalid Token' });
    }

    return next();
};

const verifyAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    return res.status(403).json({ error: 'Requires admin privileges' });
};

module.exports = {
    verifyToken,
    verifyAdmin
};
