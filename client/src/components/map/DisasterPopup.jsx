import { Popup } from 'react-map-gl/mapbox';
import SeverityBadge from '../shared/SeverityBadge';

function getPopupCoords(feature) {
  const g = feature.geometry;
  if (!g) return [0, 0];
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'Polygon' && g.coordinates?.[0]?.length) {
    const ring = g.coordinates[0];
    let sumLng = 0;
    let sumLat = 0;
    let n = 0;
    ring.forEach(([lng, lat]) => {
      sumLng += lng;
      sumLat += lat;
      n += 1;
    });
    return n ? [sumLng / n, sumLat / n] : ring[0];
  }
  return [0, 0];
}

export default function DisasterPopup({ feature, onClose }) {
  const p = feature.properties || {};
  const [lng, lat] = getPopupCoords(feature);

  return (
    <Popup
      longitude={lng}
      latitude={lat}
      anchor="bottom"
      offset={14}
      onClose={onClose}
      closeButton={false}
      className="z-50"
      maxWidth="280px"
    >
      <div className="bg-surface-elevated border border-border-subtle rounded-lg p-4 text-text-primary shadow-xl min-w-[220px] flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-text-secondary uppercase">{p.disaster_type || 'Event'}</span>
          <SeverityBadge severity={p.severity} />
        </div>
        <h4 className="font-data font-bold text-sm text-accent-gold">{p.location_name}</h4>
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-4">{p.description}</p>
        {(p.start_timestamp || p.end_timestamp) && (
          <div className="text-[10px] text-text-muted font-data border-t border-border-subtle pt-2">
            {p.start_timestamp ? new Date(p.start_timestamp).toLocaleString() : ''}
            {p.end_timestamp ? ` → ${new Date(p.end_timestamp).toLocaleString()}` : ''}
          </div>
        )}
      </div>
    </Popup>
  );
}
