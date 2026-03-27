import { Source, Layer, Marker } from 'react-map-gl/mapbox';

export default function DisasterLayer({ data, onClick }) {
  if (!data?.features) return null;

  const polys = data.features.filter(f => f.geometry && f.geometry.type === 'Polygon');
  const points = data.features.filter(f => f.geometry && f.geometry.type === 'Point');

  const polygonSource = {
    type: 'FeatureCollection',
    features: polys
  };

  const polyStyle = {
    id: 'disaster-polys',
    type: 'fill',
    paint: {
      'fill-color': '#FF9500',  // severity-high
      'fill-opacity': 0.2,
      'fill-outline-color': '#FF3B30'
    }
  };

  return (
    <>
      {polys.length > 0 && (
        <Source id="disaster-poly-source" type="geojson" data={polygonSource}>
          <Layer {...polyStyle} />
        </Source>
      )}

      {points.map((f, i) => {
        const coords = f.geometry.coordinates;
        return (
          <Marker 
            key={`disast-${f.properties?.event_id || i}`} 
            longitude={coords[0]} 
            latitude={coords[1]} 
            anchor="bottom"
            onClick={e => {
                e.originalEvent.stopPropagation();
                onClick(f);
            }}
          >
            <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-b-[14px] border-transparent border-b-severity-high hover:scale-125 transition-transform cursor-pointer drop-shadow-md"></div>
          </Marker>
        );
      })}
    </>
  );
}
