import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';

const SOCKET_URL = 'http://localhost:5000';
const API_URL = 'http://localhost:5000/api/sql';

const TRIGGER_CODE = `-- TRIGGER: fn_create_alert_on_threshold
-- Fires AFTER INSERT ON reading
-- Looks up AlertThreshold table dynamically

CREATE OR REPLACE FUNCTION fn_create_alert_on_threshold()
RETURNS TRIGGER AS $$
DECLARE
    v_threshold   RECORD;
    v_severity    VARCHAR(20);
BEGIN
    -- Find breached threshold for this measurement type
    SELECT * INTO v_threshold
    FROM alertthreshold
    WHERE measurement_type_id = NEW.measurement_type_id
      AND (max_value IS NOT NULL AND NEW.value > max_value)
    ORDER BY max_value DESC NULLS LAST LIMIT 1;

    IF NOT FOUND THEN RETURN NEW; END IF;

    v_severity := COALESCE(v_threshold.severity, 'Low');
    IF NEW.value > v_threshold.max_value * 1.5 THEN
        v_severity := 'Critical';
    END IF;

    -- Insert alert automatically
    INSERT INTO alert (reading_id, alert_type_id, message, timestamp, severity)
    VALUES (NEW.reading_id, 1,
        FORMAT('Threshold breached! sensor=%s value=%s max=%s severity=%s',
               NEW.sensor_id, NEW.value, v_threshold.max_value, v_severity),
        NOW(), v_severity);

    -- Real-time push via pg_notify → Socket.io
    PERFORM pg_notify('new_alert_channel', row_to_json(NEW)::text);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_alert_on_threshold
AFTER INSERT ON reading
FOR EACH ROW EXECUTE FUNCTION fn_create_alert_on_threshold();`;

const INSERTED_READING_SQL = `INSERT INTO reading
  (source_id, sensor_id, timestamp, value, measurement_type_id, unit_id)
VALUES
  (1, 1, NOW(), 95.0, 1, 1)   -- value=95 breaches PM2.5 threshold ≈ 80
RETURNING *;`;

export default function TriggerDemo() {
    const { token } = useContext(AuthContext);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [liveAlerts, setLiveAlerts] = useState([]);

    useEffect(() => {
        const socket = io(SOCKET_URL);
        // Listen for DB-trigger-generated alerts (via pg_notify → server.js → socket.emit)
        socket.on('new_alert', (alert) => {
            setLiveAlerts(prev => [{ ...alert, receivedAt: new Date().toLocaleTimeString(), isNew: true }, ...prev].slice(0, 8));
        });
        // Also listen for the direct trigger-fired event from the demo endpoint
        socket.on('trigger_fired', (data) => {
            if (data.alert) {
                setLiveAlerts(prev => [{ ...data.alert, receivedAt: new Date().toLocaleTimeString(), isNew: true }, ...prev].slice(0, 8));
            }
        });
        return () => socket.disconnect();
    }, []);

    const handleFire = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const res = await axios.post(
                `${API_URL}/trigger-demo`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    const severityColor = (s) => {
        if (!s) return 'var(--text-muted)';
        const sv = s.toLowerCase();
        if (sv === 'critical') return '#ef4444';
        if (sv === 'high') return '#f97316';
        if (sv === 'medium') return '#f59e0b';
        return '#22c55e';
    };

    return (
        <div className="sql-section">
            <div className="sql-section-header">
                <div>
                    <h2 className="sql-section-title">
                        <span className="sql-icon">⚡</span> Trigger Demo
                    </h2>
                    <p className="sql-section-desc">
                        Insert a synthetic high-value reading (PM2.5 = 95) to fire the
                        <code> trg_alert_on_threshold </code> database trigger in real-time.
                    </p>
                </div>
            </div>

            {/* How it works */}
            <div className="trigger-flow">
                <div className="trigger-step">
                    <div className="trigger-step-num">1</div>
                    <div>
                        <strong>INSERT</strong> into <code>reading</code>
                        <div className="trigger-step-desc">value=95 (above PM2.5 threshold ~80)</div>
                    </div>
                </div>
                <div className="trigger-arrow">→</div>
                <div className="trigger-step">
                    <div className="trigger-step-num">2</div>
                    <div>
                        <strong>DB Trigger fires</strong>
                        <div className="trigger-step-desc">fn_create_alert_on_threshold()</div>
                    </div>
                </div>
                <div className="trigger-arrow">→</div>
                <div className="trigger-step">
                    <div className="trigger-step-num">3</div>
                    <div>
                        <strong>Alert created</strong>
                        <div className="trigger-step-desc">INSERT into alert table</div>
                    </div>
                </div>
                <div className="trigger-arrow">→</div>
                <div className="trigger-step">
                    <div className="trigger-step-num">4</div>
                    <div>
                        <strong>pg_notify</strong>
                        <div className="trigger-step-desc">→ Socket.io → Live UI update</div>
                    </div>
                </div>
            </div>

            {/* Trigger SQL Code */}
            <div className="code-editor-wrapper" style={{ marginBottom: '1.5rem' }}>
                <div className="code-editor-topbar">
                    <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
                    <span className="editor-label">triggers.sql (excerpt)</span>
                </div>
                <pre className="code-readonly">{TRIGGER_CODE}</pre>
            </div>

            {/* Inserted SQL preview */}
            <div className="code-editor-wrapper" style={{ marginBottom: '1.5rem' }}>
                <div className="code-editor-topbar">
                    <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
                    <span className="editor-label">Demo INSERT statement</span>
                </div>
                <pre className="code-readonly small">{INSERTED_READING_SQL}</pre>
            </div>

            {/* Fire button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <button
                    className={`btn-fire ${loading ? 'loading' : ''}`}
                    onClick={handleFire}
                    disabled={loading}
                >
                    {loading ? '⏳ Inserting…' : '🔥 Fire Trigger'}
                </button>
                {loading && <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Inserting reading and waiting for DB trigger…</span>}
            </div>

            {error && (
                <div className="query-error">
                    <span className="query-error-icon">✗</span>
                    <strong>Error:</strong> {error}
                </div>
            )}

            {result && (
                <div className="trigger-result">
                    <div className="trigger-result-row">
                        <div className="trigger-card reading-card">
                            <div className="trigger-card-label">📡 Inserted Reading</div>
                            <div className="trigger-card-id">reading_id: <strong>{result.insertedReading?.reading_id}</strong></div>
                            <div>sensor_id: {result.insertedReading?.sensor_id}</div>
                            <div className="trigger-value">value: <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: '1.4rem' }}>{result.insertedReading?.value}</span></div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(result.insertedReading?.timestamp).toLocaleString()}</div>
                        </div>
                        {result.generatedAlert && (
                            <div className="trigger-card alert-card" style={{ borderColor: severityColor(result.generatedAlert.severity) }}>
                                <div className="trigger-card-label">🚨 Generated Alert (by DB trigger)</div>
                                <div className="trigger-card-id">alert_id: <strong>{result.generatedAlert.alert_id}</strong></div>
                                <div style={{ color: severityColor(result.generatedAlert.severity), fontWeight: 'bold', fontSize: '1.1rem' }}>
                                    {result.generatedAlert.severity}
                                </div>
                                <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{result.generatedAlert.message}</div>
                            </div>
                        )}
                        {!result.generatedAlert && (
                            <div className="trigger-card" style={{ opacity: 0.6 }}>
                                <div className="trigger-card-label">🔔 Alert</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No alert generated — threshold may not be configured for this reading type.</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Live Alert Feed */}
            <div className="live-alerts-panel">
                <div className="live-events-header">
                    <span className="pulse-dot" /> Live Alert Feed (Socket.io)
                    {liveAlerts.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '1rem' }}>Waiting for alerts…</span>}
                </div>
                {liveAlerts.map((al, i) => (
                    <div
                        key={i}
                        className={`live-alert-item ${i === 0 ? 'live-alert-new' : ''}`}
                        style={{ borderLeftColor: severityColor(al.severity) }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                            <strong style={{ color: severityColor(al.severity) }}>{al.severity || 'ALERT'}</strong>
                            <span className="live-event-time">{al.receivedAt}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem' }}>{al.message}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
