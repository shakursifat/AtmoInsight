const pool = require('../db/pool');

const getActiveAlerts = async (req, res) => {
    try {
        const query = `
            WITH recent AS (
                SELECT
                    a.alert_id,
                    a.severity,
                    a.timestamp        AS alert_time,
                    a.message,
                    a.reading_id,
                    a.alert_type_id,
                    a.is_active,
                    -- Flag whether this row falls within the 24-hour window
                    (a.timestamp >= NOW() - INTERVAL '24 hours') AS is_recent
                FROM alert a
                WHERE COALESCE(a.is_active, true) = true
                ORDER BY a.timestamp DESC
                LIMIT 50
            ),
            recent_count AS (
                SELECT COUNT(*) AS cnt FROM recent WHERE is_recent = true
            )
            SELECT
                r.alert_id,
                r.severity,
                r.alert_time,
                at.type_name   AS alert_type,
                r.message,
                rd.value       AS trigger_value,
                mt.type_name   AS measurement,
                mu.symbol      AS unit,
                s.sensor_id,
                s.name         AS sensor_name,
                l.name         AS location_name,
                l.region,
                ST_Y(l.coordinates::geometry) AS latitude,
                ST_X(l.coordinates::geometry) AS longitude
            FROM recent r
            CROSS JOIN recent_count rc
            JOIN alerttype     at ON r.alert_type_id          = at.alert_type_id
            JOIN reading       rd ON r.reading_id             = rd.reading_id
            JOIN sensor        s  ON rd.sensor_id             = s.sensor_id
            JOIN location      l  ON s.location_id            = l.location_id
            JOIN measurementtype mt ON rd.measurement_type_id = mt.measurement_type_id
            JOIN measurementunit mu ON rd.unit_id             = mu.unit_id
            -- If recent window has >=5, show only recent rows; otherwise show all 50
            WHERE rc.cnt >= 5 OR r.is_recent = false OR r.is_recent = true
            ORDER BY r.alert_time DESC
            LIMIT CASE WHEN (SELECT cnt FROM recent_count) >= 5
                       THEN (SELECT COUNT(*) FROM recent WHERE is_recent = true)
                       ELSE 50
                  END
        `;
        const result = await pool.query(query);
        res.json({ alerts: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const getAllAlerts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const result = await pool.query(
            'SELECT * FROM alert ORDER BY timestamp DESC LIMIT $1',
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createAlert = async (req, res) => {
    const client = await pool.connect();
    try {
        const { reading_id, alert_type_id, timestamp, message, severity } = req.body;

        await client.query('BEGIN');

        const newAlert = await client.query(
            `INSERT INTO alert (reading_id, alert_type_id, timestamp, message, severity, sensor_id, is_active, last_triggered_at)
             VALUES ($1, $2, COALESCE($3, NOW()), $4, $5,
               (SELECT sensor_id FROM reading WHERE reading_id = $1),
               true, NOW())
             RETURNING *`,
            [reading_id, alert_type_id, timestamp, message, severity]
        );

        await client.query('COMMIT');

        // Broadcast using websockets
        if (req.io) {
            req.io.emit('new_alert', newAlert.rows[0]);
        }

        res.status(201).json(newAlert.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
};

module.exports = {
    getActiveAlerts,
    getAllAlerts,
    createAlert
};
