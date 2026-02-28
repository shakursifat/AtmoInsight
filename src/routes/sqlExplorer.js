const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
    executeQuery,
    triggerDemo,
    functionDemo,
    schemaInfo
} = require('../controllers/sqlExplorerController');

// All routes require a valid JWT
router.use(verifyToken);

// POST /api/sql/execute-query
// Run an ad-hoc SQL query. Non-admins restricted to SELECT.
router.post('/execute-query', executeQuery);

// POST /api/sql/trigger-demo
// Insert a synthetic high-value reading to fire the DB alert trigger.
router.post('/trigger-demo', triggerDemo);

// GET /api/sql/function-demo?fn=<key>&...params
// Call one of the stored functions. Available: pollution_avg, disaster_summary, nearby_sensors
router.get('/function-demo', functionDemo);

// GET /api/sql/schema-info
// Returns public-schema table/column info for the query helper autocomplete.
router.get('/schema-info', schemaInfo);

module.exports = router;
