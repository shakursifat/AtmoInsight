require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const cron = require('node-cron');
const pool = require('./src/db/pool');

// Route imports
const authRoutes = require('./src/routes/auth');
const readingsRoutes = require('./src/routes/readings');
const alertsRoutes = require('./src/routes/alerts');
const disastersRoutes = require('./src/routes/disasters');
const analyticsRoutes = require('./src/routes/analytics');
const reportsRoutes = require('./src/routes/reports');
const mapRoutes = require('./src/routes/map');

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

// Inject Socket.io into the request object so routes can access it
app.use((req, res, next) => {
    req.io = io;
    next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/readings', readingsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/disasters', disastersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/map', mapRoutes);

// Basic root route so you don't get "Cannot GET /"
app.get('/', (req, res) => {
    res.send(`
    <div style="font-family: sans-serif; padding: 20px;">
      <h1>AtmoInsight API is Running 🚀</h1>
      <p>Here are some available endpoints:</p>
      <ul>
        <li><a href="/api/demo"><b>/api/demo</b></a> - View some dummy sensor data instantly</li>
        <li><b>/api/readings</b> (GET) - Real DB data</li>
        <li><b>/api/alerts</b> (GET) - Real DB Alerts data</li>
        <li><b>/api/disasters</b> (GET) - Real DB Disaster Events data</li>
        <li><b>/api/auth/login</b> (POST) - Get an auth token</li>
      </ul>
    </div>
  `);
});

// Demo Data Route that doesn't require a database connection or authentication
app.get('/api/demo', (req, res) => {
    const dummyData = [
        { id: 1, sensor_id: 1, value: 45.2, recorded_at: new Date(Date.now() - 10000).toISOString() },
        { id: 2, sensor_id: 1, value: 48.7, recorded_at: new Date(Date.now() - 5000).toISOString() },
        { id: 3, sensor_id: 2, value: 72.1, recorded_at: new Date().toISOString() },
    ];
    res.json({
        message: "Here is some dummy sensor data (No Auth or DB connection needed to view this)",
        source: "AtmoInsight Demo Endpoint",
        data: dummyData
    });
});

// Socket.io connections
io.on('connection', (socket) => {
    console.log('A client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// PG Subscribe to alert and disaster channels
const pgClient = pool.connect().then(client => {
    client.query('LISTEN new_alert_channel');
    client.query('LISTEN new_disaster_channel');

    client.on('notification', async (msg) => {
        try {
            if (msg.channel === 'new_alert_channel') {
                const readingId = msg.payload;
                // Fetch the full alert details that was just created by the DB trigger
                const alertRes = await pool.query('SELECT * FROM alert WHERE reading_id = $1 ORDER BY timestamp DESC LIMIT 1', [readingId]);
                if (alertRes.rows.length > 0) {
                    const newAlert = alertRes.rows[0];
                    io.emit('new_alert', newAlert);
                    console.log('Real-time alert emitted via DB Trigger:', newAlert);
                }
            } else if (msg.channel === 'new_disaster_channel') {
                const eventId = msg.payload;
                // Fetch full disaster details
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
                    console.log('CRITICAL: Real-time DISASTER emitted via DB Trigger!', newDisaster);
                }
            }
        } catch (err) {
            console.error('Error processing DB notification:', err.message);
        }
    });
    console.log('PostgreSQL listener connected to new_alert_channel & new_disaster_channel');
}).catch(err => console.error('Error setting up PG listener:', err.message));

// node-cron job: Simulate sensor reading every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    console.log('Running cron job: Simulating sensor data...');
    try {
        const randomValue = (Math.random() * 100).toFixed(2);

        // source_id, sensor_id, timestamp, value, measurement_type_id, unit_id
        const insertQuery = `
      INSERT INTO reading (source_id, sensor_id, timestamp, value, measurement_type_id, unit_id)
      VALUES ($1, $2, NOW(), $3, $4, $5)
      RETURNING *;
    `;

        // Assume defaults for simulation (1, 1, ..., 1, 1)
        const result = await pool.query(insertQuery, [1, 1, randomValue, 1, 1]);
        console.log('Simulated reading inserted:', result.rows[0]);
        // The DB Trigger will automatically handle creating the alert if value > 80!

    } catch (error) {
        console.error('Error in cron job simulation:', error.message);
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
