import { Marker } from 'react-map-gl/mapbox';

export default function SensorLayer({ data, onClick }) {
  if (!data?.features) return null;

  return (
    <>
      {data.features.filter(f => f.geometry && f.geometry.type === 'Point').map((f, i) => {
        const coords = f.geometry.coordinates;
        const p = f.properties;
        
        let colorClass = 'bg-data-blue border-data-blue';
        let isCritical = false;

        if (p.latest_measurement === 'PM2.5') {
            const val = parseFloat(p.latest_value);
            if (val > 150) { colorClass = 'bg-severity-critical border-severity-critical'; isCritical = true; }
            else if (val > 75) colorClass = 'bg-severity-high border-severity-high';
            else if (val > 35) colorClass = 'bg-severity-moderate border-severity-moderate';
            else colorClass = 'bg-severity-safe border-severity-safe';
        }

        return (
          <Marker 
            key={`sensor-${p.sensor_id || i}`} 
            longitude={coords[0]} 
            latitude={coords[1]} 
            anchor="center"
            onClick={e => {
                e.originalEvent.stopPropagation();
                onClick(f);
            }}
          >
            <div className="relative group cursor-pointer w-4 h-4 flex items-center justify-center transition-transform hover:scale-125">
              {isCritical && (
                <div className={`absolute inset-0 rounded-full ${colorClass} opacity-50 animate-ping`}></div>
              )}
              <div className={`w-3 h-3 rounded-full border-2 border-surface-primary shadow-md ${colorClass}`}></div>
            </div>
          </Marker>
        );
      })}
    </>
  );
}
