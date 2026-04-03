import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Map, { NavigationControl, Marker } from 'react-map-gl/mapbox';
import { useSearchParams } from 'react-router-dom';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useSensorsGeoJSON, useDisastersGeoJSON } from '../api/hooks';
import SensorLayer from '../components/map/SensorLayer';
import DisasterLayer from '../components/map/DisasterLayer';
import SensorPopup from '../components/map/SensorPopup';
import DisasterPopup from '../components/map/DisasterPopup';
import InfoPanel from '../components/map/InfoPanel';
import LayerToggles from '../components/map/LayerToggles';
import AddSensorPanel from '../components/map/AddSensorPanel';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { Plus, Crosshair, X } from 'lucide-react';

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

function getUser() {
  try {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export default function MapExplorer() {
  const mapRef = useRef();
  const [searchParams] = useSearchParams();
  const { data: sensors, loading: sLoading, refetch: refetchSensors } = useSensorsGeoJSON();
  const { data: disasters, loading: dLoading } = useDisastersGeoJSON();

  // Admin state
  const user = useMemo(() => getUser(), []);
  const isAdmin = user?.role_id === 1;

  // Placement mode state
  const [placementMode, setPlacementMode] = useState(false);
  const [pickedCoords, setPickedCoords] = useState(null); // [lng, lat]
  const [showPanel, setShowPanel] = useState(false);

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
    // If in placement mode, capture the click as sensor coordinates
    if (placementMode) {
      const { lng, lat } = event.lngLat;
      setPickedCoords([lng, lat]);
      setShowPanel(true);
      setPlacementMode(false);
      return;
    }

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
  }, [placementMode]);

  const handleEnterPlacement = () => {
    setPlacementMode(true);
    setPickedCoords(null);
    setShowPanel(false);
    setActiveSensor(null);
    setActiveDisaster(null);
  };

  const handleCancelPlacement = () => {
    setPlacementMode(false);
    setPickedCoords(null);
    setShowPanel(false);
  };

  const handlePanelClose = () => {
    setShowPanel(false);
    setPickedCoords(null);
  };

  const handleSensorCreated = () => {
    refetchSensors();
  };

  // Cursor style based on mode
  const cursorStyle = placementMode ? 'crosshair' : '';

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
        cursor={cursorStyle}
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
              if (!placementMode) {
                setActiveSensor(f);
                setActiveDisaster(null);
              }
            }}
          />
        )}

        {/* Placement mode preview marker */}
        {pickedCoords && (
          <Marker longitude={pickedCoords[0]} latitude={pickedCoords[1]} anchor="center">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-8 h-8 rounded-full bg-accent-gold/25 animate-ping" />
              <div className="w-4 h-4 rounded-full bg-accent-gold border-2 border-surface-primary shadow-lg" />
            </div>
          </Marker>
        )}

        {activeSensor && !placementMode && (
          <SensorPopup feature={activeSensor} onClose={() => setActiveSensor(null)} />
        )}
        {activeDisaster && !placementMode && (
          <DisasterPopup feature={activeDisaster} onClose={() => setActiveDisaster(null)} />
        )}
      </Map>

      <div className="absolute inset-0 pointer-events-none">
        <LayerToggles layers={layers} setLayers={setLayers} />
        <InfoPanel />

        {/* Admin: Add Sensor Button */}
        {isAdmin && !placementMode && !showPanel && (
          <button
            id="add-sensor-btn"
            onClick={handleEnterPlacement}
            className="pointer-events-auto absolute bottom-6 right-6 md:bottom-8 md:right-8 bg-accent-gold text-surface-primary px-4 py-2.5 rounded-lg font-bold text-sm shadow-lg hover:bg-accent-gold/90 transition-all duration-200 flex items-center gap-2 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Add Sensor
          </button>
        )}

        {/* Placement Mode Banner */}
        {placementMode && (
          <div className="pointer-events-auto absolute top-6 left-1/2 -translate-x-1/2 bg-surface-secondary/95 backdrop-blur-xl border border-accent-gold/50 rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-accent-gold/15 border border-accent-gold/30 flex items-center justify-center shrink-0">
              <Crosshair className="w-4 h-4 text-accent-gold" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-text-primary">Click on the map</span>
              <span className="text-[11px] text-text-muted">Select a location for the new sensor</span>
            </div>
            <button
              onClick={handleCancelPlacement}
              className="ml-3 p-1.5 rounded-md hover:bg-surface-elevated text-text-muted hover:text-text-primary transition-colors"
              aria-label="Cancel placement"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Add Sensor Panel */}
        {showPanel && pickedCoords && (
          <AddSensorPanel
            coordinates={pickedCoords}
            onClose={handlePanelClose}
            onSensorCreated={handleSensorCreated}
          />
        )}
      </div>
    </div>
  );
}
