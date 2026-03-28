import SeverityBadge from './SeverityBadge';
import RelativeTime from './RelativeTime';

const borderBySeverity = {
  critical: 'border-l-severity-critical',
  high: 'border-l-severity-high',
  moderate: 'border-l-severity-moderate',
  safe: 'border-l-severity-safe',
};

function normSeverity(s) {
  const v = (s || '').toLowerCase();
  if (['critical', 'high', 'moderate', 'safe'].includes(v)) return v;
  if (v === 'warning') return 'moderate';
  return 'safe';
}

export default function AlertCard({ alert, fullMessage = false, onClick, animationDelayMs = 0 }) {
  const sev = normSeverity(alert.severity || alert.alert_type);
  const borderClass = borderBySeverity[sev] || borderBySeverity.safe;

  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-surface-secondary border border-border-subtle border-l-4 ${borderClass} rounded-lg cursor-pointer hover:bg-surface-elevated transition-colors duration-200 animate-alert-card`}
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <SeverityBadge severity={alert.severity || alert.alert_type} />

      <div className="flex-1 min-w-0">
        <p className={`text-text-primary text-sm ${fullMessage ? '' : 'truncate'}`}>{alert.message}</p>
        <div className="flex items-center gap-2 text-text-muted text-xs mt-1">
          <span>
            {alert.sensor_name || 'System'}, {alert.location_name}
          </span>
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
