import { useEffect, useState, useCallback } from 'react';
import { useCurrentConditions, useActiveAlerts } from '../api/hooks';
import MetricCard from '../components/shared/MetricCard';
import AlertCard from '../components/shared/AlertCard';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import SensorStatusTable from '../components/shared/SensorStatusTable';
import { useSocket } from '../api/socket';
import { CloudLightning, LineChart, FileText, ArrowRight, RefreshCw, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

function getSeverity(measurement, value) {
  if (measurement === 'PM2.5') {
    if (value > 150) return 'critical';
    if (value > 75)  return 'high';
    if (value > 35)  return 'moderate';
  } else if (measurement === 'PM10') {
    if (value > 250) return 'critical';
    if (value > 150) return 'high';
  } else if (measurement === 'Temperature') {
    if (value > 40)  return 'critical';
    if (value > 35)  return 'high';
  } else if (measurement === 'AQI') {
    if (value >= 4)  return 'critical';
    if (value >= 3)  return 'high';
    if (value >= 2)  return 'moderate';
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

export default function Dashboard() {
  const { conditions, loading: condLoading, error: condError, refetch: refetchConditions } = useCurrentConditions();
  const { alerts, loading: alertsLoading } = useActiveAlerts();
  const socket = useSocket();

  const [liveAlerts, setLiveAlerts]     = useState([]);
  const [lastSynced, setLastSynced]     = useState(null);
  const [syncPulse, setSyncPulse]       = useState(false);
  const [sensorRefresh, setSensorRefresh] = useState(0);

  // Populate alerts from initial fetch
  useEffect(() => {
    if (alerts && alerts.length > 0) setLiveAlerts(alerts.slice(0, 8));
  }, [alerts]);

  // Socket: new real-time alert from DB trigger
  useEffect(() => {
    if (!socket) return;
    const handleNewAlert = (alert) => {
      setLiveAlerts(prev => {
        if (prev.find(a => a.alert_id === alert.alert_id)) return prev;
        return [alert, ...prev].slice(0, 8);
      });
    };
    socket.on('new_alert', handleNewAlert);
    return () => socket.off('new_alert', handleNewAlert);
  }, [socket]);

  // Socket: sensor_update event from cron/manual trigger → re-fetch conditions
  useEffect(() => {
    if (!socket) return;
    const handleSensorUpdate = (data) => {
      console.log('[Dashboard] sensor_update received:', data);
      setSyncPulse(true);
      setLastSynced(new Date());
      setSensorRefresh(n => n + 1);
      // Refetch conditions after a short delay to let DB settle
      setTimeout(() => {
        setSyncPulse(false);
        if (refetchConditions) refetchConditions();
      }, 1000);
    };
    socket.on('sensor_update', handleSensorUpdate);
    return () => socket.off('sensor_update', handleSensorUpdate);
  }, [socket, refetchConditions]);

  return (
    <div className="max-w-[1200px] mx-auto p-4 md:p-6 pb-20 space-y-8">
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

      {/* Latest Metric Cards */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-4 border-b border-border-subtle pb-2">
          Live Atmospheric Readings
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {condLoading ? (
            <LoadingSpinner />
          ) : condError ? (
            <EmptyState message="Failed to load conditions" />
          ) : conditions.length === 0 ? (
            <EmptyState message="No readings yet — sensor sync in progress…" />
          ) : (
            conditions.map(c => (
              <MetricCard
                key={c.measurement}
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

      {/* Alerts + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Alerts */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-severity-critical opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-severity-critical"></span>
              </span>
              Active Alerts <span className="text-text-primary ml-1 text-xs px-2 py-0.5 bg-surface-elevated rounded-full">{liveAlerts.length}</span>
            </h2>
            <Link to="/alerts" className="text-sm text-data-blue hover:text-accent-gold transition-colors flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="space-y-3">
            {alertsLoading ? <LoadingSpinner /> : liveAlerts.length === 0 ? <EmptyState message="No active alerts." /> : liveAlerts.map((alert, i) => (
              <AlertCard key={alert.alert_id || i} alert={alert} />
            ))}
          </div>
        </section>

        {/* Quick Actions */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-4 border-b border-border-subtle pb-2">Quick Actions</h2>
          <div className="flex flex-col gap-3">
            <QuickLinkCard to="/disasters"  icon={CloudLightning} title="Disaster Overview"   desc="Track regional anomalies" />
            <QuickLinkCard to="/analytics"  icon={LineChart}       title="Analytics Console"  desc="Deep dive historical metrics" />
            <QuickLinkCard to="/reports"    icon={FileText}        title="Submit Report"       desc="User submitted intelligence" />
          </div>
        </section>
      </div>

      {/* Sensor Status Table */}
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
    <Link to={to} className="group p-4 bg-surface-secondary border border-border-subtle rounded-lg flex items-center gap-4 hover:border-accent-gold hover:bg-surface-elevated transition-all">
      <div className="p-2 bg-surface-elevated rounded-md group-hover:bg-accent-gold/20 group-hover:text-accent-gold text-text-muted transition-colors">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-text-muted">{desc}</p>
      </div>
    </Link>
  );
}
