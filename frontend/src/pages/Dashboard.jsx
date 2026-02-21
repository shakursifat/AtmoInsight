import { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import AnalyticsChart from '../components/AnalyticsChart';
import ReportForm from '../components/ReportForm';
import AdminReportsBox from '../components/AdminReportsBox';
import SensorMap from '../components/SensorMap';
import WeatherWidget from '../components/WeatherWidget';

const SOCKET_URL = 'http://localhost:5000';

export default function Dashboard() {
    const { user, token, logout } = useContext(AuthContext);
    const navigate = useNavigate();

    const [readings, setReadings] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [disasters, setDisasters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshReports, setRefreshReports] = useState(false);

    useEffect(() => {
        if (!token) {
            navigate('/');
            return;
        }

        const fetchData = async () => {
            try {
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const [readingsRes, alertsRes, disastersRes] = await Promise.all([
                    axios.get('http://localhost:5000/api/readings?limit=5', config),
                    axios.get('http://localhost:5000/api/alerts?limit=5', config),
                    axios.get('http://localhost:5000/api/disasters?limit=5', config)
                ]);

                setReadings(readingsRes.data);
                setAlerts(alertsRes.data);
                setDisasters(disastersRes.data);
                setLoading(false);
            } catch (err) {
                console.error("Dashboard fetch error:", err);
                if (err.response?.status === 401) {
                    logout();
                    navigate('/');
                }
            }
        };

        fetchData();

        // Socket Setup
        const socket = io(SOCKET_URL);

        socket.on('new_reading', (data) => {
            console.log('Real-time reading received:', data);
            setReadings(prev => [data, ...prev].slice(0, 10)); // keep last 10
        });

        socket.on('new_alert', (data) => {
            console.log('Real-time alert received:', data);
            setAlerts(prev => [data, ...prev].slice(0, 10)); // keep last 10
        });

        socket.on('new_disaster', (data) => {
            console.log('Real-time DISASTER received:', data);
            setDisasters(prev => [data, ...prev].slice(0, 10)); // keep last 10
        });

        return () => socket.disconnect();
    }, [token, navigate, logout]);

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--accent-cyan)' }}>Loading Dashboard...</div>;
    }

    return (
        <div className="animate-fade-in" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>

            {/* Header Widget */}
            <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem', marginBottom: '2rem' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '1.8rem', margin: 0 }}>AtmoInsight Control Center</h1>
                    <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>Real-time Environmental Monitoring</p>
                </div>
                <button className="btn-primary" onClick={() => { logout(); navigate('/'); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', boxShadow: 'none' }}>
                    Sign Out
                </button>
            </div>

            {/* Live Meteorological Data Widget (Open-Meteo) */}
            <WeatherWidget />

            {/* Analytics Chart Full Width Container (Hidden from Citizens) */}
            {user?.role_id <= 2 && (
                <div className="glass-card" style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <h2 style={{ fontSize: '1.3rem' }}>7-Day Historical Averages</h2>
                        <div style={{ padding: '0.2rem 0.5rem', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '4px', fontSize: '0.8rem', color: '#c4b5fd' }}>
                            Materialized View Analytics
                        </div>
                    </div>
                    <AnalyticsChart sensorId={1} />
                </div>
            )}

            {/* Main Dashboard Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>

                {/* Latest Readings Container (Hidden from Citizens) */}
                {user?.role_id <= 2 && (
                    <div className="glass-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <h2 style={{ fontSize: '1.3rem' }}>Live Sensor Readings</h2>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)' }}></div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {readings.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No recent data.</p> :
                                readings.map((req, idx) => (
                                    <div key={idx} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                        <div>
                                            <strong style={{ color: 'var(--accent-cyan)' }}>Sensor {req.sensor_id}</strong>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(req.timestamp).toLocaleTimeString()}</div>
                                        </div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                                            {parseFloat(req.value).toFixed(1)} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Units</span>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* Alerts Container (Hidden from Citizens) */}
                {user?.role_id <= 2 && (
                    <div className="glass-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <h2 style={{ fontSize: '1.3rem' }}>System Alerts</h2>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--danger)', animation: 'pulseGlow 2s infinite' }}></div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {alerts.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>All systems nominal.</p> :
                                alerts.map((al, idx) => (
                                    <div key={idx} style={{
                                        padding: '1rem',
                                        background: al.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                        borderLeft: `4px solid ${al.severity === 'CRITICAL' ? 'var(--danger)' : 'var(--warning)'} `,
                                        borderRadius: '0 8px 8px 0'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <strong style={{ color: al.severity === 'CRITICAL' ? '#fca5a5' : '#fcd34d' }}>{al.severity} WARNING</strong>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(al.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        <div>{al.message}</div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* Active Disasters Container (Hidden from Citizens) */}
                {user?.role_id <= 2 && (
                    <div className="glass-card" style={{ gridColumn: '1 / -1', background: 'linear-gradient(145deg, rgba(239, 68, 68, 0.05), rgba(0, 0, 0, 0.2))', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            <h2 style={{ fontSize: '1.3rem', color: '#fca5a5' }}>Active Disaster Events</h2>
                            <div style={{ padding: '0.2rem 0.5rem', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '4px', fontSize: '0.8rem', color: '#f87171' }}>
                                EM-DAT Integration
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {disasters.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No active disasters registered.</p> :
                                disasters.map((ev, idx) => (
                                    <div key={idx} style={{
                                        padding: '1.25rem',
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.5rem'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <strong style={{ color: '#fca5a5', fontSize: '1.1rem', display: 'block' }}>
                                                    {ev.type_name ? `${ev.type_name} (${ev.subgroup_name})` : `Disaster Type ID: ${ev.disaster_type_id}`}
                                                </strong>
                                                <span style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 'bold' }}>{ev.severity} SEVERITY</span>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: '#cbd5e1', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px' }}>
                                                {new Date(ev.start_timestamp).toLocaleString()}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.95rem', color: '#e2e8f0', marginTop: '0.5rem' }}>{ev.description}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                            Location ID: {ev.location_id}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* Sensor Geospatial Map Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', gridColumn: '1 / -1' }}>
                    <div className="glass-card" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Active Sensor Network</h2>
                            <div style={{ padding: '0.2rem 0.5rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '4px', fontSize: '0.8rem', color: '#34d399' }}>
                                Live Feed Map
                            </div>
                        </div>
                        <SensorMap />
                    </div>
                </div>

                {/* Citizen Reporting Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <ReportForm onReportSubmitted={() => setRefreshReports(prev => !prev)} />

                    {/* Only Admins can see the Admin Reports Management Box */}
                    {user?.role_id === 1 && (
                        <AdminReportsBox refreshTrigger={refreshReports} />
                    )}
                </div>

            </div>
        </div>
    );
}
