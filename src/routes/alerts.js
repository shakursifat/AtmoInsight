const express = require('express');
const router = express.Router();
const { getAllAlerts, createAlert } = require('../controllers/alertsController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

router.get('/', verifyToken, getAllAlerts);
router.post('/', [verifyToken, verifyAdmin], createAlert);

module.exports = router;
