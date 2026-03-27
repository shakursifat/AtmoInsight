import SeverityBadge from './SeverityBadge';
import RelativeTime from './RelativeTime';

export default function AlertCard({ alert, fullMessage = false }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-surface-secondary border border-border-subtle rounded-lg cursor-pointer hover:bg-surface-elevated transition-colors">
      <SeverityBadge severity={alert.severity || alert.alert_type} />
      
      <div className="flex-1 min-w-0">
        <p className={`text-text-primary text-sm ${fullMessage ? '' : 'truncate'}`}>
          {alert.message}
        </p>
        <div className="flex items-center gap-2 text-text-muted text-xs mt-1">
          <span>{alert.sensor_name || 'System'}, {alert.location_name}</span>
          <span>&middot;</span>
          <RelativeTime timestamp={alert.alert_time} />
        </div>
      </div>
      
      {fullMessage && alert.trigger_value && (
        <div className="text-right shrink-0 mt-2 sm:mt-0">
          <div className="text-xs text-text-secondary uppercase">Trigger</div>
          <div className="font-data text-sm font-bold bg-surface-primary px-2 py-1 rounded border border-border-subtle mt-1">
            {Number(alert.trigger_value).toFixed(1)} {alert.unit}
          </div>
        </div>
      )}
    </div>
  );
}
