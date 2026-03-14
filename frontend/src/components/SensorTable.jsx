import { useNavigate } from 'react-router-dom';

export default function SensorTable({ sensors }) {
    const navigate = useNavigate();

    if (!sensors || sensors.length === 0) {
        return (
            <div className="sp-empty">
                <span>🔍</span>
                <p>No sensors match the selected filters. Try adjusting your criteria.</p>
            </div>
        );
    }

    const getStatusBadge = (status) => {
        const s = (status || 'Unknown').toLowerCase();
        let cls = 'sp-badge';
        if (s === 'active') cls += ' sp-badge-active';
        else if (s === 'inactive' || s === 'offline') cls += ' sp-badge-inactive';
        else cls += ' sp-badge-unknown';
        return <span className={cls}>{status || 'Unknown'}</span>;
    };

    return (
        <div className="sp-table-wrapper">
            <table className="sp-table">
                <thead>
                    <tr>
                        <th>Sensor ID</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Installed</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {sensors.map((sensor) => (
                        <tr key={sensor.sensor_id}>
                            <td className="sp-id">#{sensor.sensor_id}</td>
                            <td className="sp-name">{sensor.name || '—'}</td>
                            <td>{sensor.type_name || '—'}</td>
                            <td>{sensor.location_name || '—'}</td>
                            <td>{getStatusBadge(sensor.status)}</td>
                            <td className="sp-muted">{sensor.installed_at ? new Date(sensor.installed_at).toLocaleDateString() : '—'}</td>
                            <td>
                                <button
                                    className="sp-btn-view"
                                    onClick={() => navigate('/readings', { state: { sensor } })}
                                >
                                    View Readings →
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
