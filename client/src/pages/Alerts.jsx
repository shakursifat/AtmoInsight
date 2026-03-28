import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveAlerts } from '../api/hooks';
import AlertCard from '../components/shared/AlertCard';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import { CheckCircle } from 'lucide-react';

function SectionError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 min-h-[160px]">
      <p className="text-sm" style={{ color: 'rgba(255, 59, 48, 0.7)' }}>
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs px-3 py-1.5 rounded-md border border-border-subtle bg-surface-elevated text-text-secondary hover:text-accent-gold transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default function Alerts() {
  const navigate = useNavigate();
  const { alerts, loading, error, refetch } = useActiveAlerts();
  const [filter, setFilter] = useState('All');

  const filtered = (alerts || []).filter(a => {
    if (filter === 'All') return true;
    const sev = (a.severity || a.alert_type || '').toLowerCase();
    return sev === filter.toLowerCase();
  });

  const onAlertNavigate = useCallback(
    alert => {
      const lat = alert.latitude != null ? Number(alert.latitude) : null;
      const lng = alert.longitude != null ? Number(alert.longitude) : null;
      const sid = alert.sensor_id;
      if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
        const q = new URLSearchParams({
          lat: String(lat),
          lng: String(lng),
          zoom: '14',
        });
        if (sid != null) q.set('sensor', String(sid));
        navigate(`/?${q.toString()}`);
      }
    },
    [navigate]
  );

  return (
    <div className="max-w-[1000px] mx-auto p-4 md:p-6 space-y-6 pb-24">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Alerts Log</h1>
          <p className="text-text-muted text-sm">System and trigger alerts history</p>
        </div>

        <div className="flex bg-surface-secondary p-1 rounded-md border border-border-subtle inline-flex">
          {['All', 'Critical', 'High', 'Moderate'].map(level => {
            const isActive = filter === level;
            return (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className={`text-xs px-3 py-1.5 rounded font-medium transition-colors duration-200 ${
                  isActive
                    ? 'bg-accent-gold text-surface-primary hover:bg-accent-gold/90'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                }`}
              >
                {level}
              </button>
            );
          })}
        </div>
      </header>

      <section className="min-h-[200px]">
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <SectionError message={error} onRetry={refetch} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            message={
              filter !== 'All' ? `No ${filter} alerts` : 'System is quiet. No active alerts.'
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((a, i) => (
              <div
                key={a.alert_id}
                onClick={() => onAlertNavigate(a)}
                className="cursor-pointer"
              >
                <AlertCard alert={a} fullMessage={true} animationDelayMs={i * 35} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
