import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveAlerts } from '../api/hooks';
import AlertCard from '../components/shared/AlertCard';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import { CheckCircle, Wind, Thermometer, Droplets, Activity } from 'lucide-react';

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

// Classify an alert into a high-level category for display/filtering
function classifyAlert(alert) {
  const m = (alert.measurement || alert.alert_type || '').toLowerCase();
  if (m.includes('pm')) {
    return 'PM';
  }
  if (m.includes('aqi') || m.includes('no2') || m.includes('so2') || m.includes('co') || m.includes('o3') || m.includes('air')) {
    return 'Air Quality';
  }
  if (m.includes('temp') || m.includes('heat') || m.includes('feels')) {
    return 'Temperature';
  }
  if (m.includes('wind') || m.includes('pressure') || m.includes('gust')) {
    return 'Wind & Pressure';
  }
  if (m.includes('rain') || m.includes('precip') || m.includes('water') || m.includes('flood') || m.includes('humid')) {
    return 'Precipitation';
  }
  if (m.includes('uv') || m.includes('uvi') || m.includes('radiation')) {
    return 'UV / Radiation';
  }
  return 'Other';
}

const SEVERITY_FILTERS = ['All', 'Critical', 'High', 'Moderate'];
const CATEGORY_ICONS = {
  'Air Quality':      Activity,
  'PM':               Activity,
  'Temperature':      Thermometer,
  'Wind & Pressure':  Wind,
  'Precipitation':    Droplets,
};

export default function Alerts() {
  const navigate = useNavigate();
  const { alerts, loading, error, refetch } = useActiveAlerts();
  const [severityFilter, setSeverityFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Build unique categories from actual alerts alongside base categories
  const categories = (() => {
    const baseCategories = ['All', 'Precipitation', 'Wind & Pressure', 'Temperature', 'PM'];
    const cats = new Set(baseCategories);
    if (alerts?.length) {
      alerts.forEach(a => cats.add(classifyAlert(a)));
    }
    
    return Array.from(cats).sort((a, b) => {
      if (a === 'All') return -1;
      if (b === 'All') return 1;
      const indexA = baseCategories.indexOf(a);
      const indexB = baseCategories.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });
  })();

  const filtered = (alerts || []).filter(a => {
    const sevMatch =
      severityFilter === 'All' ||
      (a.severity || a.alert_type || '').toLowerCase() === severityFilter.toLowerCase();
    const catMatch =
      categoryFilter === 'All' || classifyAlert(a) === categoryFilter;
    return sevMatch && catMatch;
  });

  // Count per severity for badges based on current category filter
  const countBySeverity = (alerts || []).reduce((acc, a) => {
    if (categoryFilter !== 'All' && classifyAlert(a) !== categoryFilter) return acc;
    const sev = (a.severity || 'safe').toLowerCase();
    const key = sev.charAt(0).toUpperCase() + sev.slice(1);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

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
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">Alerts Log</h1>
            <p className="text-text-muted text-sm">
              Real-time environmental threshold alerts by sensor &amp; category
            </p>
          </div>

          {/* Severity filter pills */}
          <div className="flex bg-surface-secondary p-1 rounded-md border border-border-subtle">
            {SEVERITY_FILTERS.map(level => {
              const isActive = severityFilter === level;
              const count = level === 'All' 
                ? (alerts || []).filter(a => categoryFilter === 'All' || classifyAlert(a) === categoryFilter).length
                : (countBySeverity[level] || 0);
              return (
                <button
                  key={level}
                  onClick={() => setSeverityFilter(level)}
                  className={`text-xs px-3 py-1.5 rounded font-medium transition-colors duration-200 flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-accent-gold text-surface-primary hover:bg-accent-gold/90'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                  }`}
                >
                  {level}
                  {count > 0 && (
                    <span className={`text-[10px] font-bold rounded-full px-1 min-w-[18px] text-center ${
                      isActive ? 'bg-surface-primary/30 text-surface-primary' : 'bg-surface-elevated text-text-muted'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category tabs — only show when alerts have loaded */}
        {!loading && categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => {
              const Icon = CATEGORY_ICONS[cat];
              const isActive = categoryFilter === cat;
              const count = (alerts || []).filter(a => {
                const catMatch = cat === 'All' || classifyAlert(a) === cat;
                const sevMatch = severityFilter === 'All' || (a.severity || a.alert_type || '').toLowerCase() === severityFilter.toLowerCase();
                return catMatch && sevMatch;
              }).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors duration-200 ${
                    isActive
                      ? 'bg-surface-elevated border-accent-gold text-accent-gold'
                      : 'bg-surface-secondary border-border-subtle text-text-secondary hover:text-text-primary hover:border-text-muted'
                  }`}
                >
                  {Icon && <Icon size={11} />}
                  {cat}
                  {count > 0 && (
                    <span className="text-[10px] font-bold text-text-muted">({count})</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
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
              severityFilter !== 'All' || categoryFilter !== 'All'
                ? `No ${[severityFilter !== 'All' ? severityFilter : '', categoryFilter !== 'All' ? categoryFilter : ''].filter(Boolean).join(' / ')} alerts`
                : 'System is quiet. No active alerts.'
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
