const express = require('express');
const router = express.Router();
const { getAllDisasters } = require('../controllers/disastersController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, getAllDisasters);

module.exports = router;
