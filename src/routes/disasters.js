const express = require('express');
const router = express.Router();
const { getDisasters, getDisasterSummary, updateDisasterImpact } = require('../controllers/disastersController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// GET /api/disasters
// Accepts optional ?limit=N (default 500, max 1000), ?offset=N for pagination, and ?subgroup=
router.get('/', verifyToken, getDisasters);

// GET /api/disasters/summary
// Accepts optional ?subgroup= and ?year= filters
// Delegates to the get_disaster_impact_summary database function
router.get('/summary', verifyToken, getDisasterSummary);

// PATCH /api/disasters/:id/impact
router.patch('/:id/impact', [verifyToken, verifyAdmin], updateDisasterImpact);

module.exports = router;
