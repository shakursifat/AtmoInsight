const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { getForecasts } = require('../controllers/forecastsController');

router.get('/', verifyToken, getForecasts);

module.exports = router;
