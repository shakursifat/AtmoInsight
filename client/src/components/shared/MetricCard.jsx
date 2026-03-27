export default function MetricCard({ label, value, unit, sublabel, severity }) {
  const norm = severity ? severity.toLowerCase() : 'safe';
  let colorClass = 'text-data-blue';
  
  if (norm === 'critical') colorClass = 'text-severity-critical';
  else if (norm === 'high') colorClass = 'text-severity-high';
  else if (norm === 'moderate') colorClass = 'text-severity-moderate';

  return (
    <div className="bg-surface-secondary border border-border-subtle rounded-lg p-4 flex flex-col gap-1 transition-colors hover:border-accent-gold/50">
      <span className="text-text-secondary text-[13px] uppercase tracking-wide">{label}</span>
      <div className={`font-data text-3xl font-bold tracking-tight ${colorClass} py-1`}>
        {value} <span className="text-lg opacity-75">{unit}</span>
      </div>
      <span className="text-text-muted text-xs truncate" title={sublabel}>{sublabel}</span>
    </div>
  );
}
