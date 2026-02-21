import { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

export default function AdminReportsBox({ refreshTrigger }) {
    const { token, user } = useContext(AuthContext);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchReports = useCallback(async () => {
        try {
            setLoading(true);
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const res = await axios.get('http://localhost:5000/api/reports', config);
            setReports(res.data);
        } catch (err) {
            console.error("Failed to load reports:", err);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) fetchReports();
    }, [token, fetchReports, refreshTrigger]); // re-fetch when refreshTrigger changes

    const handleStatusChange = async (reportId, newStatusId) => {
        try {
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await axios.put(`http://localhost:5000/api/reports/${reportId}`, { status_id: newStatusId }, config);
            // Optimistically update UI
            setReports(reports.map(r => r.report_id === reportId ? { ...r, status_id: newStatusId } : r));
        } catch (err) {
            console.error("Failed to update status", err);
            alert("Role Error: Only Admins can change status");
        }
    };

    const statusMap = {
        1: { label: 'Pending', color: 'var(--warning)' },
        2: { label: 'In Review', color: 'var(--accent-cyan)' },
        3: { label: 'Resolved', color: 'var(--success)' }
    };

    if (loading) return <div className="glass-card" style={{ color: 'var(--text-muted)' }}>Loading Reports...</div>;

    return (
        <div className="glass-card" style={{ height: '100%', overflowY: 'auto', maxHeight: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Citizen Reports</h2>
                <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px' }}>{reports.length} Total</span>
            </div>

            {reports.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No reports filed yet.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {reports.map((report) => (
                        <div key={report.report_id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <strong style={{ color: '#e2e8f0' }}>Report #{report.report_id}</strong>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(report.timestamp).toLocaleDateString()}</span>
                            </div>

                            <div style={{ fontSize: '0.9rem', marginBottom: '0.8rem', color: '#cbd5e1' }}>
                                <span style={{ color: 'var(--text-muted)' }}>User:</span> {report.username || `ID: ${report.user_id}`} | <span style={{ color: 'var(--text-muted)' }}>Loc:</span> {report.location_id}
                            </div>

                            <p style={{ fontSize: '0.95rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem' }}>
                                "{report.description}"
                            </p>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 'bold',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    background: `rgba(${statusMap[report.status_id || 1].color.replace('var(--', '').replace(')', '') === 'warning' ? '245, 158, 11' : statusMap[report.status_id || 1].color.replace('var(--', '').replace(')', '') === 'success' ? '16, 185, 129' : '6, 182, 212'}, 0.2)`,
                                    color: statusMap[report.status_id || 1].color
                                }}>
                                    {statusMap[report.status_id || 1].label}
                                </span>

                                {/* Only show the admin dropdown if user is an admin (role_id === 1) */}
                                {user?.role_id === 1 && (
                                    <select
                                        className="input-glass"
                                        style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.85rem' }}
                                        value={report.status_id || 1}
                                        onChange={(e) => handleStatusChange(report.report_id, parseInt(e.target.value))}
                                    >
                                        <option value={1} style={{ background: 'var(--bg-dark)' }}>Mark Pending</option>
                                        <option value={2} style={{ background: 'var(--bg-dark)' }}>Mark In Review</option>
                                        <option value={3} style={{ background: 'var(--bg-dark)' }}>Mark Resolved</option>
                                    </select>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
