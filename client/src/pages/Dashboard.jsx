import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentConditions, useActiveAlerts, useForecasts } from '../api/hooks';
import MetricCard from '../components/shared/MetricCard';
import AlertCard from '../components/shared/AlertCard';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import SensorStatusTable from '../components/shared/SensorStatusTable';
import { useSocket } from '../api/socket';
import { CloudLightning, LineChart, FileText, ArrowRight, RefreshCw, Activity } from 'lucide-react';
import { formatPercent } from '../utils/format';

function getSeverity(measurement, value) {
  if (measurement === 'PM2.5') {
    if (value > 150) return 'critical';
    if (value > 75) return 'high';
    if (value > 35) return 'moderate';
  } else if (measurement === 'PM10') {
    if (value > 250) return 'critical';
    if (value > 150) return 'high';
  } else if (measurement === 'Temperature') {
    if (value > 40) return 'critical';
    if (value > 35) return 'high';
  } else if (measurement === 'AQI') {
    if (value >= 4) return 'critical';
    if (value >= 3) return 'high';
    if (value >= 2) return 'moderate';
  }
  return 'safe';
}

function timeAgo(ts) {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function forecastProbClass(pct) {
  if (pct > 80) return 'text-severity-high';
  if (pct > 60) return 'text-severity-moderate';
  return 'text-text-secondary';
}

function SectionError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 min-h-[120px]">
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

export default function Dashboard() {
  const navigate = useNavigate();
  const { conditions, loading: condLoading, error: condError, refetch: refetchConditions } = useCurrentConditions();
  const { alerts, loading: alertsLoading, error: alertsError, refetch: refetchAlerts } = useActiveAlerts();
  const {
    forecasts,
    loading: fcLoading,
    error: fcError,
    refetch: refetchForecasts,
  } = useForecasts(0.5, true);
  const socket = useSocket();

  const [liveAlerts, setLiveAlerts] = useState([]);
  const [lastSynced, setLastSynced] = useState(null);
  const [syncPulse, setSyncPulse] = useState(false);
  const [sensorRefresh, setSensorRefresh] = useState(0);

  const goToAlertOnMap = useCallback(
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

  useEffect(() => {
    if (alerts && alerts.length > 0) setLiveAlerts(alerts.slice(0, 8));
  }, [alerts]);

  useEffect(() => {
    if (!socket) return;
    const handleNewAlert = alert => {
      setLiveAlerts(prev => {
        if (prev.find(a => a.alert_id === alert.alert_id)) return prev;
        return [alert, ...prev].slice(0, 8);
      });
    };
    socket.on('new_alert', handleNewAlert);
    return () => socket.off('new_alert', handleNewAlert);
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const handleSensorUpdate = data => {
      console.log('[Dashboard] sensor_update received:', data);
      setSyncPulse(true);
      setLastSynced(new Date());
      setSensorRefresh(n => n + 1);
      setTimeout(() => {
        setSyncPulse(false);
        if (refetchConditions) refetchConditions();
      }, 1000);
    };
    socket.on('sensor_update', handleSensorUpdate);
    return () => socket.off('sensor_update', handleSensorUpdate);
  }, [socket, refetchConditions]);

  const topForecasts = (forecasts || []).slice(0, 3);

  return (
    <div className="max-w-[1200px] mx-auto p-4 md:p-6 pb-24 space-y-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Terminal Dashboard</h1>
          <p className="text-text-muted text-sm">Real-time Bangladesh environmental monitoring center</p>
        </div>
        {lastSynced && (
          <div className="flex items-center gap-2 text-xs text-text-muted bg-surface-secondary border border-border-subtle rounded-lg px-3 py-1.5">
            <RefreshCw className={`w-3 h-3 ${syncPulse ? 'animate-spin text-accent-gold' : 'text-text-muted'}`} />
            Last synced: {timeAgo(lastSynced)}
          </div>
        )}
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-4 border-b border-border-subtle pb-2">
          Live Atmospheric Readings
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {condLoading ? (
            <div className="col-span-full flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : condError ? (
            <div className="col-span-full">
              <SectionError message={condError} onRetry={refetchConditions} />
            </div>
          ) : conditions.length === 0 ? (
            <div className="col-span-full">
              <EmptyState message="No readings yet — sensor sync in progress…" />
            </div>
          ) : (
            conditions.map(c => (
              <MetricCard
                key={c.reading_id ?? `${c.measurement}-${c.sensor_name}-${c.location_name}-${c.timestamp}`}
                label={c.measurement}
                value={Number(c.value).toFixed(1)}
                unit={c.unit}
                sublabel={`${c.sensor_name} · ${c.location_name}`}
                severity={getSeverity(c.measurement, Number(c.value))}
              />
            ))
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between border-b border-border-subtle pb-2 mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Weather forecasts</h2>
          <Link
            to="/disasters"
            className="text-xs text-data-blue hover:text-accent-gold transition-colors flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {fcLoading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : fcError ? (
          <SectionError message={fcError} onRetry={refetchForecasts} />
        ) : topForecasts.length === 0 ? (
          <EmptyState message="No forecasts above 50% probability" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topForecasts.map(f => (
              <div
                key={f.forecast_id}
                className="bg-surface-secondary border border-border-subtle rounded-lg p-4 flex flex-row gap-4 items-start"
              >
                <div
                  className={`font-data text-3xl font-bold shrink-0 ${forecastProbClass(Number(f.probability_pct))}`}
                >
                  {formatPercent(Number(f.probability_pct), 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary line-clamp-2">{f.description}</p>
                  <p className="text-[11px] text-text-muted mt-2 truncate">
                    {f.location_name} · {f.model_source || f.model_name}
                  </p>
                  <p className="text-[10px] text-text-muted font-data mt-1">
                    {f.predicted_timestamp ? new Date(f.predicted_timestamp).toLocaleString() : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-severity-critical opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-severity-critical" />
              </span>
              Active Alerts{' '}
              <span className="text-text-primary ml-1 text-xs px-2 py-0.5 bg-surface-elevated rounded-full">
                {liveAlerts.length}
              </span>
            </h2>
            <Link
              to="/alerts"
              className="text-sm text-data-blue hover:text-accent-gold transition-colors flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="space-y-3">
            {alertsLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : alertsError ? (
              <SectionError message={alertsError} onRetry={refetchAlerts} />
            ) : liveAlerts.length === 0 ? (
              <EmptyState message="No alerts in the last 24 hours" />
            ) : (
              liveAlerts.map((alert, i) => (
                <div key={alert.alert_id || i} onClick={() => goToAlertOnMap(alert)} className="cursor-pointer">
                  <AlertCard alert={alert} animationDelayMs={i * 40} />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-4 border-b border-border-subtle pb-2">
            Quick Actions
          </h2>
          <div className="flex flex-col gap-3">
            <QuickLinkCard to="/disasters" icon={CloudLightning} title="Disaster Overview" desc="Track regional anomalies" />
            <QuickLinkCard to="/analytics" icon={LineChart} title="Analytics Console" desc="Deep dive historical metrics" />
            <QuickLinkCard to="/reports" icon={FileText} title="Submit Report" desc="User submitted intelligence" />
          </div>
        </section>
      </div>

      <section>
        <div className="flex items-center gap-2 border-b border-border-subtle pb-2 mb-4">
          <Activity className="w-4 h-4 text-text-secondary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Sensor Network Status</h2>
        </div>
        <SensorStatusTable refreshSignal={sensorRefresh} />
      </section>
    </div>
  );
}

function QuickLinkCard({ to, icon: Icon, title, desc }) {
  return (
    <Link
      to={to}
      className="group p-4 bg-surface-secondary border border-border-subtle rounded-lg flex items-center gap-4 hover:border-accent-gold hover:bg-surface-elevated transition-all duration-200"
    >
      <div className="p-2 bg-surface-elevated rounded-md group-hover:bg-accent-gold/20 group-hover:text-accent-gold text-text-muted transition-colors duration-200">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-text-muted">{desc}</p>
      </div>
    </Link>
  );
}
