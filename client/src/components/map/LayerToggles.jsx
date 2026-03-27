import { Layers } from 'lucide-react';

export default function LayerToggles({ layers, setLayers }) {
  const toggle = (key) => setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="absolute top-6 right-6 bg-surface-secondary border border-border-subtle rounded-lg p-2 shadow-xl pointer-events-auto flex items-center gap-2">
      <Layers className="w-4 h-4 text-text-muted ml-1 mr-2" />
      {[
        { key: 'sensors', label: 'Sensors' },
        { key: 'disasters', label: 'Disasters' },
        { key: 'reports', label: 'Reports' }
      ].map(lyr => (
        <button
          key={lyr.key}
          onClick={() => toggle(lyr.key)}
          className={`text-xs px-3 py-1.5 rounded transition-all font-medium ${
            layers[lyr.key]
              ? 'bg-surface-elevated text-text-primary border border-accent-gold'
              : 'bg-surface-primary text-text-muted border border-border-subtle hover:text-text-secondary'
          }`}
        >
          {lyr.label}
        </button>
      ))}
    </div>
  );
}
