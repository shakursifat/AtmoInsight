import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper: PM2.5 to AQI conversion and colors
const getAqiInfo = (pm25) => {
    if (pm25 == null) return { aqi: 'N/A', category: 'Unknown', color: '#808080' };
    
    // US EPA simplified breakpoints
    if (pm25 <= 12.0) return { aqi: Math.round((50/12.0) * pm25), category: 'Good', color: '#10b981' };
    if (pm25 <= 35.4) return { aqi: Math.round(((99-51)/(35.4-12.1)) * (pm25 - 12.1) + 51), category: 'Moderate', color: '#facc15' };
    if (pm25 <= 55.4) return { aqi: Math.round(((149-101)/(55.4-35.5)) * (pm25 - 35.5) + 101), category: 'Unhealthy for Sensitive Groups', color: '#f97316' };
    if (pm25 <= 150.4) return { aqi: Math.round(((199-151)/(150.4-55.5)) * (pm25 - 55.5) + 151), category: 'Unhealthy', color: '#ef4444' };
    if (pm25 <= 250.4) return { aqi: Math.round(((299-201)/(250.4-150.5)) * (pm25 - 150.5) + 201), category: 'Very Unhealthy', color: '#a855f7' };
    return { aqi: Math.round(((500-301)/(500.4-250.5)) * (pm25 - 250.5) + 301), category: 'Hazardous', color: '#9f1239' };
};

// Custom Marker Icon generator
const createCustomIcon = (color, aqiValue) => {
    return L.divIcon({
        className: 'custom-aqi-icon',
        html: `<div style="
            background-color: ${color};
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 2px solid white;
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${color === '#facc15' ? '#000' : '#fff'};
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            text-shadow: ${color === '#facc15' ? 'none' : '0 1px 2px rgba(0,0,0,0.5)'};
        ">${aqiValue}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });
};

// Component to handle map view updates dynamically
const MapController = ({ center, zoom }) => {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo(center, zoom, { animate: true, duration: 1.5 });
        }
    }, [center, zoom, map]);
    return null;
};

const InteractiveMap = () => {
    const [sensors, setSensors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showHeatLayer, setShowHeatLayer] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [mapCenter, setMapCenter] = useState([23.8103, 90.4125]); // Default Dhaka
    const [mapZoom, setMapZoom] = useState(11);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchSensors = async () => {
        setLoading(true);
        try {
            const response = await axios.get('http://localhost:5000/api/sensors');
            // Filter out sensors without coordinates
            const validSensors = response.data.filter(s => s.lat != null && s.lng != null);
            setSensors(validSensors);
            setLastUpdated(new Date());
        } catch (error) {
            console.error('Error fetching sensor data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSensors();
    }, []);

    const processedSensors = useMemo(() => {
        return sensors.map(sensor => {
            const { aqi, category, color } = getAqiInfo(sensor.latest_pm25);
            return { ...sensor, aqi, category, color };
        });
    }, [sensors]);

    const handleSearch = (e) => {
        e.preventDefault();
        const sq = searchQuery.toLowerCase().trim();
        if (!sq) return;
        const found = processedSensors.find(s => 
            s.name.toLowerCase().includes(sq) || 
            (s.location_name && s.location_name.toLowerCase().includes(sq))
        );
        if (found) {
            setMapCenter([found.lat, found.lng]);
            setMapZoom(14);
        } else {
            alert('Location not found!');
        }
    };

    const centerOnMe = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setMapCenter([position.coords.latitude, position.coords.longitude]);
                    setMapZoom(13);
                },
                () => alert('Could not get your location.')
            );
        } else {
            alert('Geolocation is not supported by your browser.');
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '70vh', minHeight: '500px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
            
            {/* Map Controls Overlay */}
            <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                width: '320px'
            }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '10px', overflow: 'hidden' }}>
                    <input 
                        type="text" 
                        placeholder="Search location (e.g. Mirpur)..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            flex: 1, padding: '12px 14px', border: 'none', backgroundColor: '#fff',
                            outline: 'none', fontSize: '14px', fontWeight: '500', color: '#333'
                        }}
                    />
                    <button type="submit" style={{
                        padding: '0 16px', border: 'none', backgroundColor: '#3b82f6', color: 'white',
                        cursor: 'pointer', fontWeight: 'bold'
                    }}>
                        🔍
                    </button>
                </form>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button onClick={centerOnMe} style={controlButtonStyle}>
                        📍 My Location
                    </button>
                    <button onClick={() => setShowHeatLayer(!showHeatLayer)} style={{...controlButtonStyle, backgroundColor: showHeatLayer ? '#10b981' : 'white', color: showHeatLayer ? 'white' : '#333'}}>
                        {showHeatLayer ? '🌡️ Heat Layer On' : '🌡️ Layers'}
                    </button>
                    <button onClick={fetchSensors} disabled={loading} style={controlButtonStyle}>
                        🔄 Refresh
                    </button>
                </div>
                
                {lastUpdated && (
                    <div style={{ textAlign: 'right', fontSize: '11px', color: '#333', background: 'rgba(255,255,255,0.9)', padding: '4px 8px', borderRadius: '6px', alignSelf: 'flex-end', fontWeight: '500', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                        Updated: {lastUpdated.toLocaleTimeString()}
                    </div>
                )}
            </div>

            <MapContainer 
                center={mapCenter} 
                zoom={mapZoom} 
                style={{ height: '100%', width: '100%', zIndex: 1 }}
                zoomControl={true}
            >
                <MapController center={mapCenter} zoom={mapZoom} />
                
                {/* Light mode base map, clean and modern CARTO Voyager */}
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                />

                {/* Optional Heat Layer (Semi-transparent circles spreading influence) */}
                {showHeatLayer && processedSensors.map(sensor => (
                    <Circle
                        key={`heat-${sensor.sensor_id}`}
                        center={[sensor.lat, sensor.lng]}
                        pathOptions={{ 
                            color: sensor.color,
                            fillColor: sensor.color,
                            fillOpacity: 0.15,
                            weight: 0
                        }}
                        radius={4000} // 4km radius
                    />
                ))}

                <MarkerClusterGroup
                    chunkedLoading
                    maxClusterRadius={45}
                >
                    {processedSensors.map(sensor => (
                        <Marker 
                            key={sensor.sensor_id}
                            position={[sensor.lat, sensor.lng]}
                            icon={createCustomIcon(sensor.color, sensor.aqi)}
                        >
                            <Popup className="custom-popup" closeButton={false}>
                                <div style={{ minWidth: '220px', padding: '4px' }}>
                                    <h3 style={{ margin: '0 0 10px 0', color: '#1f2937', fontSize: '17px', borderBottom: '2px solid #e5e7eb', paddingBottom: '6px', fontWeight: '600' }}>
                                        {sensor.location_name || sensor.name}
                                    </h3>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                                        <div style={{ 
                                            backgroundColor: sensor.color, 
                                            color: sensor.color === '#facc15' ? '#000' : '#fff',
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            fontWeight: 'bold',
                                            fontSize: '22px',
                                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                            textShadow: sensor.color === '#facc15' ? 'none' : '0 1px 2px rgba(0,0,0,0.3)'
                                        }}>
                                            {sensor.aqi} AQI
                                        </div>
                                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#4b5563', lineHeight: '1.3' }}>
                                            {sensor.category}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#4b5563' }}>
                                        <div style={statBoxStyle}>
                                            <span style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>PM2.5</span><br/>
                                            <span style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>{sensor.latest_pm25 ? `${Number(sensor.latest_pm25).toFixed(1)}` : 'N/A'}</span> <span style={{fontSize: '10px'}}>µg/m³</span>
                                        </div>
                                        <div style={statBoxStyle}>
                                            <span style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>Temp</span><br/>
                                            <span style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>{sensor.latest_temp ? `${Number(sensor.latest_temp).toFixed(1)}` : 'N/A'}</span> <span style={{fontSize: '10px'}}>°C</span>
                                        </div>
                                        <div style={{...statBoxStyle, gridColumn: 'span 2'}}>
                                            <span style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>Humidity</span>
                                            <span style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937', marginLeft: '6px' }}>{sensor.latest_humidity ? `${Number(sensor.latest_humidity).toFixed(1)}` : 'N/A'}</span> <span style={{fontSize: '10px'}}>%</span>
                                        </div>
                                    </div>
                                    
                                    <div style={{ marginTop: '12px', fontSize: '11px', color: '#9ca3af', textAlign: 'right', fontWeight: '500' }}>
                                        {sensor.last_reading_timestamp ? `As of ${new Date(sensor.last_reading_timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • ${new Date(sensor.last_reading_timestamp).toLocaleDateString()}` : 'No recent data'}
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MarkerClusterGroup>
            </MapContainer>

            {/* Custom CSS for Popup and Icons */}
            <style>{`
                .leaflet-popup-content-wrapper {
                    border-radius: 14px;
                    box-shadow: 0 12px 28px rgba(0,0,0,0.2) !important;
                    padding: 4px;
                }
                .leaflet-popup-tip {
                    box-shadow: 0 12px 28px rgba(0,0,0,0.2);
                }
                .leaflet-popup-content {
                    margin: 14px;
                }
                .custom-aqi-icon {
                    background: transparent;
                    border: none;
                }
                .custom-aqi-icon div {
                    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .custom-aqi-icon:hover div {
                    transform: scale(1.15);
                    z-index: 1000;
                }
            `}</style>
        </div>
    );
};

const controlButtonStyle = {
    padding: '10px 14px',
    border: 'none',
    backgroundColor: 'white',
    color: '#374151',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
};

const statBoxStyle = {
    backgroundColor: '#f3f4f6',
    padding: '8px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
};

export default InteractiveMap;
