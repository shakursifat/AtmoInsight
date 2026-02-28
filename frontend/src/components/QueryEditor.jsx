import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';

const SOCKET_URL = 'http://localhost:5000';
const API_URL = 'http://localhost:5000/api/sql';

const EXAMPLE_QUERIES = [
    {
        label: 'Q1 — Daily PM2.5 averages per sensor',
        query: `SELECT s.name AS sensor_name, l.name AS location_name,
    DATE_TRUNC('day', r.timestamp) AS reading_day,
    ROUND(AVG(r.value)::numeric, 2) AS avg_pm25,
    COUNT(*) AS reading_count
FROM reading r
JOIN sensor s ON r.sensor_id = s.sensor_id
JOIN location l ON s.location_id = l.location_id
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
WHERE mt.type_name = 'PM2.5'
GROUP BY s.name, l.name, DATE_TRUNC('day', r.timestamp)
ORDER BY reading_day DESC, avg_pm25 DESC
LIMIT 20;`
    },
    {
        label: 'Q2 — Sensors within 15 km of Dhaka (geospatial)',
        query: `SELECT s.sensor_id, s.name AS sensor_name, st.type_name AS sensor_type,
    l.name AS location_name, l.region,
    ROUND(ST_Distance(l.coordinates::geography, ST_MakePoint(90.4074, 23.7104)::geography)::numeric / 1000, 2) AS distance_km,
    s.status
FROM sensor s
JOIN sensortype st ON s.sensor_type_id = st.sensor_type_id
JOIN location l ON s.location_id = l.location_id
WHERE ST_DWithin(l.coordinates::geography, ST_MakePoint(90.4074, 23.7104)::geography, 15000)
ORDER BY distance_km;`
    },
    {
        label: 'Q3 — Alert summary with sensor & location',
        query: `SELECT a.alert_id, a.severity, a.timestamp AS alert_time,
    at2.type_name AS alert_type, a.message,
    r.value AS trigger_value, mt.type_name AS measurement,
    mu.symbol AS unit, s.name AS sensor_name, l.name AS location_name
FROM alert a
JOIN alerttype at2 ON a.alert_type_id = at2.alert_type_id
JOIN reading r ON a.reading_id = r.reading_id
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
JOIN measurementunit mu ON r.unit_id = mu.unit_id
JOIN sensor s ON r.sensor_id = s.sensor_id
JOIN location l ON s.location_id = l.location_id
ORDER BY a.timestamp DESC LIMIT 20;`
    },
    {
        label: 'Q4 — Monthly PM2.5 trend (last 12 months)',
        query: `SELECT DATE_TRUNC('month', r.timestamp) AS month, l.region,
    ROUND(AVG(r.value)::numeric, 2) AS avg_pm25, COUNT(*) AS reading_count,
    CASE WHEN AVG(r.value) > 75 THEN 'EXCEEDS WHO LIMIT' ELSE 'WITHIN LIMIT' END AS who_status
FROM reading r
JOIN sensor s ON r.sensor_id = s.sensor_id
JOIN location l ON s.location_id = l.location_id
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
WHERE mt.type_name = 'PM2.5' AND r.timestamp >= NOW() - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', r.timestamp), l.region
ORDER BY month DESC, avg_pm25 DESC;`
    },
    {
        label: 'Q5 — Disaster overview with impact summary',
        query: `SELECT de.event_id, ds.subgroup_name AS disaster_category,
    dt.type_name AS disaster_type, de.severity,
    de.start_timestamp, l.name AS location_name,
    di.deaths, di.injuries, di.affected_people,
    TO_CHAR(di.economic_loss, 'FM$999,999,999.00') AS economic_loss_usd
FROM disasterevent de
JOIN disastertype dt ON de.disaster_type_id = dt.type_id
JOIN disastersubgroup ds ON dt.subgroup_id = ds.subgroup_id
JOIN location l ON de.location_id = l.location_id
LEFT JOIN disasterimpact di ON de.event_id = di.event_id
ORDER BY de.start_timestamp DESC LIMIT 20;`
    },
    {
        label: 'Q6 — Citizen reports (open & in-progress)',
        query: `SELECT ur.report_id, u.username, u.email,
    l.name AS location_name, l.region,
    rs.status_name AS status, ur.timestamp AS reported_at, ur.description
FROM userreport ur
JOIN users u ON ur.user_id = u.user_id
JOIN location l ON ur.location_id = l.location_id
JOIN reportstatus rs ON ur.status_id = rs.status_id
WHERE rs.status_name IN ('Open', 'In Progress')
ORDER BY ur.timestamp DESC;`
    },
    {
        label: 'Q7 — Upcoming high-probability forecasts',
        query: `SELECT f.forecast_id, wm.model_name, wm.source AS model_source,
    f.predicted_timestamp, ROUND(f.probability * 100, 1) AS probability_pct,
    l.name AS location_name, l.region, f.description
FROM forecast f
JOIN weathermodel wm ON f.weather_model_id = wm.model_id
JOIN location l ON f.location_id = l.location_id
WHERE f.probability > 0.60 AND f.predicted_timestamp > NOW()
ORDER BY f.probability DESC, f.predicted_timestamp LIMIT 20;`
    },
    {
        label: 'Q8 — Satellite vs ground PM2.5 correlation',
        query: `SELECT so.obs_id, so.timestamp AS satellite_obs_time, so.resolution,
    so.data_json->>'satellite' AS satellite_name,
    (so.data_json->>'aod')::numeric AS aerosol_optical_depth,
    r.value AS ground_pm25, r.timestamp AS ground_reading_time,
    s.name AS sensor_name, l.name AS location_name
FROM satelliteobservation so
JOIN reading r ON so.reading_id = r.reading_id
JOIN sensor s ON r.sensor_id = s.sensor_id
JOIN location l ON s.location_id = l.location_id
JOIN measurementtype mt ON r.measurement_type_id = mt.measurement_type_id
WHERE mt.type_name = 'PM2.5' AND so.data_json ? 'aod'
ORDER BY so.timestamp LIMIT 20;`
    },
    {
        label: 'Q9 — Notification delivery audit',
        query: `SELECT a.alert_id, at2.type_name AS alert_type, a.severity, nl.method,
    COUNT(*) AS total_sent,
    SUM(CASE WHEN nl.status = 'Sent' THEN 1 ELSE 0 END) AS delivered,
    SUM(CASE WHEN nl.status = 'Failed' THEN 1 ELSE 0 END) AS failed,
    ROUND(100.0 * SUM(CASE WHEN nl.status = 'Sent' THEN 1 ELSE 0 END) / COUNT(*), 1) AS delivery_rate_pct
FROM notificationlog nl
JOIN alert a ON nl.alert_id = a.alert_id
JOIN alerttype at2 ON a.alert_type_id = at2.alert_type_id
GROUP BY a.alert_id, at2.type_name, a.severity, nl.method
ORDER BY a.alert_id, nl.method;`
    },
    {
        label: 'Q10 — Climate indicators vs. historical aggregation',
        query: `SELECT ci.indicator_id, ci.name AS indicator_name, ci.value, ci.period,
    mt.type_name AS measurement_type,
    ha.avg_value AS period_avg, ha.max_value AS period_max, ha.min_value AS period_min,
    ha.timestamp_range AS aggregation_window
FROM climateindicator ci
JOIN historicalaggregation ha ON ci.agg_id = ha.agg_id
JOIN measurementtype mt ON ha.measurement_type_id = mt.measurement_type_id
ORDER BY ci.period;`
    }
];

export default function QueryEditor() {
    const { token, user } = useContext(AuthContext);
    const [query, setQuery] = useState(EXAMPLE_QUERIES[0].query);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [liveEvents, setLiveEvents] = useState([]);
    const [selectedExample, setSelectedExample] = useState(0);

    const isAdmin = user?.role_id === 1 || user?.role === 'admin';

    useEffect(() => {
        const socket = io(SOCKET_URL);
        socket.on('query_executed', (evt) => {
            setLiveEvents(prev => [{ ...evt, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 5));
        });
        return () => socket.disconnect();
    }, []);

    const handleExecute = async () => {
        setError(null);
        setResults(null);
        setLoading(true);
        try {
            const res = await axios.post(
                `${API_URL}/execute-query`,
                { query },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setResults(res.data);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExampleChange = (e) => {
        const idx = parseInt(e.target.value);
        setSelectedExample(idx);
        setQuery(EXAMPLE_QUERIES[idx].query);
        setResults(null);
        setError(null);
    };

    return (
        <div className="sql-section">
            <div className="sql-section-header">
                <div>
                    <h2 className="sql-section-title">
                        <span className="sql-icon">⚡</span> Query Lab
                    </h2>
                    <p className="sql-section-desc">
                        Execute SQL queries against the live AtmoInsight database.
                        {!isAdmin && <span className="role-badge citizen"> SELECT only (your role)</span>}
                        {isAdmin && <span className="role-badge admin"> Admin — full access</span>}
                    </p>
                </div>
            </div>

            {/* Example Query Selector */}
            <div className="query-toolbar">
                <select className="example-select" value={selectedExample} onChange={handleExampleChange}>
                    {EXAMPLE_QUERIES.map((q, i) => (
                        <option key={i} value={i}>{q.label}</option>
                    ))}
                </select>
                <button
                    className={`btn-execute ${loading ? 'loading' : ''}`}
                    onClick={handleExecute}
                    disabled={loading}
                >
                    {loading ? '⏳ Running…' : '▶ Execute'}
                </button>
            </div>

            {/* SQL Textarea */}
            <div className="code-editor-wrapper">
                <div className="code-editor-topbar">
                    <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
                    <span className="editor-label">SQL</span>
                </div>
                <textarea
                    className="code-editor-textarea"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    spellCheck={false}
                    rows={10}
                />
            </div>

            {/* Error */}
            {error && (
                <div className="query-error">
                    <span className="query-error-icon">✗</span>
                    <strong>Error:</strong> {error}
                </div>
            )}

            {/* Results Table */}
            {results && (
                <div className="results-container">
                    <div className="results-meta">
                        <span className="results-count">{results.rowCount} row{results.rowCount !== 1 ? 's' : ''} returned</span>
                        <span className="results-time">in {results.executionTimeMs}ms</span>
                    </div>
                    {results.rows.length === 0 ? (
                        <div className="results-empty">Query returned no rows.</div>
                    ) : (
                        <div className="results-table-wrapper">
                            <table className="results-table">
                                <thead>
                                    <tr>
                                        {results.fields.map((f, i) => (
                                            <th key={i}>{f}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.rows.map((row, ri) => (
                                        <tr key={ri}>
                                            {results.fields.map((f, ci) => (
                                                <td key={ci}>
                                                    {row[f] === null ? <span className="null-val">NULL</span> :
                                                        typeof row[f] === 'object' ? JSON.stringify(row[f]) :
                                                            String(row[f])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Live Socket Events */}
            {liveEvents.length > 0 && (
                <div className="live-events-panel">
                    <div className="live-events-header">
                        <span className="pulse-dot" /> Real-time Events
                    </div>
                    {liveEvents.map((e, i) => (
                        <div key={i} className="live-event-item">
                            <span className="live-event-time">{e.at}</span>
                            <span>Query executed by <strong>{e.executedBy}</strong> — {e.rowCount} rows in {e.executionTimeMs}ms</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
