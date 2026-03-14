import { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import ReadingTable from '../components/ReadingTable';
import ReadingChart from '../components/ReadingChart';

const API = 'http://localhost:5000/api';

// Default date range: last 30 days
const today = new Date().toISOString().split('T')[0];
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

export default function ReadingPage() {
    const { token, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();

    // Sensor passed via navigation state from SensorPage
    const sensor = location.state?.sensor || null;

    // Lookup data
    const [measurementTypes, setMeasurementTypes] = useState([]);
    const [measurementUnits, setMeasurementUnits] = useState([]);

    // Filters
    const [selectedTypeId, setSelectedTypeId] = useState('');
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const [startDate, setStartDate] = useState(thirtyDaysAgo);
    const [endDate, setEndDate] = useState(today);

    // Results
    const [readings, setReadings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const config = { headers: { Authorization: `Bearer ${token}` } };

    // Load lookup dropdowns
    useEffect(() => {
        if (!token) { navigate('/'); return; }
        const loadLookups = async () => {
            try {
                const [typesRes, unitsRes] = await Promise.all([
                    axios.get(`${API}/lookup/measurement-types`, config),
                    axios.get(`${API}/lookup/measurement-units`, config),
                ]);
                setMeasurementTypes(typesRes.data);
                setMeasurementUnits(unitsRes.data);
            } catch (err) {
                if (err.response?.status === 401) { logout(); navigate('/'); }
            }
        };
        loadLookups();
    }, [token]);

    // Auto-fetch on first load if sensor is provided
    const fetchReadings = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (sensor?.sensor_id) params.sensor_id = sensor.sensor_id;
            if (selectedTypeId) params.measurement_type_id = selectedTypeId;
            if (selectedUnitId) params.unit_id = selectedUnitId;
            if (startDate) params.start = startDate;
            if (endDate) params.end = endDate + 'T23:59:59';

            const res = await axios.get(`${API}/readings`, { ...config, params });
            setReadings(res.data);
        } catch (err) {
            if (err.response?.status === 401) { logout(); navigate('/'); }
            setError(err.response?.data?.error || 'Failed to load readings.');
        } finally {
            setLoading(false);
        }
    }, [sensor, selectedTypeId, selectedUnitId, startDate, endDate, token]);

    useEffect(() => {
        if (sensor) fetchReadings();
    }, []); // only on mount

    const unitSymbol = readings.length > 0 ? readings[0].unit_symbol : '';

    const buildQueryHint = () => {
        const parts = [];
        if (sensor?.sensor_id) parts.push(`sensor_id = ${sensor.sensor_id}`);
        if (selectedTypeId) parts.push(`measurement_type_id = ${selectedTypeId}`);
        if (selectedUnitId) parts.push(`unit_id = ${selectedUnitId}`);
        if (startDate) parts.push(`timestamp >= '${startDate}'`);
        if (endDate) parts.push(`timestamp <= '${endDate}'`);
        return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '(no filters)';
    };

    return (
        <div className="sp-root">
            {/* Navbar */}
            <nav className="sp-navbar">
                <div className="sp-navbar-left">
                    <button className="btn-back" onClick={() => navigate('/sensors')}>
                        ← Sensor List
                    </button>
                    <div>
                        <span className="sp-brand">📊 Reading Explorer</span>
                        <span className="sp-brand-sub"> — AtmoInsight DB Demo</span>
                    </div>
                </div>
                <button className="btn-signout" onClick={() => { logout(); navigate('/'); }}>Sign Out</button>
            </nav>

            <div className="sp-content">
                {/* Page Header */}
                <div className="sp-page-header">
                    <h1 className="text-gradient">Sensor Readings</h1>
                    <p className="sp-page-desc">
                        Query the <code>Reading</code>, <code>MeasurementType</code>, and <code>MeasurementUnit</code> tables with applied filters.
                    </p>
                </div>

                {/* Sensor Info Card */}
                {sensor ? (
                    <div className="glass-card rp-sensor-info">
                        <div className="rp-sensor-grid">
                            <div>
                                <span className="rp-info-label">Sensor</span>
                                <span className="rp-info-value">#{sensor.sensor_id} — {sensor.name || 'Unnamed'}</span>
                            </div>
                            <div>
                                <span className="rp-info-label">Type</span>
                                <span className="rp-info-value">{sensor.type_name || '—'}</span>
                            </div>
                            <div>
                                <span className="rp-info-label">Location</span>
                                <span className="rp-info-value">{sensor.location_name || '—'}</span>
                            </div>
                            <div>
                                <span className="rp-info-label">Status</span>
                                <span className={`sp-badge ${(sensor.status || '').toLowerCase() === 'active' ? 'sp-badge-active' : 'sp-badge-inactive'}`}>
                                    {sensor.status || 'Unknown'}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="sp-error" style={{ marginBottom: '1.5rem' }}>
                        ⚠️ No sensor selected. <button className="sp-link-btn" onClick={() => navigate('/sensors')}>Go to Sensor List</button>
                    </div>
                )}

                {/* Filter Panel */}
                <div className="glass-card sp-filter-card">
                    <h2 className="sp-section-title"><span>🔎</span> Filter Readings</h2>
                    <div className="sp-filter-row rp-filter-row">
                        <div className="sp-filter-group">
                            <label htmlFor="mtype-select" className="sp-label">Measurement Type</label>
                            <select
                                id="mtype-select"
                                className="sp-select"
                                value={selectedTypeId}
                                onChange={e => setSelectedTypeId(e.target.value)}
                            >
                                <option value="">— All Types —</option>
                                {measurementTypes.map(t => (
                                    <option key={t.measurement_type_id} value={t.measurement_type_id}>
                                        {t.type_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="sp-filter-group">
                            <label htmlFor="unit-select" className="sp-label">Unit</label>
                            <select
                                id="unit-select"
                                className="sp-select"
                                value={selectedUnitId}
                                onChange={e => setSelectedUnitId(e.target.value)}
                            >
                                <option value="">— All Units —</option>
                                {measurementUnits.map(u => (
                                    <option key={u.unit_id} value={u.unit_id}>
                                        {u.unit_name} {u.symbol ? `(${u.symbol})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="sp-filter-group">
                            <label htmlFor="start-date" className="sp-label">Start Date</label>
                            <input
                                id="start-date"
                                type="date"
                                className="sp-select"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                        </div>

                        <div className="sp-filter-group">
                            <label htmlFor="end-date" className="sp-label">End Date</label>
                            <input
                                id="end-date"
                                type="date"
                                className="sp-select"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>

                        <div className="sp-filter-actions">
                            <button
                                id="refresh-readings-btn"
                                className="btn-primary"
                                onClick={fetchReadings}
                                disabled={loading}
                            >
                                {loading ? '⏳ Loading...' : '🔄 Refresh'}
                            </button>
                        </div>
                    </div>

                    {/* DB hint */}
                    <div className="sp-db-hint">
                        <span className="sp-db-hint-label">DB Query:</span>
                        <code>SELECT r.*, mt.type_name, mu.unit_name FROM reading r JOIN ... {buildQueryHint()} ORDER BY timestamp DESC</code>
                    </div>
                </div>

                {/* Error */}
                {error && <div className="sp-error">⚠️ {error}</div>}

                {/* Chart */}
                {readings.length > 0 && (
                    <div className="glass-card">
                        <h2 className="sp-section-title" style={{ marginBottom: '1.25rem' }}>
                            <span>📈</span> Time-Series Trend
                            <span className="rp-count-badge">{readings.length} points</span>
                        </h2>
                        <ReadingChart readings={readings} unitSymbol={unitSymbol} />
                    </div>
                )}

                {/* Table */}
                <div className="glass-card">
                    <div className="sp-results-header">
                        <h2 className="sp-section-title">
                            <span>📋</span> Reading Records
                        </h2>
                        {readings.length > 0 && (
                            <span className="sp-count">{readings.length} record{readings.length !== 1 ? 's' : ''}</span>
                        )}
                    </div>
                    {loading ? (
                        <div className="rp-loading">⏳ Fetching readings from database...</div>
                    ) : (
                        <ReadingTable readings={readings} />
                    )}
                </div>
            </div>
        </div>
    );
}
