import { useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale,
    BarElement, Title, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const API_URL = 'http://localhost:5000/api/sql';

const FUNCTIONS = {
    pollution_avg: {
        key: 'pollution_avg',
        label: 'get_pollution_average',
        icon: '🌫️',
        description: 'Returns avg, min, max, reading count for a given measurement type at a specific location over a configurable lookback window.',
        signature: 'get_pollution_average(p_location_id, p_measurement_type_name, p_interval)',
        sqlPreview: `SELECT * FROM get_pollution_average(
  p_location_id           := 1,         -- location_id from location table
  p_measurement_type_name := 'PM2.5',   -- e.g. 'Temperature', 'NO2'
  p_interval              := '30 days'  -- lookback window
);`,
        params: [
            { key: 'location_id', label: 'Location ID', type: 'number', default: '1', placeholder: 'e.g. 1' },
            { key: 'measurement', label: 'Measurement Type', type: 'text', default: 'PM2.5', placeholder: 'e.g. PM2.5, Temperature' },
            { key: 'interval', label: 'Lookback Interval', type: 'text', default: '30 days', placeholder: 'e.g. 7 days, 365 days' },
        ],
        getChartData: (rows) => ({
            labels: rows.map(r => r.measurement || r.location_name || 'Result'),
            datasets: [
                { label: 'Avg Value', data: rows.map(r => parseFloat(r.avg_value)), backgroundColor: 'rgba(6, 182, 212, 0.6)', borderColor: '#06b6d4', borderWidth: 2 },
                { label: 'Min Value', data: rows.map(r => parseFloat(r.min_value)), backgroundColor: 'rgba(34, 197, 94, 0.6)', borderColor: '#22c55e', borderWidth: 2 },
                { label: 'Max Value', data: rows.map(r => parseFloat(r.max_value)), backgroundColor: 'rgba(239, 68, 68, 0.6)', borderColor: '#ef4444', borderWidth: 2 },
            ]
        })
    },
    disaster_summary: {
        key: 'disaster_summary',
        label: 'get_disaster_impact_summary',
        icon: '🌊',
        description: 'Aggregated summary of all disaster impacts optionally filtered by subgroup (e.g. Hydrological) and/or year.',
        signature: 'get_disaster_impact_summary(p_subgroup_name, p_year)',
        sqlPreview: `SELECT * FROM get_disaster_impact_summary(
  p_subgroup_name := NULL,  -- e.g. 'Hydrological', or NULL for all
  p_year          := NULL   -- e.g. 2024, or NULL for all years
);`,
        params: [
            { key: 'subgroup', label: 'Subgroup Name', type: 'text', default: '', placeholder: 'Leave blank for all (e.g. Hydrological)' },
            { key: 'year', label: 'Year', type: 'number', default: '', placeholder: 'Leave blank for all (e.g. 2024)' },
        ],
        getChartData: (rows) => ({
            labels: rows.map(r => r.disaster_type || r.subgroup),
            datasets: [
                { label: 'Total Deaths', data: rows.map(r => parseInt(r.total_deaths) || 0), backgroundColor: 'rgba(239, 68, 68, 0.7)', borderColor: '#ef4444', borderWidth: 2 },
                { label: 'Total Injured', data: rows.map(r => parseInt(r.total_injuries) || 0), backgroundColor: 'rgba(245, 158, 11, 0.7)', borderColor: '#f59e0b', borderWidth: 2 },
                { label: 'Total Affected', data: rows.map(r => parseInt(r.total_affected) || 0), backgroundColor: 'rgba(139, 92, 246, 0.4)', borderColor: '#8b5cf6', borderWidth: 2 },
            ]
        })
    },
    nearby_sensors: {
        key: 'nearby_sensors',
        label: 'get_nearby_sensors',
        icon: '📡',
        description: 'Returns all sensors within a radius (metres) of a lon/lat point with their latest reading. Uses PostGIS ST_DWithin.',
        signature: 'get_nearby_sensors(p_longitude, p_latitude, p_radius_metres, p_measurement)',
        sqlPreview: `SELECT * FROM get_nearby_sensors(
  p_longitude     := 90.4074,   -- WGS-84 longitude (e.g. Dhaka)
  p_latitude      := 23.7104,   -- WGS-84 latitude
  p_radius_metres := 15000,     -- 15 km radius
  p_measurement   := 'PM2.5'   -- NULL to skip reading lookup
);`,
        params: [
            { key: 'longitude', label: 'Longitude', type: 'number', default: '90.4074', placeholder: 'e.g. 90.4074' },
            { key: 'latitude', label: 'Latitude', type: 'number', default: '23.7104', placeholder: 'e.g. 23.7104' },
            { key: 'radius', label: 'Radius (metres)', type: 'number', default: '15000', placeholder: 'e.g. 15000' },
            { key: 'measurement', label: 'Measurement Type', type: 'text', default: 'PM2.5', placeholder: 'e.g. PM2.5' },
        ],
        getChartData: (rows) => ({
            labels: rows.map(r => r.sensor_name || `Sensor ${r.sensor_id}`),
            datasets: [
                { label: 'Distance (m)', data: rows.map(r => parseFloat(r.distance_metres) || 0), backgroundColor: 'rgba(6, 182, 212, 0.6)', borderColor: '#06b6d4', borderWidth: 2 },
                { label: 'Latest Value', data: rows.map(r => parseFloat(r.latest_value) || 0), backgroundColor: 'rgba(245, 158, 11, 0.6)', borderColor: '#f59e0b', borderWidth: 2 },
            ]
        })
    }
};

const CHART_OPTIONS = {
    responsive: true,
    plugins: {
        legend: { labels: { color: '#e2e8f0' } },
        title: { display: false }
    },
    scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
    }
};

export default function FunctionDemo() {
    const { token } = useContext(AuthContext);
    const [selectedFn, setSelectedFn] = useState('pollution_avg');
    const [params, setParams] = useState({});
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const fn = FUNCTIONS[selectedFn];

    const handleFnChange = (key) => {
        setSelectedFn(key);
        setResult(null);
        setError(null);
        setParams({});
    };

    const handleParamChange = (key, value) => {
        setParams(prev => ({ ...prev, [key]: value }));
    };

    const handleCall = async () => {
        setLoading(true);
        setError(null);
        setResult(null);

        // Build query params with defaults
        const queryParams = {};
        fn.params.forEach(p => {
            queryParams[p.key] = params[p.key] !== undefined ? params[p.key] : p.default;
        });

        try {
            const urlParams = new URLSearchParams({ fn: selectedFn, ...queryParams });
            const res = await axios.get(
                `${API_URL}/function-demo?${urlParams.toString()}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    const hasChartData = result?.rows?.length > 0;

    return (
        <div className="sql-section">
            <div className="sql-section-header">
                <div>
                    <h2 className="sql-section-title">
                        <span className="sql-icon">🔧</span> Function Demo
                    </h2>
                    <p className="sql-section-desc">
                        Call stored PostgreSQL functions with parameters and visualize results as charts.
                    </p>
                </div>
            </div>

            {/* Function selector tabs */}
            <div className="fn-tabs">
                {Object.values(FUNCTIONS).map(f => (
                    <button
                        key={f.key}
                        className={`fn-tab ${selectedFn === f.key ? 'active' : ''}`}
                        onClick={() => handleFnChange(f.key)}
                    >
                        <span>{f.icon}</span>
                        <span className="fn-tab-label">{f.label}</span>
                    </button>
                ))}
            </div>

            {/* Description */}
            <div className="fn-description">
                <p>{fn.description}</p>
                <code className="fn-signature">{fn.signature}</code>
            </div>

            {/* SQL Preview */}
            <div className="code-editor-wrapper" style={{ marginBottom: '1.5rem' }}>
                <div className="code-editor-topbar">
                    <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
                    <span className="editor-label">functions.sql — example call</span>
                </div>
                <pre className="code-readonly">{fn.sqlPreview}</pre>
            </div>

            {/* Parameter inputs */}
            <div className="fn-params-grid">
                {fn.params.map(p => (
                    <div key={p.key} className="fn-param-field">
                        <label className="fn-param-label">{p.label}</label>
                        <input
                            type={p.type}
                            className="fn-param-input"
                            value={params[p.key] !== undefined ? params[p.key] : p.default}
                            onChange={e => handleParamChange(p.key, e.target.value)}
                            placeholder={p.placeholder}
                        />
                    </div>
                ))}
            </div>

            <button
                className={`btn-execute ${loading ? 'loading' : ''}`}
                onClick={handleCall}
                disabled={loading}
                style={{ marginBottom: '1.5rem' }}
            >
                {loading ? '⏳ Calling…' : '🔧 Call Function'}
            </button>

            {error && (
                <div className="query-error">
                    <span className="query-error-icon">✗</span>
                    <strong>Error:</strong> {error}
                </div>
            )}

            {result && (
                <>
                    <div className="results-meta" style={{ marginBottom: '1rem' }}>
                        <span className="results-count">{result.rowCount} row{result.rowCount !== 1 ? 's' : ''} returned</span>
                        <span className="results-time">in {result.executionTimeMs}ms</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>via <code>{result.functionName}()</code></span>
                    </div>

                    {/* Chart */}
                    {hasChartData && (
                        <div className="fn-chart-wrapper">
                            <Bar data={fn.getChartData(result.rows)} options={CHART_OPTIONS} />
                        </div>
                    )}

                    {/* Results Table */}
                    {result.rows.length === 0 ? (
                        <div className="results-empty">Function returned no rows with these parameters.</div>
                    ) : (
                        <div className="results-table-wrapper">
                            <table className="results-table">
                                <thead>
                                    <tr>
                                        {result.fields.map((f, i) => <th key={i}>{f}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.rows.map((row, ri) => (
                                        <tr key={ri}>
                                            {result.fields.map((f, ci) => (
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
                </>
            )}
        </div>
    );
}
