const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: false },
});

const indexes = [
    {
        name: 'idx_alert_active_timestamp',
        sql: 'CREATE INDEX IF NOT EXISTS idx_alert_active_timestamp ON alert (timestamp DESC) WHERE is_active = true',
    },
    {
        name: 'idx_alert_sensor_active',
        sql: 'CREATE INDEX IF NOT EXISTS idx_alert_sensor_active ON alert (sensor_id, alert_type_id) WHERE is_active = true',
    },
    {
        name: 'idx_reading_type_timestamp',
        sql: 'CREATE INDEX IF NOT EXISTS idx_reading_type_timestamp ON reading (measurement_type_id, timestamp DESC)',
    },
    {
        name: 'idx_reading_sensor_type_ts',
        sql: 'CREATE INDEX IF NOT EXISTS idx_reading_sensor_type_ts ON reading (sensor_id, measurement_type_id, timestamp DESC)',
    },
    {
        name: 'idx_disasterevent_start_desc',
        sql: 'CREATE INDEX IF NOT EXISTS idx_disasterevent_start_desc ON disasterevent (start_timestamp DESC)',
    },
    {
        name: 'idx_disasterevent_type_loc_ts',
        sql: 'CREATE INDEX IF NOT EXISTS idx_disasterevent_type_loc_ts ON disasterevent (disaster_type_id, location_id, start_timestamp DESC)',
    },
    {
        name: 'idx_disasterimpact_event',
        sql: 'CREATE INDEX IF NOT EXISTS idx_disasterimpact_event ON disasterimpact (event_id)',
    },
    {
        name: 'idx_alertthreshold_measurement',
        sql: 'CREATE INDEX IF NOT EXISTS idx_alertthreshold_measurement ON alertthreshold (measurement_type_id)',
    },
];

(async () => {
    let ok = 0;
    for (const idx of indexes) {
        try {
            await pool.query(idx.sql);
            console.log('✅ OK:', idx.name);
            ok++;
        } catch (e) {
            console.error('❌ FAIL:', idx.name, '-', e.message);
        }
    }
    await pool.end();
    console.log(`\nDone — ${ok}/${indexes.length} indexes created.`);
})();
