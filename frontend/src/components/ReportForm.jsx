import { useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

export default function ReportForm({ onReportSubmitted }) {
    const { token } = useContext(AuthContext);
    const [description, setDescription] = useState('');
    const [locationId, setLocationId] = useState(1);
    const [status, setStatus] = useState(''); // 'success' or 'error'

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('');
        try {
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await axios.post('http://localhost:5000/api/reports', {
                description,
                location_id: locationId
            }, config);

            setStatus('success');
            setDescription('');
            if (onReportSubmitted) onReportSubmitted();

            setTimeout(() => setStatus(''), 3000);
        } catch (err) {
            console.error(err);
            setStatus('error');
        }
    };

    return (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Submit a Report</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.2rem 0 0' }}>Report an environmental hazard or pollution event.</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flexGrow: 1 }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Hazard Location ID</label>
                    <input
                        type="number"
                        className="input-glass"
                        value={locationId}
                        onChange={(e) => setLocationId(Number(e.target.value))}
                        min="1"
                        required
                        style={{ width: '100px' }}
                    />
                </div>

                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Description</label>
                    <textarea
                        className="input-glass"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                        placeholder="E.g., Heavy black smoke visible from factory near river..."
                        style={{ flexGrow: 1, resize: 'none', minHeight: '80px' }}
                    />
                </div>

                {status === 'success' && <div style={{ color: 'var(--success)', fontSize: '0.9rem' }}>Report submitted successfully!</div>}
                {status === 'error' && <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>Failed to submit report.</div>}

                <button type="submit" className="btn-primary" style={{ marginTop: 'auto' }}>Submit Report</button>
            </form>
        </div>
    );
}
