import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Map, { NavigationControl } from 'react-map-gl/mapbox';
import { useSearchParams } from 'react-router-dom';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useSensorsGeoJSON, useDisastersGeoJSON } from '../api/hooks';
import SensorLayer from '../components/map/SensorLayer';
import DisasterLayer from '../components/map/DisasterLayer';
import SensorPopup from '../components/map/SensorPopup';
import DisasterPopup from '../components/map/DisasterPopup';
import InfoPanel from '../components/map/InfoPanel';
import LayerToggles from '../components/map/LayerToggles';
import LoadingSpinner from '../components/shared/LoadingSpinner';

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

function getFeatureCenterCoords(feature) {
  const g = feature?.geometry;
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'Polygon' && g.coordinates?.[0]?.length) {
    const ring = g.coordinates[0];
    let sumLng = 0;
    let sumLat = 0;
    let n = 0;
    ring.forEach(([x, y]) => {
      sumLng += x;
      sumLat += y;
      n += 1;
    });
    return n ? [sumLng / n, sumLat / n] : ring[0];
  }
  return null;
}

export default function MapExplorer() {
  const mapRef = useRef();
  const [searchParams] = useSearchParams();
  const { data: sensors, loading: sLoading } = useSensorsGeoJSON();
  const { data: disasters, loading: dLoading } = useDisastersGeoJSON();

  const urlView = useMemo(() => {
    const lat = parseFloat(searchParams.get('lat'));
    const lng = parseFloat(searchParams.get('lng'));
    const zoom = parseFloat(searchParams.get('zoom'));
    return {
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      zoom: Number.isFinite(zoom) ? zoom : null,
      sensorId: searchParams.get('sensor'),
      disasterId: searchParams.get('disaster'),
    };
  }, [searchParams]);

  const initialViewState = useMemo(
    () => ({
      longitude: urlView.lng ?? 90.4074,
      latitude: urlView.lat ?? 23.7104,
      zoom: urlView.zoom ?? 11,
      pitch: 45,
    }),
    [urlView.lng, urlView.lat, urlView.zoom]
  );

  const [layers, setLayers] = useState({ sensors: true, disasters: true, reports: false });
  const [activeSensor, setActiveSensor] = useState(null);
  const [activeDisaster, setActiveDisaster] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    setMapLoaded(false);
  }, [searchParams]);

  const flyTo = useCallback((lng, lat, zoom) => {
    const map = mapRef.current?.getMap?.();
    if (!map || lng == null || lat == null) return;
    map.flyTo({
      center: [lng, lat],
      zoom: zoom ?? map.getZoom(),
      duration: 1400,
    });
  }, []);

  const onMapLoad = useCallback(() => {
    setMapLoaded(true);
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    const { lng, lat, zoom } = urlView;
    if (lng != null && lat != null) {
      map.flyTo({
        center: [lng, lat],
        zoom: zoom ?? map.getZoom(),
        duration: 1500,
      });
    }
  }, [urlView.lng, urlView.lat, urlView.zoom]);

  useEffect(() => {
    if (!mapLoaded || !sensors?.features) return;
    const sid = urlView.sensorId;
    if (!sid) return;
    const feat = sensors.features.find(
      f => String(f.properties?.sensor_id) === String(sid)
    );
    if (feat) {
      setActiveSensor(feat);
      setActiveDisaster(null);
      const c = feat.geometry?.coordinates;
      if (c) flyTo(c[0], c[1], urlView.zoom ?? 14);
    }
  }, [mapLoaded, sensors, urlView.sensorId, urlView.zoom, flyTo]);

  useEffect(() => {
    if (!mapLoaded || !disasters?.features) return;
    const did = urlView.disasterId;
    if (!did) return;
    if (urlView.sensorId) return;
    const feat = disasters.features.find(
      f => String(f.properties?.event_id) === String(did)
    );
    if (feat) {
      setActiveDisaster(feat);
      setActiveSensor(null);
      const c = getFeatureCenterCoords(feat);
      if (c) flyTo(c[0], c[1], urlView.zoom ?? 13);
    }
  }, [mapLoaded, disasters, urlView.disasterId, urlView.sensorId, urlView.zoom, flyTo]);

  const onMapClick = useCallback(event => {
    const hit = event.features?.find(f => f.layer?.id === 'disaster-polys');
    if (hit) {
      event.originalEvent.stopPropagation();
      const props = hit.properties || {};
      setActiveDisaster({
        type: 'Feature',
        properties: props,
        geometry: hit.geometry,
      });
      setActiveSensor(null);
      return;
    }
    setActiveSensor(null);
    setActiveDisaster(null);
  }, []);

  if (!mapboxToken || mapboxToken.includes('pk.eyJ1IjoiYXRt')) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center flex-col gap-4">
        <div className="text-severity-critical font-bold mb-2">Mapbox Token Required</div>
        <p className="max-w-md text-text-muted text-sm">
          Please register at mapbox.com and add your free Mapbox GL token to `client/.env` as VITE_MAPBOX_TOKEN.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[calc(100vh-4rem)] md:min-h-screen bg-surface-primary">
      {(sLoading || dLoading) && (
        <div className="absolute inset-0 z-10 bg-surface-primary/50 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <LoadingSpinner />
        </div>
      )}

      <Map
        key={searchParams.toString()}
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={mapboxToken}
        interactiveLayerIds={['disaster-polys']}
        onClick={onMapClick}
        onLoad={onMapLoad}
        attributionControl={false}
      >
        <NavigationControl position="bottom-right" />

        {layers.disasters && (
          <DisasterLayer
            data={disasters}
            onClick={f => {
              setActiveDisaster(f);
              setActiveSensor(null);
            }}
          />
        )}
        {layers.sensors && (
          <SensorLayer
            data={sensors}
            onClick={f => {
              setActiveSensor(f);
              setActiveDisaster(null);
            }}
          />
        )}

        {activeSensor && (
          <SensorPopup feature={activeSensor} onClose={() => setActiveSensor(null)} />
        )}
        {activeDisaster && (
          <DisasterPopup feature={activeDisaster} onClose={() => setActiveDisaster(null)} />
        )}
      </Map>

      <div className="absolute inset-0 pointer-events-none">
        <LayerToggles layers={layers} setLayers={setLayers} />
        <InfoPanel />
      </div>
    </div>
  );
}
