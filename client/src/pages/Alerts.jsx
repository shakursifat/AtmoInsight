import { useState } from 'react';
import { useActiveAlerts } from '../api/hooks';
import AlertCard from '../components/shared/AlertCard';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import { CheckCircle } from 'lucide-react';

export default function Alerts() {
  const { alerts, loading, error } = useActiveAlerts();
  const [filter, setFilter] = useState('All');

  const filtered = (alerts || []).filter(a => {
    if (filter === 'All') return true;
    const sev = (a.severity || a.alert_type || '').toLowerCase();
    return sev === filter.toLowerCase();
  });

  return (
    <div className="max-w-[1000px] mx-auto p-4 md:p-6 space-y-6">
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
                className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                  isActive 
                    ? 'bg-accent-gold text-surface-primary hover:bg-accent-gold/90' 
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                }`}
              >
                {level}
              </button>
            )
          })}
        </div>
      </header>

      <section>
        {loading ? <LoadingSpinner /> : error ? <EmptyState message="Failed to load alerts" /> : filtered.length === 0 ? (
          <EmptyState icon={CheckCircle} message={filter !== 'All' ? `No ${filter} alerts` : 'System is quiet. No active alerts.'} />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(a => (
              <div key={a.alert_id} onClick={() => console.log('Clicked alert:', a.alert_id)}>
                <AlertCard alert={a} fullMessage={true} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
