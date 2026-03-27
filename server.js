require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const cron = require('node-cron');
const pool = require('./src/db/pool');
const { fetchAndStoreWeatherData } = require('./src/services/openMeteoService');
const { fetchAndStoreOpenAQData } = require('./src/services/openAQService');
const { fetchAndStoreCurrentConditions } = require('./src/services/openWeatherMapService');

// Route imports
const authRoutes = require('./src/routes/auth');
const readingsRoutes = require('./src/routes/readings');
const alertsRoutes = require('./src/routes/alerts');
const disastersRoutes = require('./src/routes/disasters');
const analyticsRoutes = require('./src/routes/analytics');
const reportsRoutes = require('./src/routes/reports');
const mapRoutes = require('./src/routes/map');
const sensorsRoutes = require('./src/routes/sensors');
const lookupRoutes = require('./src/routes/lookup');
const currentConditionsRoutes = require('./src/routes/currentConditions');

const app = express();
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

// Inject Socket.io into every request so routes can emit events
app.use((req, res, next) => {
    req.io = io;
    next();
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/readings', readingsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/disasters', disastersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/sensors', sensorsRoutes);
app.use('/api/lookup', lookupRoutes);
app.use('/api/current-conditions', currentConditionsRoutes);

// ─── Root / Health ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.send(`
    <div style="font-family: sans-serif; padding: 20px;">
      <h1>AtmoInsight API is Running 🚀</h1>
      <p>Bangladesh-centered real-time environmental monitoring system</p>
      <ul>
        <li><a href="/api/current-conditions"><b>/api/current-conditions</b></a> — Latest readings per measurement type</li>
        <li><b>/api/readings</b> (GET) — All sensor readings (auth required)</li>
        <li><b>/api/alerts/active</b> (GET) — Active environment alerts</li>
        <li><b>/api/map/sensors</b> (GET) — GeoJSON sensor map data</li>
        <li><b>/api/auth/login</b> (POST) — Get auth token</li>
        <li><b>/api/readings/trigger-update</b> (POST) — Manually trigger all sensor syncs</li>
      </ul>
    </div>
  `);
});

// ─── Demo endpoint ────────────────────────────────────────────────────────────
app.get('/api/demo', (req, res) => {
    const dummyData = [
        { id: 1, sensor_id: 1, value: 45.2, recorded_at: new Date(Date.now() - 10000).toISOString() },
        { id: 2, sensor_id: 1, value: 48.7, recorded_at: new Date(Date.now() - 5000).toISOString() },
        { id: 3, sensor_id: 2, value: 72.1, recorded_at: new Date().toISOString() },
    ];
    res.json({
        message: "Dummy sensor data (no auth/DB required)",
        source: "AtmoInsight Demo Endpoint",
        data: dummyData
    });
});

// ─── Admin: Manual trigger for all sensor syncs ───────────────────────────────
app.post('/api/readings/trigger-update', async (req, res) => {
    console.log('[Manual Trigger] Starting full sensor data sync...');
    res.json({ status: 'started', message: 'Full sync triggered. Check server logs for progress.' });

    // Run all three data fetches in the background
    try {
        const [meteoResult, owmResult, aqResult] = await Promise.all([
            fetchAndStoreWeatherData(),
            fetchAndStoreCurrentConditions(),
            fetchAndStoreOpenAQData(),
        ]);
        const summary = { meteo: meteoResult, owm: owmResult, openaq: aqResult };
        console.log('[Manual Trigger] Full sync complete:', JSON.stringify(summary));
        io.emit('sensor_update', { source: 'manual-trigger', timestamp: new Date().toISOString(), summary });
    } catch (err) {
        console.error('[Manual Trigger] Sync failed:', err.message);
    }
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('[Socket] Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('[Socket] Client disconnected:', socket.id);
    });
});

// ─── PostgreSQL LISTEN — alert & disaster channels ────────────────────────────
pool.connect().then(client => {
    client.query('LISTEN new_alert_channel');
    client.query('LISTEN new_disaster_channel');

    client.on('notification', async (msg) => {
        try {
            if (msg.channel === 'new_alert_channel') {
                const readingId = msg.payload;
                const alertRes = await pool.query(
                    'SELECT * FROM alert WHERE reading_id = $1 ORDER BY timestamp DESC LIMIT 1',
                    [readingId]
                );
                if (alertRes.rows.length > 0) {
                    const newAlert = alertRes.rows[0];
                    io.emit('new_alert', newAlert);
                    console.log('[DB Trigger] Real-time alert emitted:', newAlert);
                }
            } else if (msg.channel === 'new_disaster_channel') {
                const eventId = msg.payload;
                const disasterRes = await pool.query(`
                    SELECT d.*, dt.type_name, ds.subgroup_name
                    FROM disasterevent d
                    LEFT JOIN disastertype dt ON d.disaster_type_id = dt.type_id
                    LEFT JOIN disastersubgroup ds ON dt.subgroup_id = ds.subgroup_id
                    WHERE d.event_id = $1
                `, [eventId]);

                if (disasterRes.rows.length > 0) {
                    const newDisaster = disasterRes.rows[0];
                    io.emit('new_disaster', newDisaster);
                    console.log('[DB Trigger] CRITICAL: Real-time disaster emitted:', newDisaster);
                }
            }
        } catch (err) {
            console.error('[DB Trigger] Error processing notification:', err.message);
        }
    });
    console.log('[DB] PostgreSQL listener connected to alert + disaster channels');
}).catch(err => console.error('[DB] Error setting up PG listener:', err.message));

// ─── Helper: run all data fetches and emit socket event ──────────────────────
async function runAllDataFetches(source) {
    console.log(`\n[Cron] Starting scheduled sync (source: ${source})...`);
    try {
        const [meteoResult, owmResult, aqResult] = await Promise.allSettled([
            fetchAndStoreWeatherData(),
            fetchAndStoreCurrentConditions(),
            fetchAndStoreOpenAQData(),
        ]);

        const summary = {
            open_meteo: meteoResult.status === 'fulfilled' ? meteoResult.value : { status: 'error' },
            open_weather_map: owmResult.status === 'fulfilled' ? owmResult.value : { status: 'error' },
            openaq: aqResult.status === 'fulfilled' ? aqResult.value : { status: 'error' },
        };

        const totalInserted =
            (summary.open_meteo.count || 0) +
            (summary.open_weather_map.count || 0) +
            (summary.openaq.count || 0);

        console.log(`[Cron] Sync complete. Total new readings: ${totalInserted}`);

        // Emit to all connected frontend clients so they can refresh
        io.emit('sensor_update', {
            source,
            timestamp: new Date().toISOString(),
            totalInserted,
            summary
        });
    } catch (err) {
        console.error('[Cron] Unhandled sync error:', err.message);
    }
}

// ─── Cron Schedule ────────────────────────────────────────────────────────────
// Open-Meteo (free, no key) — every 30 minutes
cron.schedule('*/30 * * * *', () => runAllDataFetches('scheduled-30min'));

// OpenWeatherMap + OpenAQ — every 60 minutes (to stay within free tier limits)
// They are included in runAllDataFetches above, but we run a dedicated 60-min
// fetch as well to maximize coverage in off-peak periods.
cron.schedule('0 * * * *', () => {
    console.log('[Cron] Hourly dedicated OWM + OpenAQ sync running...');
    Promise.allSettled([
        fetchAndStoreCurrentConditions(),
        fetchAndStoreOpenAQData()
    ]).then(results => {
        const anySuccess = results.some(r => r.status === 'fulfilled' && r.value?.status === 'success');
        if (anySuccess) {
            io.emit('sensor_update', { source: 'hourly-aq', timestamp: new Date().toISOString() });
        }
    });
});

// ─── Startup: run an immediate sync so data is fresh on boot ─────────────────
console.log('[Startup] Running initial sensor data sync...');
setTimeout(() => runAllDataFetches('startup'), 3000); // 3s delay so DB is ready

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`\n✅  AtmoInsight Server running on port ${PORT}`);
    console.log(`   Open-Meteo sync:       every 30 min (free, no key needed)`);
    console.log(`   OpenWeatherMap sync:   every 30 min (${process.env.OPENWEATHERMAP_API_KEY ? '✅ key found' : '⚠️  key missing — add OPENWEATHERMAP_API_KEY to .env'})`);
    console.log(`   OpenAQ sync:           every 60 min (${process.env.OPENAQ_API_KEY ? '✅ key found' : '⚠️  key missing — add OPENAQ_API_KEY to .env'})\n`);
});
