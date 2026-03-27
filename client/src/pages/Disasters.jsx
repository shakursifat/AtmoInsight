import { useDisasters, useDisasterSummary } from '../api/hooks';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import SeverityBadge from '../components/shared/SeverityBadge';

export default function Disasters() {
  const { disasters, loading: distLoading, error: distErr } = useDisasters();
  const { summary, loading: sumLoading, error: sumErr } = useDisasterSummary();

  const renderImpact = (lbl, val) => {
    if (!val || val === '0') return null;
    return (
      <div className="flex flex-col bg-surface-primary px-2 py-1 rounded border border-border-subtle">
        <span className="text-[10px] uppercase text-text-muted">{lbl}</span>
        <span className="font-data text-xs text-text-secondary">{val}</span>
      </div>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Timeline Column */}
      <section className="lg:col-span-8 flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Disaster Intelligence</h1>
          <p className="text-text-muted text-sm">Chronological events and severity ratings</p>
        </header>
        
        <div className="relative border-l-2 border-border-subtle pl-6 space-y-8 ml-2 mt-4">
          {distLoading ? <LoadingSpinner /> : distErr ? <EmptyState message="Failed to load events" /> : (disasters || []).length === 0 ? <EmptyState message="No recorded disasters" /> : (
            disasters.map(d => {
              const borderColors = {
                critical: 'border-severity-critical bg-severity-critical',
                high: 'border-severity-high bg-severity-high',
                moderate: 'border-severity-moderate bg-severity-moderate',
                safe: 'border-severity-safe bg-severity-safe',
              };
              const sevNorm = (d.severity || '').toLowerCase();
              const bColor = borderColors[sevNorm] || borderColors.safe;

              return (
                <div key={d.event_id} className="relative group">
                  <div className={`absolute -left-9 w-4 h-4 rounded-full mt-1.5 border-[3px] border-surface-primary ${bColor.split(' ')[1]}`} />
                  
                  <div className="bg-surface-secondary border border-border-subtle rounded-lg p-5 group-hover:bg-surface-elevated transition-colors shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-surface-primary border border-border-subtle text-text-secondary font-medium px-2 py-0.5 rounded text-xs">
                          {d.disaster_type}
                        </span>
                        <SeverityBadge severity={d.severity} />
                      </div>
                      
                      <div className="text-text-muted text-xs flex flex-col items-end">
                        <span className="font-data">{new Date(d.start_timestamp).toLocaleDateString()} &rarr; {d.end_timestamp ? new Date(d.end_timestamp).toLocaleDateString() : 'Ongoing'}</span>
                        <span className="mt-1 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-text-muted rounded-full"></span> {d.location_name}, {d.region}</span>
                      </div>
                    </div>

                    <p className="text-sm text-text-primary mt-3 leading-relaxed max-w-2xl">{d.description}</p>
                    
                    <div className="flex flex-wrap gap-2 mt-4">
                      {renderImpact('Deaths', d.deaths)}
                      {renderImpact('Injuries', d.injuries)}
                      {renderImpact('Affected', d.affected_people)}
                      {renderImpact('Econ. Loss', d.economic_loss ? `$${d.economic_loss}` : d.economic_loss)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Right Summary Column */}
      <section className="lg:col-span-4 sticky top-6 bg-surface-secondary border border-border-subtle rounded-lg p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-4 border-b border-border-subtle pb-2">Impact Overview</h2>
        
        {sumLoading ? <LoadingSpinner /> : sumErr ? <EmptyState message="Failed summary" /> : summary.length === 0 ? <EmptyState message="No summaries" /> : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
               {['deaths', 'injuries', 'affected_people'].map(key => {
                 const total = summary.reduce((acc, s) => acc + (parseInt(s[`total_${key}`] || '0')), 0);
                 if (total === 0) return null;
                 return (
                   <div key={key} className="bg-surface-primary border border-border-subtle p-3 rounded">
                      <div className="text-text-muted text-[10px] uppercase mb-1">{key.replace('_', ' ')}</div>
                      <div className="font-data text-xl text-text-primary">{total.toLocaleString()}</div>
                   </div>
                 );
               })}
            </div>

            <div className="flex flex-col gap-3">
               <div className="text-xs font-semibold text-text-secondary uppercase mb-1">Events By Subgroup</div>
               {summary.map(s => (
                 <div key={s.subgroup_name || s.disaster_type} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                       <span className="text-text-primary">{s.subgroup_name || s.disaster_type}</span>
                       <span className="font-data text-text-muted">{s.event_count}</span>
                    </div>
                    {/* Visual bar placeholder */}
                    <div className="w-full h-1.5 bg-surface-primary rounded-full overflow-hidden">
                       <div className="h-full bg-data-blue" style={{ width: `${Math.min((s.event_count/5)*100, 100)}%` }}></div>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
