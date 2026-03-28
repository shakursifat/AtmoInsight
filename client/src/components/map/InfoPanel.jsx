import { useState } from 'react';
import { useCurrentConditions, useActiveAlerts } from '../../api/hooks';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../shared/LoadingSpinner';
import { AlertCircle, ChevronUp } from 'lucide-react';

export default function InfoPanel() {
  const { conditions, loading: condLoading } = useCurrentConditions();
  const { alerts, loading: alertL } = useActiveAlerts();
  const nav = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const primary =
    conditions.length > 0
      ? conditions.filter(c => ['PM2.5', 'Temperature', 'Humidity'].includes(c.measurement))
      : [];

  const pm25 = conditions.find(c => c.measurement === 'PM2.5');

  return (
    <>
      {/* Mobile: thin bar — PM2.5 priority, tap to expand */}
      <div className="md:hidden pointer-events-auto fixed left-3 right-3 bottom-[5.5rem] z-20">
        {!expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full bg-surface-secondary/95 backdrop-blur-md border border-border-subtle rounded-xl px-4 py-3 flex items-center justify-between shadow-xl"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              PM2.5
            </span>
            {condLoading ? (
              <span className="text-xs text-text-muted">Loading…</span>
            ) : pm25 ? (
              <span className="font-data text-lg text-data-blue">
                {Number(pm25.value).toFixed(1)} <span className="text-xs text-text-muted">{pm25.unit}</span>
              </span>
            ) : (
              <span className="text-xs text-text-muted">N/A</span>
            )}
            <span className="text-[10px] text-text-muted">Tap for more</span>
          </button>
        ) : (
          <div className="bg-surface-secondary/95 backdrop-blur-md border border-border-subtle rounded-xl p-4 shadow-xl flex flex-col gap-3 max-h-[50vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Current Core Conditions
              </h3>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="p-1 rounded-md text-text-muted hover:text-text-primary"
                aria-label="Collapse"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {condLoading ? (
                <div className="flex justify-center py-4">
                  <LoadingSpinner />
                </div>
              ) : (
                primary.map(c => (
                  <div
                    key={c.measurement}
                    className="flex items-center justify-between border-b border-border-subtle pb-2 last:border-0 last:pb-0"
                  >
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
              className="mt-1 flex items-center justify-center gap-2 p-3 bg-surface-primary cursor-pointer hover:bg-surface-elevated transition-colors rounded-lg border border-border-subtle"
            >
              {alertL ? (
                <span className="text-xs text-text-muted">Syncing alerts...</span>
              ) : (
                <>
                  <AlertCircle
                    className={`w-4 h-4 ${alerts.length > 0 ? 'text-severity-critical' : 'text-severity-safe'}`}
                  />
                  <span
                    className={`text-sm font-medium ${alerts.length > 0 ? 'text-severity-critical' : 'text-text-muted'}`}
                  >
                    {alerts.length} active alerts
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Desktop panel */}
      <div className="hidden md:flex absolute bottom-6 left-6 w-[320px] bg-surface-secondary/85 backdrop-blur-md border border-border-subtle rounded-xl p-5 shadow-2xl pointer-events-auto flex-col gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Current Core Conditions</h3>

        <div className="flex flex-col gap-3">
          {condLoading ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner />
            </div>
          ) : (
            primary.map(c => (
              <div
                key={c.measurement}
                className="flex items-center justify-between border-b border-border-subtle pb-2 last:border-0 last:pb-0"
              >
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
          {alertL ? (
            <span className="text-xs text-text-muted">Syncing alerts...</span>
          ) : (
            <>
              <AlertCircle
                className={`w-4 h-4 ${alerts.length > 0 ? 'text-severity-critical' : 'text-severity-safe'}`}
              />
              <span
                className={`text-sm font-medium ${alerts.length > 0 ? 'text-severity-critical' : 'text-text-muted'}`}
              >
                {alerts.length} active alerts
              </span>
            </>
          )}
        </div>
      </div>
    </>
  );
}
