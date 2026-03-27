import { useCurrentConditions, useActiveAlerts } from '../../api/hooks';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../shared/LoadingSpinner';
import { AlertCircle } from 'lucide-react';

export default function InfoPanel() {
  const { conditions, loading: condL } = useCurrentConditions();
  const { alerts, loading: alertL } = useActiveAlerts();
  const nav = useNavigate();

  const primary = conditions.length > 0 ? conditions.filter(c => ['PM2.5', 'Temperature', 'Humidity'].includes(c.measurement)) : [];

  return (
    <div className="absolute bottom-6 left-6 w-[320px] bg-surface-secondary/85 backdrop-blur-md border border-border-subtle rounded-xl p-5 shadow-2xl pointer-events-auto flex flex-col gap-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Current Core Conditions</h3>
      
      <div className="flex flex-col gap-3">
        {condL ? <LoadingSpinner /> : (
          primary.map(c => (
            <div key={c.measurement} className="flex items-center justify-between border-b border-border-subtle pb-2 last:border-0 last:pb-0">
              <span className="text-sm text-text-primary">{c.measurement}</span>
              <div className="font-data text-right">
                <span className="text-lg font-bold text-data-blue">{Number(c.value).toFixed(1)}</span>
                <span className="text-xs text-text-muted ml-1">{c.unit}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div 
        onClick={() => nav('/alerts')}
        className="mt-2 flex items-center justify-center gap-2 p-3 bg-surface-primary cursor-pointer hover:bg-surface-elevated transition-colors rounded-lg border border-border-subtle"
      >
        {alertL ? <span className="text-xs text-text-muted">Syncing alerts...</span> : (
           <>
              <AlertCircle className={`w-4 h-4 ${alerts.length > 0 ? 'text-severity-critical' : 'text-severity-safe'}`} />
              <span className={`text-sm font-medium ${alerts.length > 0 ? 'text-severity-critical' : 'text-text-muted'}`}>
                {alerts.length} active alerts
              </span>
           </>
        )}
      </div>
    </div>
  );
}
