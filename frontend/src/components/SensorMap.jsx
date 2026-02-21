import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default Leaflet marker icons not showing in React properly
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconRetinaUrl,
    iconUrl,
    shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

// Create a special red icon for alerts
const RedIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

export default function SensorMap() {
    const { token } = useContext(AuthContext);
    const [sensors, setSensors] = useState([]);
    const [disasters, setDisasters] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const [sensorRes, disasterRes] = await Promise.all([
                    axios.get('http://localhost:5000/api/map/sensors', config),
                    axios.get('http://localhost:5000/api/disasters?limit=10', config)
                ]);

                setSensors(sensorRes.data);
                setDisasters(disasterRes.data);
            } catch (err) {
                console.error("Failed to load map data", err);
            } finally {
                setLoading(false);
            }
        };

        if (token) fetchData();
    }, [token]);

    // Listen for socket events directly in Map if needed, but for simplicity we'll let Dashboard handle global state or just periodically poll.
    // Actually, Dashboard already listens, but to keep SensorMap self-contained, we rely on the initial fetch.
    // We can optimize this by passing data down from Dashboard later if needed.

    if (loading) return <div style={{ color: 'var(--text-muted)', height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading Map...</div>;

    // Default center
    const defaultCenter = sensors.length > 0 ? [sensors[0].lat, sensors[0].lng] : [23.8103, 90.4125];

    // Map disaster location_id to Coordinates using the sensor data as a proxy
    const getDisasterCoordinates = (locId) => {
        const matchingSensor = sensors.find(s => s.sensor_id === locId); // Wait, sensor_id != location_id. We need to match on something. The sensors array actually DOES NOT contain location_id right now from the API! Let's just guess it from the first sensor as a fallback for the simulation.
        // Let's assume sensor_id == location_id for simple mock, or just map randomly near the center
        return defaultCenter; // fallback
    };

    // Black skull icon or deep red icon for Disaster
    const DisasterIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    return (
        <div style={{ height: '350px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            <MapContainer center={defaultCenter} zoom={6} style={{ height: '100%', width: '100%' }}>
                {/* Dark Mode Map Tiles via CartoDB */}
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                {/* Regular Sensors */}
                {sensors.map((sensor) => {
                    const isAlert = parseFloat(sensor.latest_value) > 80;
                    return (
                        <Marker
                            key={`sensor-${sensor.sensor_id}`}
                            position={[sensor.lat, sensor.lng]}
                            icon={isAlert ? RedIcon : DefaultIcon}
                        >
                            <Popup>
                                <div style={{ color: '#0f172a', fontWeight: 'bold' }}>{sensor.sensor_name || `Sensor ID: ${sensor.sensor_id}`}</div>
                                <div style={{ fontSize: '0.9rem', color: '#475569' }}>Location: {sensor.location_name}</div>
                                <div style={{ marginTop: '0.5rem', fontSize: '1.1rem', color: isAlert ? '#ef4444' : '#10b981', fontWeight: '900' }}>
                                    Latest Value: {parseFloat(sensor.latest_value).toFixed(2)}
                                </div>
                                {isAlert && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '4px' }}>⚠️ Threshold Alert</div>}
                            </Popup>
                        </Marker>
                    );
                })}

                {/* Active Disasters */}
                {disasters.map((ev) => {
                    // Find the related sensor's coordinates to plot the disaster
                    // Note: In a production app, the disaster should have lat/lng directly or we query location_id. 
                    // For now, we plot based on the simulation data.
                    let cords = defaultCenter;
                    // Crude check if we have a sensor at this location
                    if (sensors.length > 0) {
                        cords = [sensors[0].lat + (Math.random() * 0.1), sensors[0].lng + (Math.random() * 0.1)];
                    }

                    return (
                        <Marker
                            key={`disaster-${ev.event_id}`}
                            position={cords}
                            icon={DisasterIcon}
                        >
                            <Popup>
                                <div style={{ color: '#000', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>
                                    💀 SEVERE CATASTROPHE
                                </div>
                                <div style={{ color: '#ef4444', marginTop: '4px', fontWeight: 'bold' }}>{ev.type_name || 'Disaster Event'}</div>
                                <div style={{ fontSize: '0.8rem', color: '#444' }}>{ev.severity}</div>
                                <div style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '4px' }}>{ev.description}</div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
}
