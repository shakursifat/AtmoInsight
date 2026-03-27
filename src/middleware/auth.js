const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'A token is required for authentication' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch (err) {
        return res.status(401).json({ error: 'Invalid Token' });
    }

    return next();
};

const roleGuard = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role_name) {
            return res.status(403).json({ error: 'Access denied: Role missing' });
        }
        if (allowedRoles.includes(req.user.role_name)) {
            return next();
        }
        return res.status(403).json({ error: 'Access denied: Insufficient permissions' });
    };
};

module.exports = {
    verifyToken,
    roleGuard
};
