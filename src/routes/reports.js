const express = require('express');
const router = express.Router();
const { createReport, getAllReports, updateReportStatus } = require('../controllers/reportsController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// GET /api/reports (Any logged-in user can view reports)
router.get('/', verifyToken, getAllReports);

// POST /api/reports (Any logged-in citizen can submit)
router.post('/', verifyToken, createReport);

// PUT /api/reports/:id (Only Admins can change status)
router.put('/:id', [verifyToken, verifyAdmin], updateReportStatus);

module.exports = router;
