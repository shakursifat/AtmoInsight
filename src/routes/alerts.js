const express = require('express');
const router = express.Router();
const { getActiveAlerts, getAllAlerts, createAlert } = require('../controllers/alertsController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// GET /api/alerts/active
// Returns up to 50 active alerts. Uses a single query with a dynamic time
// window: tries last 24 h first; if fewer than 5 results, expands to all-time.
// This avoids the previous double-round-trip fallback pattern.
router.get('/active', verifyToken, getActiveAlerts);

router.get('/', verifyToken, getAllAlerts);
router.post('/', [verifyToken, verifyAdmin], createAlert);

module.exports = router;
