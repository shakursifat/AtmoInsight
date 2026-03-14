export default function ReadingTable({ readings }) {
    if (!readings || readings.length === 0) {
        return (
            <div className="rp-empty">
                <span>📊</span>
                <p>No readings found for the selected filters.</p>
            </div>
        );
    }

    return (
        <div className="sp-table-wrapper">
            <table className="sp-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Timestamp</th>
                        <th>Value</th>
                        <th>Measurement Type</th>
                        <th>Unit</th>
                    </tr>
                </thead>
                <tbody>
                    {readings.map((r, idx) => (
                        <tr key={r.reading_id}>
                            <td className="sp-muted">{idx + 1}</td>
                            <td>{new Date(r.timestamp).toLocaleString()}</td>
                            <td className="sp-value">{parseFloat(r.value).toFixed(2)}</td>
                            <td>{r.measurement_type_name || `Type ${r.measurement_type_id}`}</td>
                            <td>
                                {r.unit_name || '—'}
                                {r.unit_symbol ? <span className="sp-symbol"> ({r.unit_symbol})</span> : null}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
