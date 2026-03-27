/**
 * MainDashboard.jsx
 * -----------------
 * IQAir-style Air Quality & Weather Dashboard for AtmoInsight.
 *
 * Sections:
 *   1. Sticky top navigation bar — logo | search | current location
 *   2. Hero — location name, temperature, AQI badge
 *   3. AQI scale reference pills
 *   4. Pollution breakdown cards — PM2.5, PM10, NO2, CO, O3, SO2
 *   5. Last 7 Days — Temperature & Humidity line chart
 *   6. Weather cards — Wind Speed, Dew Point, Pressure
 *   7. Interactive Sensor Map — AQI-colored markers + heat circles
 */

import { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import PollutionCard from '../components/PollutionCard';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ─── Fix Leaflet default icon path issue in Vite/Webpack ────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ─── Create AQI-colored SVG div icon ────────────────────────────────────────
function createAqiIcon(color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <ellipse cx="16" cy="38" rx="5" ry="3" fill="rgba(0,0,0,0.35)"/>
      <path d="M16 2 C8.27 2 2 8.27 2 16 C2 24 16 40 16 40 C16 40 30 24 30 16 C30 8.27 23.73 2 16 2Z"
        fill="${color}" stroke="white" stroke-width="1.5" filter="url(#glow)"/>
      <circle cx="16" cy="16" r="6" fill="white" opacity="0.9"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -44],
  });
}

// ─── Helper: auto-fit map to sensors ────────────────────────────────────────
function MapBoundsFitter({ sensors }) {
  const map = useMap();
  useEffect(() => {
    if (sensors.length > 0) {
      const bounds = L.latLngBounds(sensors.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }
  }, [sensors, map]);
  return null;
}

const API = 'http://localhost:5000';

// ─── AQI Helpers (US EPA PM2.5 breakpoints) ──────────────────────────────────

function pm25ToAqi(pm) {
  if (pm == null || isNaN(pm)) return null;
  const bp = [
    [0, 12, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 500.4, 301, 500],
  ];
  for (const [cLo, cHi, iLo, iHi] of bp) {
    if (pm >= cLo && pm <= cHi)
      return Math.round(((iHi - iLo) / (cHi - cLo)) * (pm - cLo) + iLo);
  }
  return 500;
}

function aqiMeta(aqi) {
  if (aqi == null) return { label: 'Unknown',                 color: '#64748b', emoji: '❓' };
  if (aqi <= 50)   return { label: 'Good',                    color: '#22c55e', emoji: '😊' };
  if (aqi <= 100)  return { label: 'Moderate',                color: '#eab308', emoji: '😐' };
  if (aqi <= 150)  return { label: 'Unhealthy for Sensitive', color: '#f97316', emoji: '😷' };
  if (aqi <= 200)  return { label: 'Unhealthy',               color: '#ef4444', emoji: '🤢' };
  if (aqi <= 300)  return { label: 'Very Unhealthy',          color: '#a855f7', emoji: '☠️' };
  return                  { label: 'Hazardous',               color: '#991b1b', emoji: '💀' };
}

function getHealthRecommendations(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50) return {
    general: "Air quality is satisfactory. Enjoy your normal outdoor activities.",
    action: "Open windows to bring fresh air indoors."
  };
  if (aqi <= 100) return {
    general: "Air quality is acceptable. However, unusually sensitive people should consider reducing prolonged or heavy exertion.",
    action: "Enjoy outdoor activities."
  };
  if (aqi <= 150) return {
    general: "Members of sensitive groups may experience health effects. The general public is not likely to be affected.",
    action: "Sensitive groups should wear a mask outdoors."
  };
  if (aqi <= 200) return {
    general: "Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.",
    action: "Wear a mask outdoors. Run an air purifier indoors."
  };
  if (aqi <= 300) return {
    general: "Health warnings of emergency conditions. The entire population is more likely to be affected.",
    action: "Stay indoors and keep windows closed. Run an air purifier."
  };
  return {
    general: "Health alert: everyone may experience more serious health effects.",
    action: "Avoid all outdoor physical activity. Ensure indoor air is purified."
  };
}

function genericQuality(value) {
  if (value == null) return 'Unknown';
  if (value <= 12)   return 'Good';
  if (value <= 35)   return 'Moderate';
  if (value <= 55)   return 'Unhealthy';
  return 'Hazardous';
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ size = 20, color = '#06b6d4' }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      border: `2px solid ${color}33`,
      borderTop: `2px solid ${color}`,
      borderRadius: '50%',
      animation: 'md-spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

// ─── Weather Card ─────────────────────────────────────────────────────────────

function WeatherCard({ icon, label, value, unit, color }) {
  return (
    <div className="glass-card" style={{
      flex: '1 1 180px',
      textAlign: 'center',
      border: `1px solid ${color}22`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* background glow */}
      <div style={{
        position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)',
        width: '100%', height: '100%',
        background: `radial-gradient(circle, ${color}12 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{
        fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem',
      }}>{label}</div>
      <div style={{
        fontSize: '2.2rem', fontWeight: 800, color,
        lineHeight: 1, filter: value != null ? `drop-shadow(0 0 10px ${color}55)` : 'none',
      }}>
        {value != null ? value : '—'}
      </div>
      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem', fontFamily: 'monospace' }}>
        {unit || '—'}
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MainDashboard() {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  const [loading, setLoading]             = useState(true);
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown]   = useState(false);

  const [location, setLocation]           = useState(null);
  const [allLocations, setAllLocations]   = useState([]);
  const [readings, setReadings]           = useState({});
  const [weeklyRaw, setWeeklyRaw]         = useState([]);
  const [mapSensors, setMapSensors]       = useState([]);
  const [mapLoading, setMapLoading]       = useState(true);
  const [alerts, setAlerts]               = useState([]);
  const [refreshing, setRefreshing]       = useState(false);

  const cfg = useCallback(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      // 1. Measurement type lookup
      const typesRes = await axios.get(`${API}/api/lookup/measurement-types`, cfg());
      const types = typesRes.data;

      const typeMap = {};
      types.forEach(t => { typeMap[t.type_name.toLowerCase()] = t.measurement_type_id; });
      const tid = (kw) => {
        const key = Object.keys(typeMap).find(k => k.includes(kw.toLowerCase()));
        return key ? typeMap[key] : null;
      };

      // 2. Latest reading per pollutant + weather metrics in parallel
      const keywords = ['temperature', 'humidity', 'dew', 'pm2', 'pm10', 'no2', 'co', 'o3', 'so2', 'wind', 'pressure'];
      const readingPromises = keywords.map(async kw => {
        const id = tid(kw);
        if (!id) return { kw, data: null };
        try {
          const res = await axios.get(`${API}/api/readings?measurement_type_id=${id}&limit=1`, cfg());
          return { kw, data: res.data[0] || null };
        } catch {
          return { kw, data: null };
        }
      });

      // 3. 7-day weekly trend
      const weeklyPromise = axios.get(`${API}/api/readings/weekly-trend`, cfg())
        .catch(() => ({ data: [] }));

      // 4. Locations
      const locPromise = axios.get(`${API}/api/sensors/locations`, cfg())
        .catch(() => ({ data: [] }));

      // 5. Recent Alerts
      const alertsPromise = axios.get(`${API}/api/alerts?limit=5`, cfg())
        .catch(() => ({ data: [] }));

      const [readingResults, weeklyRes, locRes, alertsRes] = await Promise.all([
        Promise.all(readingPromises),
        weeklyPromise,
        locPromise,
        alertsPromise,
      ]);

      const rd = {};
      readingResults.forEach(({ kw, data }) => { rd[kw] = data; });
      setReadings(rd);
      setWeeklyRaw(weeklyRes.data || []);
      setAlerts(alertsRes.data || []);

      const locs = locRes.data || [];
      setAllLocations(locs);
      setLocation(locs[0] || null);

    } catch (err) {
      console.error('MainDashboard fetch error:', err);
      if (err.response?.status === 401) navigate('/');
    } finally {
      setLoading(false);
    }
  }, [token, cfg, navigate]);

  useEffect(() => { if (token) fetchAll(); }, [fetchAll, token]);

  // ── Fetch map sensors ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/api/map/sensors`, cfg())
      .then(res => setMapSensors(res.data || []))
      .catch(() => setMapSensors([]))
      .finally(() => setMapLoading(false));
  }, [token, cfg]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    
    // Also re-fetch map sensors
    axios.get(`${API}/api/map/sensors`, cfg())
      .then(res => setMapSensors(res.data || []))
      .catch(() => setMapSensors([]))
      .finally(() => {
        setMapLoading(false);
        setRefreshing(false);
      });
  };

  // ── Search filtering ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    const q = searchQuery.toLowerCase();
    const matches = allLocations.filter(loc =>
      loc.name?.toLowerCase().includes(q) ||
      loc.country?.toLowerCase().includes(q) ||
      loc.region?.toLowerCase().includes(q)
    );
    setSearchResults(matches.slice(0, 8));
    setShowDropdown(matches.length > 0);
  }, [searchQuery, allLocations]);

  const selectLocation = (loc) => {
    setLocation(loc); setSearchQuery(''); setShowDropdown(false);
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const tempVal    = readings['temperature'] ? parseFloat(readings['temperature'].value).toFixed(1) : null;
  const humVal     = readings['humidity']    ? parseFloat(readings['humidity'].value).toFixed(1)    : null;
  const dewVal     = readings['dew']         ? parseFloat(readings['dew'].value).toFixed(1)         : null;
  const pm25Val    = readings['pm2']         ? parseFloat(readings['pm2'].value)                    : null;
  const pm10Val    = readings['pm10']        ? parseFloat(readings['pm10'].value)                   : null;
  const no2Val     = readings['no2']         ? parseFloat(readings['no2'].value)                    : null;
  const coVal      = readings['co']          ? parseFloat(readings['co'].value)                     : null;
  const o3Val      = readings['o3']          ? parseFloat(readings['o3'].value)                     : null;
  const so2Val     = readings['so2']         ? parseFloat(readings['so2'].value)                    : null;
  const windVal    = readings['wind']        ? parseFloat(readings['wind'].value).toFixed(1)        : null;
  const pressVal   = readings['pressure']    ? parseFloat(readings['pressure'].value).toFixed(1)    : null;

  const getUnit = (kw) => readings[kw]?.unit_symbol || readings[kw]?.unit_name || '—';

  const aqiVal = pm25ToAqi(pm25Val);
  const aqi    = aqiMeta(aqiVal);
  const recs   = getHealthRecommendations(aqiVal);

  const locationName = location
    ? `${location.name}${location.region ? ', ' + location.region : ''}`
    : 'Loading…';
  const countryName = location?.country || '';

  // ── 7-day chart data ───────────────────────────────────────────────────────
  const chartData = (() => {
    const days = [...new Set(weeklyRaw.map(r => r.day?.slice(0, 10)))].sort();
    const getLine = (kw) => days.map(day => {
      const row = weeklyRaw.find(r =>
        r.day?.slice(0, 10) === day && r.type_name?.toLowerCase().includes(kw)
      );
      return row ? parseFloat(row.avg_value) : null;
    });

    return {
      labels: days.map(d => {
        const dt = new Date(d + 'T00:00:00');
        return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }),
      datasets: [
        {
          label: 'Temperature',
          data: getLine('temperature'),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249,115,22,0.08)',
          fill: true, tension: 0.4, pointRadius: 5, pointHoverRadius: 8, borderWidth: 2.5,
          pointBackgroundColor: '#f97316',
        },
        {
          label: 'Humidity',
          data: getLine('humidity'),
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6,182,212,0.07)',
          fill: true, tension: 0.4, pointRadius: 5, pointHoverRadius: 8, borderWidth: 2.5,
          pointBackgroundColor: '#06b6d4',
        },
      ],
    };
  })();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 900 },
    plugins: {
      legend: {
        labels: { color: '#94a3b8', font: { size: 12, family: 'Inter' }, boxWidth: 12, boxHeight: 12 },
      },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: {
        ticks: { color: '#64748b', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
      },
      y: {
        ticks: { color: '#64748b', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.06)' },
      },
    },
  };

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem' }}>
        <style>{`@keyframes md-spin { to { transform: rotate(360deg); } }`}</style>
        <Spinner size={36} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Loading AtmoInsight Dashboard…</span>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes md-spin       { to { transform: rotate(360deg); } }
        @keyframes md-fade-up    { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
        @keyframes md-glow-pulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--aqi-glow, rgba(34,197,94,0.4)); }
          50%       { box-shadow: 0 0 0 10px var(--aqi-glow, rgba(34,197,94,0)); }
        }

        .md-page    { min-height: 100vh; background: var(--bg-dark); display: flex; flex-direction: column; }
        .md-content { flex: 1; max-width: 1240px; width: 100%; margin: 0 auto; padding: 2rem 1.5rem 3rem; animation: md-fade-up 0.5s ease both; }

        /* ── Navbar ── */
        .md-navbar {
          position: sticky; top: 0; z-index: 200;
          display: flex; align-items: center; gap: 1rem; padding: 0.85rem 2rem;
          background: rgba(15,23,42,0.9); backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .md-logo      { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; flex-shrink: 0; }
        .md-logo-icon { font-size: 1.5rem; }
        .md-logo-text { font-size: 1.15rem; font-weight: 800; background: linear-gradient(to right, #06b6d4, #8b5cf6); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .md-logo-tag  { font-size: 0.7rem; color: var(--text-muted); font-weight: 500; margin-left: 0.25rem; }

        .md-search-wrap  { flex: 1; position: relative; max-width: 420px; margin: 0 auto; }
        .md-search-input {
          width: 100%; background: rgba(30,41,59,0.7); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px; padding: 0.55rem 1rem 0.55rem 2.4rem;
          color: #e2e8f0; font-size: 0.9rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
        }
        .md-search-input:focus { border-color: #06b6d4; box-shadow: 0 0 0 3px rgba(6,182,212,0.2); }
        .md-search-icon { position: absolute; left: 0.8rem; top: 50%; transform: translateY(-50%); font-size: 0.9rem; color: var(--text-muted); pointer-events: none; }
        .md-dropdown {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0;
          background: rgba(15,23,42,0.97); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; overflow: hidden; z-index: 300; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .md-dropdown-item {
          padding: 0.65rem 1rem; display: flex; align-items: center; gap: 0.5rem;
          cursor: pointer; font-size: 0.88rem; color: #cbd5e1;
          border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s;
        }
        .md-dropdown-item:last-child { border-bottom: none; }
        .md-dropdown-item:hover { background: rgba(6,182,212,0.1); color: #e2e8f0; }

        .md-location-pill {
          display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;
          background: rgba(6,182,212,0.08); border: 1px solid rgba(6,182,212,0.2);
          border-radius: 999px; padding: 0.35rem 0.85rem; font-size: 0.82rem; color: #67e8f9;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;
        }

        /* ── Hero ── */
        .md-hero {
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(6,182,212,0.1) 0%, rgba(139,92,246,0.1) 60%, rgba(15,23,42,0) 100%);
          border: 1px solid rgba(6,182,212,0.15);
          padding: 2.5rem 2.8rem;
          display: flex; flex-wrap: wrap; gap: 2rem; align-items: center;
          justify-content: space-between; margin-bottom: 2rem;
          position: relative; overflow: hidden;
        }
        .md-hero::before {
          content: ''; position: absolute; top: -60px; right: -60px;
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%);
          pointer-events: none;
        }
        .md-hero-location h1   { font-size: 2.4rem; font-weight: 900; margin: 0 0 0.15rem; line-height: 1.1; }
        .md-hero-location .country { font-size: 0.9rem; color: var(--text-muted); }
        .md-hero-location .updated { font-size: 0.78rem; color: #475569; margin-top: 0.4rem; }

        .md-temp-block      { text-align: center; flex: 1 1 160px; }
        .md-temp-value      { font-size: 5.5rem; font-weight: 900; color: #f97316; line-height: 1; filter: drop-shadow(0 0 24px rgba(249,115,22,0.4)); }
        .md-temp-feels      { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.3rem; }
        .md-temp-feels span { color: #67e8f9; font-weight: 700; font-size: 1rem; }

        .md-aqi-block   { text-align: center; }
        .md-aqi-circle  {
          width: 130px; height: 130px; border-radius: 50%;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border: 3px solid var(--aqi-color, #22c55e);
          background: radial-gradient(circle, var(--aqi-bg, rgba(34,197,94,0.12)) 0%, transparent 70%);
          animation: md-glow-pulse 3s ease-in-out infinite; margin: 0 auto;
        }
        .md-aqi-number  { font-size: 2.6rem; font-weight: 900; color: var(--aqi-color, #22c55e); line-height: 1; }
        .md-aqi-unit    { font-size: 0.65rem; color: var(--text-muted); letter-spacing: 0.06em; margin-top: 1px; }
        .md-aqi-label   { margin-top: 0.6rem; font-size: 0.8rem; font-weight: 700; color: var(--aqi-color, #22c55e); }
        .md-aqi-emoji   { font-size: 1rem; margin-top: 0.2rem; }

        /* ── Section title ── */
        .md-section-title {
          font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.1em;
          color: var(--text-muted); font-weight: 600; margin-bottom: 1rem;
          display: flex; align-items: center; gap: 0.5rem;
        }
        .md-section-title::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.06); }

        /* ── Pollution grid ── */
        .md-pollution-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 1rem;
        }

        /* ── Chart section ── */
        .md-chart-card {
          border-radius: 16px;
          background: rgba(30,41,59,0.55);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.07);
          padding: 1.6rem 1.8rem;
          margin-bottom: 2rem;
          transition: box-shadow 0.25s;
        }
        .md-chart-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.2); }
        .md-chart-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 1.4rem; padding-bottom: 0.8rem;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .md-chart-title { font-size: 1rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
        .md-chart-badge {
          font-size: 0.7rem; padding: 0.15rem 0.6rem; border-radius: 4px;
          background: rgba(6,182,212,0.1); color: #67e8f9;
          border: 1px solid rgba(6,182,212,0.2); font-weight: 600;
        }
        .md-no-data {
          color: var(--text-muted); text-align: center; padding: 3rem 1rem; font-size: 0.9rem;
        }

        /* ── Weather cards row ── */
        .md-weather-row { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; }

        /* ── Map Section ── */
        .md-map-section {
          margin-bottom: 2.5rem;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(6,182,212,0.18);
          box-shadow: 0 0 40px rgba(6,182,212,0.06), 0 8px 32px rgba(0,0,0,0.25);
          background: rgba(15,23,42,0.7);
          position: relative;
        }
        .md-map-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.1rem 1.6rem;
          background: rgba(15,23,42,0.9);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          backdrop-filter: blur(10px);
        }
        .md-map-title {
          font-size: 1rem; font-weight: 700;
          display: flex; align-items: center; gap: 0.55rem;
          color: #e2e8f0;
        }
        .md-map-legend {
          display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
        }
        .md-map-legend-item {
          display: flex; align-items: center; gap: 0.3rem;
          font-size: 0.68rem; color: #64748b; font-weight: 500;
        }
        .md-map-legend-dot {
          width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
        }
        .md-map-container {
          height: 480px; width: 100%;
          position: relative;
        }
        .md-map-container .leaflet-container {
          height: 100%; width: 100%;
          background: #0b1120;
        }
        .md-map-footer {
          padding: 0.7rem 1.6rem;
          background: rgba(15,23,42,0.85);
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: center; justify-content: space-between;
          font-size: 0.75rem; color: #475569;
        }
        .md-sensor-popup {
          min-width: 180px;
        }
        .md-sensor-popup .sp-name {
          font-size: 0.9rem; font-weight: 700; color: #1e293b;
          border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px;
        }
        .md-sensor-popup .sp-row {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 0.8rem; color: #475569; margin-bottom: 3px;
        }
        .md-sensor-popup .sp-val {
          font-weight: 700; font-size: 0.88rem;
        }
        .md-sensor-popup .sp-aqi-badge {
          display: inline-block; padding: 2px 8px; border-radius: 20px;
          font-size: 0.75rem; font-weight: 700; margin-top: 5px;
          color: white;
        }

        /* ── Back button ── */
        .md-back-btn {
          position: fixed; bottom: 2rem; right: 2rem; z-index: 100;
          background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.12);
          color: var(--text-muted); border-radius: 999px;
          padding: 0.55rem 1.1rem; font-size: 0.82rem; cursor: pointer;
          backdrop-filter: blur(8px); transition: all 0.2s;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .md-back-btn:hover { border-color: #06b6d4; color: #67e8f9; }

        /* ── Alerts & Health Recs ── */
        .md-health-recs {
          display: flex; gap: 1rem; margin-bottom: 2.5rem; flex-wrap: wrap;
        }
        .md-rec-card {
          flex: 1 1 300px; padding: 1.2rem; border-radius: 12px;
          background: rgba(30,41,59,0.55); border: 1px solid rgba(255,255,255,0.08);
          display: flex; align-items: flex-start; gap: 1rem;
        }
        .md-rec-icon { font-size: 1.8rem; flex-shrink: 0; }
        .md-rec-content h4 { margin: 0 0 0.4rem 0; font-size: 0.95rem; color: #e2e8f0; }
        .md-rec-content p { margin: 0; font-size: 0.85rem; color: #94a3b8; line-height: 1.5; }
        
        .md-alerts-section { display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 2.5rem; }
        .md-alert-card {
          background: rgba(30,41,59,0.55); border-left: 4px solid #f59e0b;
          padding: 1rem 1.4rem; border-radius: 8px 12px 12px 8px;
          display: flex; gap: 1rem; align-items: flex-start;
          backdrop-filter: blur(8px);
        }
        .md-alert-card.critical { border-left-color: #ef4444; }
        .md-alert-card.info { border-left-color: #3b82f6; }
        .md-alert-card.success { border-left-color: #10b981; }
        .md-alert-icon { font-size: 1.4rem; flex-shrink: 0; }
        .md-alert-content h4 { margin: 0 0 0.3rem 0; font-size: 0.95rem; color: #e2e8f0; }
        .md-alert-content p { margin: 0; font-size: 0.85rem; color: #94a3b8; line-height: 1.4; }
        .md-alert-time { font-size: 0.75rem; color: #64748b; margin-top: 0.4rem; }
        
        .md-refresh-btn {
          display: flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.9rem;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 999px; color: #e2e8f0; font-size: 0.8rem; cursor: pointer;
          transition: all 0.2s; white-space: nowrap; flex-shrink: 0;
        }
        .md-refresh-btn:hover:not(:disabled) { background: rgba(255,255,255,0.15); border-color: #06b6d4; }
        .md-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .md-spin-icon { display: inline-block; animation: md-spin 1s linear infinite; }

        /* ── Responsive Media Queries ── */
        @media (max-width: 768px) {
          .md-navbar { flex-wrap: wrap; padding: 0.8rem 1rem; }
          .md-search-wrap { order: 3; max-width: 100%; min-width: 100%; margin-top: 0.6rem; }
          .md-location-pill { max-width: 130px; }
          .md-hero { padding: 1.8rem 1.2rem; flex-direction: column; text-align: center; gap: 1.5rem; }
          .md-hero-location h1 { font-size: 1.8rem; }
          .md-temp-value { font-size: 4rem; }
          .md-aqi-circle { width: 110px; height: 110px; border-width: 2px; }
          .md-aqi-number { font-size: 2.2rem; }
          .md-chart-card { padding: 1.2rem; }
          .md-map-header { flex-direction: column; align-items: flex-start; gap: 0.8rem; }
          .md-map-container { height: 350px; }
          .md-health-recs { flex-direction: column; }
        }
      `}</style>

      <div className="md-page">

        {/* ══════════════════════════════════════════════════
            1. TOP NAVIGATION BAR
        ══════════════════════════════════════════════════ */}
        <nav className="md-navbar">
          <a className="md-logo" href="#" onClick={e => e.preventDefault()}>
            <span className="md-logo-icon">🌐</span>
            <span className="md-logo-text">AtmoInsight</span>
            <span className="md-logo-tag">AQI</span>
          </a>

          <div className="md-search-wrap">
            <span className="md-search-icon">🔍</span>
            <input
              id="md-city-search"
              className="md-search-input"
              type="text"
              placeholder="Search city or location…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
              autoComplete="off"
            />
            {showDropdown && (
              <div className="md-dropdown">
                {searchResults.map((loc, i) => (
                  <div key={loc.location_id || i} className="md-dropdown-item" onMouseDown={() => selectLocation(loc)}>
                    <span>📍</span>
                    <span>
                      <strong>{loc.name}</strong>
                      {loc.region ? `, ${loc.region}` : ''}
                      {loc.country ? ` · ${loc.country}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md-location-pill">
            <span>📡</span>
            <span title={locationName}>{locationName}</span>
          </div>
          
          <button className="md-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
            <span className={refreshing ? 'md-spin-icon' : ''}>🔄</span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </nav>

        {/* ══════════════════════════════════════════════════
            MAIN CONTENT
        ══════════════════════════════════════════════════ */}
        <div className="md-content">

          {/* ── 2. HERO ──────────────────────────────────── */}
          <div
            className="md-hero"
            style={{ '--aqi-color': aqi.color, '--aqi-bg': `${aqi.color}18`, '--aqi-glow': `${aqi.color}44` }}
          >
            <div className="md-hero-location">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>📍 Current Location</span>
              </div>
              <h1 className="text-gradient">{locationName}</h1>
              {countryName && <div className="country">🌍 {countryName}</div>}
              <div className="updated">
                Last updated:{' '}
                {readings['temperature']
                  ? new Date(readings['temperature'].timestamp).toLocaleString()
                  : '—'}
              </div>
            </div>

            <div className="md-temp-block">
              <div className="md-temp-value">{tempVal != null ? `${tempVal}°` : '—'}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.5rem' }}>
                {getUnit('temperature')}
              </div>
              <div className="md-temp-feels">
                Feels Like (Dew Pt) <span>{dewVal != null ? `${dewVal}°` : '—'}</span>
              </div>
            </div>

            <div className="md-aqi-block">
              <div className="md-aqi-circle">
                <div className="md-aqi-number">{aqiVal ?? '—'}</div>
                <div className="md-aqi-unit">AQI (US)</div>
              </div>
              <div className="md-aqi-label">{aqi.label}</div>
              <div className="md-aqi-emoji">{aqi.emoji}</div>
            </div>
          </div>

          {/* ── 3. AQI SCALE BAR ─────────────────────────── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '2rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#475569', marginRight: '0.25rem' }}>AQI Scale →</span>
            {[
              ['Good',         '#22c55e', '0–50'],
              ['Moderate',     '#eab308', '51–100'],
              ['Sensitive',    '#f97316', '101–150'],
              ['Unhealthy',    '#ef4444', '151–200'],
              ['Very Unhealthy','#a855f7','201–300'],
              ['Hazardous',    '#991b1b', '301+'],
            ].map(([lbl, col, range]) => (
              <div key={lbl} style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.55rem', borderRadius: 999,
                background: `${col}18`, border: `1px solid ${col}44`, fontSize: '0.68rem',
                color: aqi.label.includes(lbl.split(' ')[0]) ? '#f8fafc' : '#64748b',
                fontWeight: aqi.label.includes(lbl.split(' ')[0]) ? 700 : 400,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, display: 'inline-block', flexShrink: 0 }} />
                {lbl} <span style={{ color: '#475569' }}>({range})</span>
              </div>
            ))}
          </div>

          {/* ── 3.5 HEALTH RECOMMENDATIONS ────────────────────── */}
          {recs && (
            <>
              <div className="md-section-title">🩺 Health Recommendations</div>
              <div className="md-health-recs">
                <div className="md-rec-card">
                  <div className="md-rec-icon">👥</div>
                  <div className="md-rec-content">
                    <h4>General Public</h4>
                    <p>{recs.general}</p>
                  </div>
                </div>
                <div className="md-rec-card">
                  <div className="md-rec-icon">🛡️</div>
                  <div className="md-rec-content">
                    <h4>Actionable Advice</h4>
                    <p>{recs.action}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── 4. POLLUTION BREAKDOWN ───────────────────── */}
          <div className="md-section-title">🧪 Pollution Breakdown</div>
          <div className="md-pollution-grid" style={{ marginBottom: '2.5rem' }}>
            <PollutionCard icon="🌫️" label="PM2.5" value={pm25Val} unit={getUnit('pm2') !== '—' ? getUnit('pm2') : 'µg/m³'} color="#f97316" quality={genericQuality(pm25Val)} />
            <PollutionCard icon="🟤" label="PM10"  value={pm10Val} unit={getUnit('pm10') !== '—' ? getUnit('pm10') : 'µg/m³'} color="#eab308" quality={genericQuality(pm10Val)} />
            <PollutionCard icon="🟠" label="NO₂"   value={no2Val}  unit={getUnit('no2') !== '—' ? getUnit('no2') : 'µg/m³'}  color="#ef4444" quality={genericQuality(no2Val)} />
            <PollutionCard icon="💨" label="CO"    value={coVal}   unit={getUnit('co') !== '—' ? getUnit('co') : 'mg/m³'}    color="#06b6d4" quality={genericQuality(coVal)} />
            <PollutionCard icon="🔵" label="O₃"    value={o3Val}   unit={getUnit('o3') !== '—' ? getUnit('o3') : 'µg/m³'}    color="#8b5cf6" quality={genericQuality(o3Val)} />
            <PollutionCard icon="🟡" label="SO₂"   value={so2Val}  unit={getUnit('so2') !== '—' ? getUnit('so2') : 'µg/m³'}  color="#10b981" quality={genericQuality(so2Val)} />
          </div>

          {/* ══════════════════════════════════════════════
              5. LAST 7 DAYS — LINE CHART
          ══════════════════════════════════════════════ */}
          <div className="md-section-title">📈 Last 7 Days — Temperature &amp; Humidity Trend</div>
          <div className="md-chart-card">
            <div className="md-chart-header">
              <div className="md-chart-title">
                <span style={{ color: '#f97316' }}>🌡️</span> Temperature &amp;
                <span style={{ color: '#06b6d4', marginLeft: '0.25rem' }}>💧</span> Humidity
                <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.82rem', marginLeft: '0.5rem' }}>Daily Averages</span>
              </div>
              <span className="md-chart-badge">Reading · MeasurementType · DB</span>
            </div>

            {weeklyRaw.length === 0 ? (
              <div className="md-no-data">
                📊 No weekly data yet. Readings will appear once the database has 7+ days of history.
              </div>
            ) : (
              <div style={{ height: 280, position: 'relative' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            )}

            {/* Legend note */}
            <div style={{
              display: 'flex', gap: '1.5rem', marginTop: '1rem',
              paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)',
              fontSize: '0.78rem', color: '#64748b',
            }}>
              {[
                { color: '#f97316', label: 'Temperature', unit: getUnit('temperature') },
                { color: '#06b6d4', label: 'Humidity',    unit: getUnit('humidity') },
              ].map(({ color, label, unit }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: 20, height: 3, background: color, borderRadius: 2 }} />
                  <span>{label}</span>
                  {unit !== '—' && <span style={{ color: '#334155', fontFamily: 'monospace' }}>({unit})</span>}
                </div>
              ))}
              <span style={{ marginLeft: 'auto' }}>Source: <code style={{ color: '#67e8f9', fontSize: '0.75rem' }}>reading + measurement_type</code></span>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              6. WEATHER CARDS — Wind · Dew Point · Pressure
          ══════════════════════════════════════════════ */}
          <div className="md-section-title">🌤️ Current Weather Conditions</div>
          <div className="md-weather-row">
            <WeatherCard
              icon="💨"
              label="Wind Speed"
              value={windVal}
              unit={getUnit('wind') !== '—' ? getUnit('wind') : 'm/s'}
              color="#06b6d4"
            />
            <WeatherCard
              icon="🌡️"
              label="Dew Point"
              value={dewVal != null ? `${dewVal}°` : null}
              unit={getUnit('dew') !== '—' ? getUnit('dew') : '°C'}
              color="#34d399"
            />
            <WeatherCard
              icon="🔵"
              label="Pressure"
              value={pressVal}
              unit={getUnit('pressure') !== '—' ? getUnit('pressure') : 'hPa'}
              color="#818cf8"
            />
            {humVal != null && (
              <WeatherCard
                icon="💧"
                label="Humidity"
                value={`${humVal}%`}
                unit={getUnit('humidity') !== '—' ? getUnit('humidity') : '%'}
                color="#38bdf8"
              />
            )}
          </div>

          {/* ══════════════════════════════════════════════
              7. INTERACTIVE SENSOR MAP
          ══════════════════════════════════════════════ */}
          <div className="md-section-title">🗺️ Live Sensor Map — Air Quality Overview</div>
          <div className="md-map-section">

            {/* Map header */}
            <div className="md-map-header">
              <div className="md-map-title">
                <span style={{ fontSize: '1.2rem' }}>📡</span>
                Sensor Network
                <span style={{
                  fontSize: '0.7rem', padding: '0.15rem 0.55rem', borderRadius: 4,
                  background: 'rgba(6,182,212,0.12)', color: '#67e8f9',
                  border: '1px solid rgba(6,182,212,0.2)', fontWeight: 600,
                }}>LIVE</span>
                {!mapLoading && (
                  <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 400 }}>
                    {mapSensors.length} sensor{mapSensors.length !== 1 ? 's' : ''} online
                  </span>
                )}
              </div>
              <div className="md-map-legend">
                {[
                  ['Good',          '#22c55e'],
                  ['Moderate',      '#eab308'],
                  ['Sensitive',     '#f97316'],
                  ['Unhealthy',     '#ef4444'],
                  ['Very Unhealthy','#a855f7'],
                  ['Hazardous',     '#991b1b'],
                ].map(([lbl, col]) => (
                  <div key={lbl} className="md-map-legend-item">
                    <div className="md-map-legend-dot" style={{ background: col }} />
                    {lbl}
                  </div>
                ))}
              </div>
            </div>

            {/* Map container */}
            <div className="md-map-container">
              {mapLoading ? (
                <div style={{
                  height: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '0.75rem', color: '#64748b',
                  background: '#0b1120',
                }}>
                  <Spinner size={24} color="#06b6d4" />
                  <span style={{ fontSize: '0.9rem' }}>Loading sensor map…</span>
                </div>
              ) : mapSensors.length === 0 ? (
                <div style={{
                  height: '100%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  color: '#475569', background: '#0b1120',
                }}>
                  <span style={{ fontSize: '2rem' }}>🗺️</span>
                  <span style={{ fontSize: '0.9rem' }}>No sensor location data available.</span>
                  <span style={{ fontSize: '0.78rem', color: '#334155' }}>Ensure sensors have PostGIS coordinates in the database.</span>
                </div>
              ) : (
                <MapContainer
                  center={[23.8103, 90.4125]}
                  zoom={6}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={true}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    maxZoom={19}
                  />

                  <MapBoundsFitter sensors={mapSensors} />

                  {mapSensors.map((sensor) => {
                    const raw = parseFloat(sensor.latest_value);
                    const sensorAqi = pm25ToAqi(raw);
                    const meta = aqiMeta(sensorAqi);

                    // Heat circle radius scales with pollution severity
                    const heatRadius = isNaN(raw) ? 3000 : Math.max(2000, Math.min(18000, raw * 180));
                    const heatOpacity = isNaN(raw) ? 0.08 : Math.max(0.05, Math.min(0.25, raw / 400));

                    return (
                      <>
                        {/* Outer glow / heat circle */}
                        <Circle
                          key={`heat-${sensor.sensor_id}`}
                          center={[sensor.lat, sensor.lng]}
                          radius={heatRadius}
                          pathOptions={{
                            color: meta.color,
                            fillColor: meta.color,
                            fillOpacity: heatOpacity,
                            weight: 0,
                          }}
                        />
                        {/* Inner accent ring */}
                        <Circle
                          key={`ring-${sensor.sensor_id}`}
                          center={[sensor.lat, sensor.lng]}
                          radius={heatRadius * 0.3}
                          pathOptions={{
                            color: meta.color,
                            fillColor: meta.color,
                            fillOpacity: heatOpacity * 1.6,
                            weight: 1,
                            dashArray: '4 4',
                          }}
                        />
                        {/* AQI-colored marker */}
                        <Marker
                          key={`marker-${sensor.sensor_id}`}
                          position={[sensor.lat, sensor.lng]}
                          icon={createAqiIcon(meta.color)}
                        >
                          <Popup>
                            <div className="md-sensor-popup">
                              <div className="sp-name">
                                {sensor.sensor_name || `Sensor #${sensor.sensor_id}`}
                              </div>
                              <div className="sp-row">
                                <span>📍 Location</span>
                                <span className="sp-val">{sensor.location_name || '—'}</span>
                              </div>
                              <div className="sp-row">
                                <span>📊 PM2.5</span>
                                <span className="sp-val">{isNaN(raw) ? '—' : `${raw.toFixed(1)} µg/m³`}</span>
                              </div>
                              <div className="sp-row">
                                <span>🌡️ AQI (US)</span>
                                <span className="sp-val" style={{ color: meta.color }}>
                                  {sensorAqi ?? '—'}
                                </span>
                              </div>
                              <div>
                                <span
                                  className="sp-aqi-badge"
                                  style={{ background: meta.color }}
                                >
                                  {meta.emoji} {meta.label}
                                </span>
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      </>
                    );
                  })}
                </MapContainer>
              )}
            </div>

            {/* Map footer */}
            <div className="md-map-footer">
              <span>📡 Source: <code style={{ color: '#67e8f9' }}>/api/map/sensors</code> — sensor × location (PostGIS)</span>
              <span>Click a marker to inspect sensor readings</span>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              8. RECENT ALERTS
          ══════════════════════════════════════════════ */}
          <div className="md-section-title">⚠️ Network Alerts &amp; Incidents</div>
          <div className="md-alerts-section">
            {alerts.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem', background: 'rgba(30,41,59,0.3)', borderRadius: 12 }}>
                ✅ No recent alerts detected across the network.
              </div>
            ) : (
              alerts.slice(0, 4).map((alert) => {
                const isCritical = alert.severity?.toLowerCase() === 'critical' || alert.severity?.toLowerCase() === 'high';
                const isInfo = alert.severity?.toLowerCase() === 'info' || alert.severity?.toLowerCase() === 'low';
                let alertClass = 'md-alert-card';
                if (isCritical) alertClass += ' critical';
                else if (isInfo) alertClass += ' info';

                return (
                  <div key={alert.alert_id} className={alertClass}>
                    <div className="md-alert-icon">{isCritical ? '🚨' : isInfo ? 'ℹ️' : '⚠️'}</div>
                    <div className="md-alert-content">
                      <h4>{alert.severity ? alert.severity.toUpperCase() : 'ALERT'} INCIDENT</h4>
                      <p>{alert.message}</p>
                      <div className="md-alert-time">{new Date(alert.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                );
              })
            )}
            {alerts.length > 4 && (
              <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                <button 
                  onClick={() => {/* could navigate to full alerts page */}} 
                  style={{ background: 'transparent', border: 'none', color: '#06b6d4', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  View All Alerts →
                </button>
              </div>
            )}
          </div>

          {/* ── Info note ─────────────────────────────────── */}
          <div style={{
            marginTop: '0.5rem', padding: '1rem 1.4rem', borderRadius: 12,
            background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.13)',
            fontSize: '0.8rem', color: '#475569',
            display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>ℹ️</span>
            <span>
              AQI is calculated from PM2.5 using US EPA breakpoints. All readings sourced from Neon PostgreSQL via{' '}
              <code style={{ fontFamily: 'monospace', color: '#67e8f9', fontSize: '0.78rem' }}>/api/readings</code> &amp;{' '}
              <code style={{ fontFamily: 'monospace', color: '#67e8f9', fontSize: '0.78rem' }}>/api/readings/weekly-trend</code>{' '}
              — tables: <code style={{ fontFamily: 'monospace', color: '#67e8f9', fontSize: '0.78rem' }}>reading, measurement_type, location, sensor</code>.
            </span>
          </div>

          {/* ── Footer ── */}
          <div style={{ textAlign: 'center', marginTop: '2.5rem', fontSize: '0.75rem', color: '#1e293b' }}>
            AtmoInsight · Air Quality Intelligence · Powered by Neon PostgreSQL
          </div>
        </div>

        <button className="md-back-btn" onClick={() => navigate('/dashboard')}>
          ← Dashboard
        </button>

      </div>
    </>
  );
}
