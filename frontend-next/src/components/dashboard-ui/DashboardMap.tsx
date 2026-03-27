"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polygon } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Create custom icons using SVG
const createIcon = (color: string) => {
  return L.divIcon({
    className: "custom-icon",
    html: `
      <div style="
        background-color: ${color};
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

const redIcon = createIcon("#dc2626"); // text-red-600
const greenIcon = createIcon("#10b981"); // text-emerald-500
const orangeIcon = createIcon("#f59e0b"); // text-amber-500

// Flood extent coordinates (mock polygon around Buriganga)
const floodPolygon: [number, number][] = [
  [23.7000, 90.3800],
  [23.7150, 90.3950],
  [23.7050, 90.4100],
  [23.6900, 90.4000],
];

export default function DashboardMap() {
  // Fix for Leaflet default icon issues in some builds
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
      iconUrl: require("leaflet/dist/images/marker-icon.png"),
      shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
    });
  }, []);

  return (
    <div className="w-full h-[50vh] min-h-[400px] z-0 relative shadow-sm border-b border-gray-100">
      <MapContainer
        center={[23.7260, 90.3952]}
        zoom={12}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        {/* Flood Extent Area */}
        <Polygon 
          positions={floodPolygon} 
          pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.2, weight: 1 }} 
        />

        {/* Markers */}
        <Marker position={[23.7260, 90.3952]} icon={redIcon}>
          <Popup className="font-sans text-sm">
            <div className="font-semibold text-gray-900">Dhaka City Centre</div>
            <div className="text-red-600 font-mono mt-1">Status: Critical</div>
            <div className="text-gray-500 font-mono text-xs">PM2.5: 178.9 µg/m³</div>
          </Popup>
        </Marker>

        <Marker position={[23.7266, 90.3888]} icon={greenIcon}>
          <Popup className="font-sans text-sm">
            <div className="font-semibold text-gray-900">BUET</div>
            <div className="text-emerald-500 font-mono mt-1">Status: Normal</div>
            <div className="text-gray-500 font-mono text-xs">Temp: 34.1 °C</div>
          </Popup>
        </Marker>

        <Marker position={[23.7050, 90.3950]} icon={orangeIcon}>
          <Popup className="font-sans text-sm">
            <div className="font-semibold text-gray-900">Buriganga</div>
            <div className="text-amber-500 font-mono mt-1">Status: Elevated</div>
            <div className="text-gray-500 font-mono text-xs">River Level: 8.4m</div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
