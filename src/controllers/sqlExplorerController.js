const pool = require('../db/pool');

// ─────────────────────────────────────────────────────────────────────────────
// Allowed-function registry for function-demo endpoint
// ─────────────────────────────────────────────────────────────────────────────
const FUNCTION_DEMOS = {
    pollution_avg: {
        label: 'get_pollution_average',
        description: 'Returns avg, min, max, and count for a given measurement type at a location over a lookback window.',
        signature: 'get_pollution_average(location_id, measurement_type_name, interval)',
        buildQuery: (p) => ({
            text: `SELECT * FROM get_pollution_average($1, $2, $3::interval)`,
            values: [
                parseInt(p.location_id) || 1,
                p.measurement || 'PM2.5',
                p.interval || '30 days'
            ]
        })
    },
    disaster_summary: {
        label: 'get_disaster_impact_summary',
        description: 'Aggregated disaster impact summary optionally filtered by subgroup and/or year.',
        signature: 'get_disaster_impact_summary(subgroup_name, year)',
        buildQuery: (p) => ({
            text: `SELECT * FROM get_disaster_impact_summary($1, $2)`,
            values: [
                p.subgroup || null,
                p.year ? parseInt(p.year) : null
            ]
        })
    },
    nearby_sensors: {
        label: 'get_nearby_sensors',
        description: 'Returns sensors within a given radius of a lon/lat point with their latest reading.',
        signature: 'get_nearby_sensors(longitude, latitude, radius_metres, measurement)',
        buildQuery: (p) => ({
            text: `SELECT * FROM get_nearby_sensors($1, $2, $3, $4)`,
            values: [
                parseFloat(p.longitude) || 90.4074,
                parseFloat(p.latitude) || 23.7104,
                parseFloat(p.radius) || 15000,
                p.measurement || 'PM2.5'
            ]
        })
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sql/execute-query
// Runs a user-submitted SQL query.  Non-admins may only run SELECT statements.
// ─────────────────────────────────────────────────────────────────────────────
const executeQuery = async (req, res) => {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'Query string is required.' });
    }

    const normalised = query.trim().toUpperCase();

    // Role guard — non-admins may only SELECT
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role_id === 1);
    if (!normalised.startsWith('SELECT') && !isAdmin) {
        return res.status(403).json({
            error: 'Permission denied: only admin users may run non-SELECT statements.'
        });
    }

    // Additional safety: block DDL/system-level statements for non-admins
    const blockedKeywords = ['DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE', 'EXECUTE'];
    if (!isAdmin && blockedKeywords.some(kw => normalised.includes(kw))) {
        return res.status(403).json({
            error: `Blocked: statement contains restricted keyword. Allowed: SELECT.`
        });
    }

    const start = Date.now();
    try {
        const result = await pool.query(query);
        const elapsed = Date.now() - start;

        const payload = {
            rows: result.rows,
            rowCount: result.rowCount,
            fields: result.fields ? result.fields.map(f => f.name) : [],
            executionTimeMs: elapsed,
            query
        };

        // Broadcast to all websocket clients via Socket.io
        if (req.io) {
            req.io.emit('query_executed', {
                rowCount: result.rowCount,
                executionTimeMs: elapsed,
                executedBy: req.user ? req.user.email : 'unknown'
            });
        }

        return res.json(payload);
    } catch (err) {
        return res.status(400).json({
            error: err.message,
            hint: err.hint || null,
            position: err.position || null
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sql/trigger-demo
// Inserts a high-value reading (value = 95) to fire the alert threshold trigger.
// The DB trigger fn_create_alert_on_threshold will insert into alert automatically
// and call pg_notify('new_alert_channel', ...) which the server already listens to
// and re-emits as 'new_alert' via Socket.io.
// ─────────────────────────────────────────────────────────────────────────────
const triggerDemo = async (req, res) => {
    try {
        // Use parameterised query — never string-interpolate user values
        const insertSQL = `
            INSERT INTO reading (source_id, sensor_id, timestamp, value, measurement_type_id, unit_id)
            VALUES ($1, $2, NOW(), $3, $4, $5)
            RETURNING *;
        `;
        // A value of 95 will breach the standard PM2.5 threshold (max ≈ 80) in a demo DB
        const values = [1, 1, 95.0, 1, 1];

        const result = await pool.query(insertSQL, values);
        const insertedReading = result.rows[0];

        // Give the trigger a moment to execute then fetch the latest alert for this reading
        const alertRes = await pool.query(
            `SELECT a.*, at2.type_name
             FROM alert a
             LEFT JOIN alerttype at2 ON a.alert_type_id = at2.alert_type_id
             WHERE a.reading_id = $1
             ORDER BY a.timestamp DESC LIMIT 1`,
            [insertedReading.reading_id]
        );
        const generatedAlert = alertRes.rows[0] || null;

        // Emit trigger-fired event for any listeners (in addition to the DB notify already wired in server.js)
        if (req.io) {
            req.io.emit('trigger_fired', {
                reading: insertedReading,
                alert: generatedAlert
            });
        }

        return res.json({
            message: 'High-value reading inserted. DB trigger fired!',
            insertedReading,
            generatedAlert
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sql/function-demo?fn=<key>&<params>
// Calls one of the registered stored functions with safe parameterised queries.
// ─────────────────────────────────────────────────────────────────────────────
const functionDemo = async (req, res) => {
    const { fn, ...params } = req.query;

    if (!fn || !FUNCTION_DEMOS[fn]) {
        return res.status(400).json({
            error: `Unknown function key '${fn}'. Available: ${Object.keys(FUNCTION_DEMOS).join(', ')}`
        });
    }

    const demo = FUNCTION_DEMOS[fn];
    const { text, values } = demo.buildQuery(params);

    const start = Date.now();
    try {
        const result = await pool.query(text, values);
        const elapsed = Date.now() - start;

        return res.json({
            functionKey: fn,
            functionName: demo.label,
            description: demo.description,
            signature: demo.signature,
            rows: result.rows,
            rowCount: result.rowCount,
            fields: result.fields ? result.fields.map(f => f.name) : [],
            executionTimeMs: elapsed
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sql/schema-info  (bonus: exposes table/column info for the query helper)
// ─────────────────────────────────────────────────────────────────────────────
const schemaInfo = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position;
        `);

        // Group by table
        const schema = {};
        result.rows.forEach(({ table_name, column_name, data_type }) => {
            if (!schema[table_name]) schema[table_name] = [];
            schema[table_name].push({ column: column_name, type: data_type });
        });

        return res.json({ tables: schema });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

module.exports = { executeQuery, triggerDemo, functionDemo, schemaInfo };
