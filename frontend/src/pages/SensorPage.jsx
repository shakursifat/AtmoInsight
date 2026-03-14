import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import SensorTable from '../components/SensorTable';

const API = 'http://localhost:5000/api';

export default function SensorPage() {
    const { token, logout } = useContext(AuthContext);
    const navigate = useNavigate();

    // Dropdown data
    const [sensorTypes, setSensorTypes] = useState([]);
    const [locations, setLocations] = useState([]);

    // Filter selections
    const [selectedTypeId, setSelectedTypeId] = useState('');
    const [selectedLocationId, setSelectedLocationId] = useState('');

    // Results
    const [sensors, setSensors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [searched, setSearched] = useState(false);

    const config = { headers: { Authorization: `Bearer ${token}` } };

    // Load dropdowns on mount
    useEffect(() => {
        if (!token) { navigate('/'); return; }

        const loadDropdowns = async () => {
            try {
                const [typesRes, locsRes] = await Promise.all([
                    axios.get(`${API}/sensors/types`, config),
                    axios.get(`${API}/sensors/locations`, config),
                ]);
                setSensorTypes(typesRes.data);
                setLocations(locsRes.data);
            } catch (err) {
                if (err.response?.status === 401) { logout(); navigate('/'); }
                setError('Failed to load filter options.');
            }
        };
        loadDropdowns();
    }, [token]);

    const fetchSensors = async () => {
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (selectedTypeId) params.type_id = selectedTypeId;
            if (selectedLocationId) params.location_id = selectedLocationId;

            const res = await axios.get(`${API}/sensors`, { ...config, params });
            setSensors(res.data);
            setSearched(true);
        } catch (err) {
            if (err.response?.status === 401) { logout(); navigate('/'); }
            setError(err.response?.data?.error || 'Failed to load sensors.');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setSelectedTypeId('');
        setSelectedLocationId('');
        setSensors([]);
        setSearched(false);
        setError('');
    };

    return (
        <div className="sp-root">
            {/* Navbar */}
            <nav className="sp-navbar">
                <div className="sp-navbar-left">
                    <button className="btn-back" onClick={() => navigate('/dashboard')}>
                        ← Dashboard
                    </button>
                    <div>
                        <span className="sp-brand">🌡️ Sensor Explorer</span>
                        <span className="sp-brand-sub"> — AtmoInsight DB Demo</span>
                    </div>
                </div>
                <button className="btn-signout" onClick={() => { logout(); navigate('/'); }}>Sign Out</button>
            </nav>

            <div className="sp-content">
                {/* Page Header */}
                <div className="sp-page-header">
                    <h1 className="text-gradient">Sensor Registry</h1>
                    <p className="sp-page-desc">
                        Browse and filter sensors from the <code>Sensor</code>, <code>SensorType</code>, and <code>Location</code> database tables.
                    </p>
                </div>

                {/* Filter Panel */}
                <div className="glass-card sp-filter-card">
                    <h2 className="sp-section-title">
                        <span>🔎</span> Filter Sensors
                    </h2>
                    <div className="sp-filter-row">
                        <div className="sp-filter-group">
                            <label htmlFor="sensor-type-select" className="sp-label">Sensor Type</label>
                            <select
                                id="sensor-type-select"
                                className="sp-select"
                                value={selectedTypeId}
                                onChange={e => setSelectedTypeId(e.target.value)}
                            >
                                <option value="">— All Types —</option>
                                {sensorTypes.map(t => (
                                    <option key={t.sensor_type_id} value={t.sensor_type_id}>
                                        {t.type_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="sp-filter-group">
                            <label htmlFor="location-select" className="sp-label">Location</label>
                            <select
                                id="location-select"
                                className="sp-select"
                                value={selectedLocationId}
                                onChange={e => setSelectedLocationId(e.target.value)}
                            >
                                <option value="">— All Locations —</option>
                                {locations.map(l => (
                                    <option key={l.location_id} value={l.location_id}>
                                        {l.name || `Location #${l.location_id}`}
                                        {l.region ? ` (${l.region})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="sp-filter-actions">
                            <button
                                id="fetch-sensors-btn"
                                className="btn-primary"
                                onClick={fetchSensors}
                                disabled={loading}
                            >
                                {loading ? '⏳ Loading...' : '🔍 Search Sensors'}
                            </button>
                            {searched && (
                                <button className="sp-btn-reset" onClick={handleReset}>
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {/* DB info hint */}
                    <div className="sp-db-hint">
                        <span className="sp-db-hint-label">DB Query:</span>
                        <code>
                            SELECT s.*, st.type_name, l.name FROM sensor s
                            JOIN sensortype st ON s.sensor_type_id = st.sensor_type_id
                            JOIN location l ON s.location_id = l.location_id
                            {selectedTypeId ? ` WHERE type_id = ${selectedTypeId}` : ''}
                            {selectedLocationId ? ` ${selectedTypeId ? 'AND' : 'WHERE'} location_id = ${selectedLocationId}` : ''}
                        </code>
                    </div>
                </div>

                {/* Error */}
                {error && <div className="sp-error">⚠️ {error}</div>}

                {/* Results */}
                {searched && !loading && (
                    <div className="glass-card">
                        <div className="sp-results-header">
                            <h2 className="sp-section-title">
                                <span>📋</span> Results
                            </h2>
                            <span className="sp-count">
                                {sensors.length} sensor{sensors.length !== 1 ? 's' : ''} found
                            </span>
                        </div>
                        <SensorTable sensors={sensors} />
                    </div>
                )}

                {!searched && !loading && (
                    <div className="sp-intro glass-card">
                        <div className="sp-intro-icon">🛰️</div>
                        <h3>Select filters and click "Search Sensors"</h3>
                        <p>Leave both dropdowns empty to see all sensors in the database.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
