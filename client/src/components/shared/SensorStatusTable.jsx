import { useEffect, useState } from 'react';
import client from '../../api/client';
import { Activity, Wifi, WifiOff, Wrench, Clock } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';

function StatusIcon({ status }) {
  if (status === 'Active') return <Wifi className="w-3.5 h-3.5 text-severity-safe" />;
  if (status === 'Maintenance') return <Wrench className="w-3.5 h-3.5 text-severity-moderate" />;
  return <WifiOff className="w-3.5 h-3.5 text-text-muted" />;
}

function StatusBadge({ status }) {
  let cls = 'px-2 py-0.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1 ';
  if (status === 'Active')      cls += 'bg-severity-safe/15 text-severity-safe';
  else if (status === 'Maintenance') cls += 'bg-severity-moderate/15 text-severity-moderate';
  else                          cls += 'bg-surface-elevated text-text-muted';

  return (
    <span className={cls}>
      <StatusIcon status={status} />
      {status}
    </span>
  );
}

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function SensorStatusTable({ refreshSignal }) {
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const res = await client.get('/api/map/sensors');
      const features = res.data?.features || [];
      const rows = features
        .map(f => ({
          sensor_id:   f.properties.sensor_id,
          name:        f.properties.name,
          location:    f.properties.location_name,
          region:      f.properties.region,
          status:      f.properties.status,
          sensor_type: f.properties.sensor_type,
          latest_value: f.properties.latest_value,
          latest_unit:  f.properties.latest_unit,
          latest_measurement: f.properties.latest_measurement,
          latest_timestamp: f.properties.latest_timestamp,
        }))
        .sort((a, b) => {
          // Active first, then Maintenance, then Inactive
          const order = { Active: 0, Maintenance: 1, Inactive: 2 };
          return (order[a.status] ?? 3) - (order[b.status] ?? 3);
        });
      setSensors(rows);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load sensors');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshSignal]);

  if (loading) return <LoadingSpinner />;
  if (error)   return <EmptyState message={error} />;
  if (!sensors.length) return <EmptyState message="No sensors found" />;

  const active      = sensors.filter(s => s.status === 'Active').length;
  const maintenance = sensors.filter(s => s.status === 'Maintenance').length;
  const inactive    = sensors.filter(s => s.status === 'Inactive').length;

  return (
    <div>
      {/* Summary pills */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <span className="text-xs px-3 py-1 rounded-full bg-severity-safe/15 text-severity-safe font-medium">
          {active} Active
        </span>
        {maintenance > 0 && (
          <span className="text-xs px-3 py-1 rounded-full bg-severity-moderate/15 text-severity-moderate font-medium">
            {maintenance} Maintenance
          </span>
        )}
        {inactive > 0 && (
          <span className="text-xs px-3 py-1 rounded-full bg-surface-elevated text-text-muted font-medium">
            {inactive} Inactive
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-elevated">
              <th className="text-left px-4 py-2.5 text-text-secondary text-xs uppercase tracking-wider font-semibold">Sensor</th>
              <th className="text-left px-4 py-2.5 text-text-secondary text-xs uppercase tracking-wider font-semibold">Location</th>
              <th className="text-left px-4 py-2.5 text-text-secondary text-xs uppercase tracking-wider font-semibold">Type</th>
              <th className="text-left px-4 py-2.5 text-text-secondary text-xs uppercase tracking-wider font-semibold">Status</th>
              <th className="text-right px-4 py-2.5 text-text-secondary text-xs uppercase tracking-wider font-semibold">Latest Reading</th>
              <th className="text-right px-4 py-2.5 text-text-secondary text-xs uppercase tracking-wider font-semibold">
                <span className="flex items-center gap-1 justify-end"><Clock className="w-3 h-3" /> Updated</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sensors.map((s, i) => (
              <tr
                key={s.sensor_id}
                className={`border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-elevated/50 ${i % 2 === 0 ? '' : 'bg-surface-secondary/30'}`}
              >
                <td className="px-4 py-3 font-mono text-xs text-text-primary font-medium">{s.name}</td>
                <td className="px-4 py-3">
                  <span className="text-text-primary text-xs">{s.location}</span>
                  {s.region && <span className="text-text-muted text-[11px] block">{s.region}</span>}
                </td>
                <td className="px-4 py-3 text-text-muted text-xs">{s.sensor_type}</td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3 text-right">
                  {s.latest_value !== null && s.latest_value !== undefined ? (
                    <span className="font-data text-data-blue font-semibold">
                      {Number(s.latest_value).toFixed(1)}
                      <span className="text-text-muted text-[11px] ml-1">{s.latest_unit || ''}</span>
                      <span className="text-text-muted text-[11px] block">{s.latest_measurement}</span>
                    </span>
                  ) : (
                    <span className="text-text-muted text-xs">No data</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-text-muted text-xs">{timeAgo(s.latest_timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
