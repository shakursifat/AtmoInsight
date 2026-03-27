import { Popup } from 'react-map-gl/mapbox';
import RelativeTime from '../shared/RelativeTime';

export default function SensorPopup({ feature, onClose }) {
  const p = feature.properties;
  const coords = feature.geometry.coordinates;

  let colorClass = 'text-data-blue';
  if (p.latest_measurement === 'PM2.5') {
      const val = parseFloat(p.latest_value);
      if (val > 150) colorClass = 'text-severity-critical';
      else if (val > 75) colorClass = 'text-severity-high';
      else if (val > 35) colorClass = 'text-severity-moderate';
      else colorClass = 'text-severity-safe';
  }

  return (
    <Popup 
      longitude={coords[0]} 
      latitude={coords[1]} 
      anchor="bottom" 
      offset={14}
      onClose={onClose}
      closeButton={false}
      className="z-50"
      maxWidth="250px"
    >
      <div className="bg-surface-elevated border border-border-subtle rounded-lg p-4 text-text-primary shadow-xl min-w-[200px] flex flex-col gap-1">
        <h4 className="font-data font-bold tracking-tight text-sm text-accent-gold">{p.name}</h4>
        <span className="text-[10px] text-text-secondary uppercase">{p.location_name}</span>
        
        <div className={`font-data text-2xl font-bold mt-2 ${colorClass}`}>
          {Number(p.latest_value).toFixed(1)} <span className="text-sm border-none bg-transparent opacity-75">{p.latest_unit}</span>
        </div>
        
        <div className="flex justify-between items-center text-xs mt-1 border-t border-border-subtle pt-2">
          <span className="text-text-muted">{p.latest_measurement}</span>
          <RelativeTime timestamp={p.latest_timestamp} className="text-text-secondary" />
        </div>
        
        <button 
          onClick={() => console.log(`Viewing history for ${p.sensor_id}`)}
          className="mt-3 text-[11px] text-data-blue hover:text-accent-gold transition-colors text-left"
        >
          View History &rarr;
        </button>
      </div>
    </Popup>
  );
}
