export default function SeverityBadge({ severity }) {
  const norm = severity ? severity.toLowerCase() : 'safe';
  let colorClass = 'bg-severity-safe';
  
  if (norm === 'critical') colorClass = 'bg-severity-critical';
  else if (norm === 'high') colorClass = 'bg-severity-high';
  else if (norm === 'moderate') colorClass = 'bg-severity-moderate';

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-surface-elevated text-text-primary border border-border-subtle">
      <span className={`w-2 h-2 rounded-full ${colorClass}`} />
      {severity || 'Unknown'}
    </span>
  );
}
