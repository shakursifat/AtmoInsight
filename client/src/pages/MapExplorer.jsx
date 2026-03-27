import { useState, useRef } from 'react';
import Map, { NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useSensorsGeoJSON, useDisastersGeoJSON } from '../api/hooks';
import SensorLayer from '../components/map/SensorLayer';
import DisasterLayer from '../components/map/DisasterLayer';
import SensorPopup from '../components/map/SensorPopup';
import InfoPanel from '../components/map/InfoPanel';
import LayerToggles from '../components/map/LayerToggles';
import LoadingSpinner from '../components/shared/LoadingSpinner';

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

export default function MapExplorer() {
  const mapRef = useRef();
  const { data: sensors, loading: sLoading } = useSensorsGeoJSON();
  const { data: disasters, loading: dLoading } = useDisastersGeoJSON();
  
  const [layers, setLayers] = useState({ sensors: true, disasters: true, reports: false });
  const [activeSensor, setActiveSensor] = useState(null);

  if (!mapboxToken || mapboxToken.includes('pk.eyJ1IjoiYXRt')) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center flex-col gap-4">
        <div className="text-severity-critical font-bold mb-2">Mapbox Token Required</div>
        <p className="max-w-md text-text-muted text-sm">Please register at mapbox.com and add your free Mapbox GL token to `client/.env` as VITE_MAPBOX_TOKEN.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-surface-primary">
      {(sLoading || dLoading) && (
        <div className="absolute inset-0 z-10 bg-surface-primary/50 backdrop-blur-sm flex items-center justify-center pointer-events-none">
           <LoadingSpinner />
        </div>
      )}

      <Map
        ref={mapRef}
        initialViewState={{
          longitude: 90.4074,
          latitude: 23.7104,
          zoom: 11,
          pitch: 45
        }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={mapboxToken}
        interactiveLayerIds={['disaster-polys']}
        onClick={() => setActiveSensor(null)}
        attributionControl={false}
      >
        <NavigationControl position="bottom-right" />
        
        {layers.disasters && <DisasterLayer data={disasters} onClick={() => {}} />}
        {layers.sensors && <SensorLayer data={sensors} onClick={setActiveSensor} />}
        
        {activeSensor && (
          <SensorPopup feature={activeSensor} onClose={() => setActiveSensor(null)} />
        )}
      </Map>
      
      <div className="absolute inset-0 pointer-events-none">
        <LayerToggles layers={layers} setLayers={setLayers} />
        <InfoPanel />
      </div>
    </div>
  );
}
