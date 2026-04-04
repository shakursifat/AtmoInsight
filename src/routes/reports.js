const express = require('express');
const router = express.Router();
const { submitReport, getMyReports, getAllReports, updateReportStatus } = require('../controllers/reportsController');
const { verifyToken, roleGuard } = require('../middleware/authMiddleware');

// POST /api/reports/submit
router.post('/submit', verifyToken, submitReport);

// GET /api/reports/my
router.get('/my', verifyToken, getMyReports);

// GET /api/reports/all
router.get('/all', [verifyToken, roleGuard(['Admin', 'Scientist'])], getAllReports);

// PUT /api/reports/:id/status
router.put('/:id/status', [verifyToken, roleGuard(['Admin', 'Scientist'])], updateReportStatus);

module.exports = router;
