/**
 * PollutionCard.jsx
 * -----------------
 * Reusable card for displaying a single pollutant metric.
 *
 * Props:
 *   icon      {string}  - Emoji icon for the pollutant
 *   label     {string}  - Pollutant name, e.g. "PM2.5"
 *   value     {number|null} - Numeric reading value
 *   unit      {string}  - Unit string, e.g. "µg/m³"
 *   color     {string}  - Accent hex color for border/glow
 *   quality   {string}  - Short quality text, e.g. "Good", "Moderate"
 */
export default function PollutionCard({ icon, label, value, unit, color, quality }) {
  const displayValue = value != null ? Number(value).toFixed(1) : '—';

  // Pick a background opacity based on quality level
  const qualityColors = {
    Good:        '#22c55e',
    Moderate:    '#eab308',
    Unhealthy:   '#ef4444',
    Hazardous:   '#7f1d1d',
    Unknown:     '#64748b',
  };
  const qualityColor = qualityColors[quality] || qualityColors.Unknown;

  return (
    <div
      className="glass-card"
      style={{
        borderColor: `${color}33`,
        borderWidth: '1px',
        borderStyle: 'solid',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 140,
      }}
    >
      {/* Subtle glow blob in the background */}
      <div style={{
        position: 'absolute',
        top: '-30%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '80%',
        height: '80%',
        background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Icon */}
      <div style={{ fontSize: '1.8rem', marginBottom: '0.4rem' }}>{icon}</div>

      {/* Label */}
      <div style={{
        fontSize: '0.72rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        fontWeight: 600,
        marginBottom: '0.6rem',
      }}>
        {label}
      </div>

      {/* Value */}
      <div style={{
        fontSize: '2rem',
        fontWeight: 800,
        color: color,
        lineHeight: 1,
        filter: value != null ? `drop-shadow(0 0 8px ${color}55)` : 'none',
      }}>
        {displayValue}
      </div>

      {/* Unit */}
      <div style={{
        fontSize: '0.75rem',
        color: '#64748b',
        marginTop: '0.25rem',
        marginBottom: '0.6rem',
        fontFamily: 'monospace',
      }}>
        {unit || '—'}
      </div>

      {/* Quality badge */}
      {quality && (
        <div style={{
          display: 'inline-block',
          padding: '0.15rem 0.6rem',
          borderRadius: 999,
          background: `${qualityColor}22`,
          border: `1px solid ${qualityColor}55`,
          color: qualityColor,
          fontSize: '0.7rem',
          fontWeight: 700,
        }}>
          {quality}
        </div>
      )}
    </div>
  );
}
