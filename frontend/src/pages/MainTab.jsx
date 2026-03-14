import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
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
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// Fix Leaflet icon path issues in Vite/webpack builds
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({ iconRetinaUrl, iconUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const API = 'http://localhost:5000';

// ---------- AQI helpers (US EPA breakpoints from PM2.5) ----------
function pm25ToAqi(pm) {
  if (pm == null || isNaN(pm)) return null;
  const breakpoints = [
    [0, 12, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 500.4, 301, 500],
  ];
  for (const [cLow, cHigh, iLow, iHigh] of breakpoints) {
    if (pm >= cLow && pm <= cHigh) {
      return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (pm - cLow) + iLow);
    }
  }
  return 500;
}

function aqiCategory(aqi) {
  if (aqi == null) return { label: 'Unknown', color: '#64748b', bg: 'rgba(100,116,139,0.15)' };
  if (aqi <= 50)  return { label: 'Good',           color: '#22c55e', bg: 'rgba(34,197,94,0.12)' };
  if (aqi <= 100) return { label: 'Moderate',        color: '#eab308', bg: 'rgba(234,179,8,0.12)' };
  if (aqi <= 150) return { label: 'Unhealthy for Sensitive Groups', color: '#f97316', bg: 'rgba(249,115,22,0.12)' };
  if (aqi <= 200) return { label: 'Unhealthy',       color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
  if (aqi <= 300) return { label: 'Very Unhealthy',  color: '#a855f7', bg: 'rgba(168,85,247,0.12)' };
  return           { label: 'Hazardous',             color: '#7f1d1d', bg: 'rgba(127,29,29,0.2)' };
}

// ---------- tiny spinner ----------
function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 18, height: 18, border: '2px solid rgba(6,182,212,0.3)',
      borderTop: '2px solid #06b6d4', borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  );
}

// ---------- Section header ----------
function SectionHeading({ icon, title, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem', paddingBottom: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{title}</h2>
      {badge && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(6,182,212,0.12)', color: '#67e8f9', border: '1px solid rgba(6,182,212,0.2)', fontWeight: 600 }}>{badge}</span>}
    </div>
  );
}

// ============================================================
export default function MainTab() {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // lookup data
  const [measureTypes, setMeasureTypes] = useState([]);

  // current readings (latest single value per type)
  const [currentReadings, setCurrentReadings] = useState({});  // keyed by type_name.toLowerCase()

  // 7-day trend
  const [weeklyRaw, setWeeklyRaw] = useState([]);

  // locations & sensors
  const [location, setLocation]   = useState(null);
  const [mapSensors, setMapSensors] = useState([]);

  const config = useCallback(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const fetchAll = useCallback(async () => {
    try {
      // 1️⃣ Lookup measurement types first (drives all subsequent fetches)
      const typesRes = await axios.get(`${API}/api/lookup/measurement-types`, config());
      const types = typesRes.data;
      setMeasureTypes(types);

      // Build a name→id map (case-insensitive partial match)
      const typeMap = {};
      types.forEach(t => { typeMap[t.type_name.toLowerCase()] = t.measurement_type_id; });

      // Helper: find type id by keyword
      const tid = (keyword) => {
        const key = Object.keys(typeMap).find(k => k.includes(keyword.toLowerCase()));
        return key ? typeMap[key] : null;
      };

      // 2️⃣ Fetch latest reading per measurement type in parallel
      const typeKeywords = ['temperature', 'humidity', 'pm2', 'wind', 'dew', 'pressure'];
      const promises = typeKeywords.map(async kw => {
        const id = tid(kw);
        if (!id) return { kw, data: null };
        try {
          const res = await axios.get(`${API}/api/readings?measurement_type_id=${id}&limit=1`, config());
          return { kw, data: res.data[0] || null };
        } catch { return { kw, data: null }; }
      });

      // 3️⃣ Weekly trend
      const weeklyPromise = axios.get(`${API}/api/readings/weekly-trend`, config()).catch(() => ({ data: [] }));

      // 4️⃣ Locations
      const locPromise = axios.get(`${API}/api/sensors/locations`, config()).catch(() => ({ data: [] }));

      // 5️⃣ Map sensors
      const mapPromise = axios.get(`${API}/api/map/sensors`, config()).catch(() => ({ data: [] }));

      const [readingResults, weeklyRes, locRes, mapRes] = await Promise.all([
        Promise.all(promises),
        weeklyPromise,
        locPromise,
        mapPromise,
      ]);

      // Build current readings map
      const cr = {};
      readingResults.forEach(({ kw, data }) => { cr[kw] = data; });
      setCurrentReadings(cr);
      setWeeklyRaw(weeklyRes.data);
      setLocation(locRes.data[0] || null);
      setMapSensors(mapRes.data.filter(s => s.lat && s.lng));

    } catch (err) {
      console.error('MainTab fetch error:', err);
      if (err.response?.status === 401) navigate('/');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, config, navigate]);

  useEffect(() => { if (token) fetchAll(); }, [fetchAll, token]);

  const handleRefresh = () => { setRefreshing(true); fetchAll(); };

  // ——— Derived values ———
  const tempReading  = currentReadings['temperature'];
  const humReading   = currentReadings['humidity'];
  const pm25Reading  = currentReadings['pm2'];
  const windReading  = currentReadings['wind'];
  const dewReading   = currentReadings['dew'];
  const pressReading = currentReadings['pressure'];

  const tempVal  = tempReading  ? parseFloat(tempReading.value).toFixed(1)  : null;
  const humVal   = humReading   ? parseFloat(humReading.value).toFixed(1)   : null;
  const pm25Val  = pm25Reading  ? parseFloat(pm25Reading.value)             : null;
  const windVal  = windReading  ? parseFloat(windReading.value).toFixed(1)  : null;
  const dewVal   = dewReading   ? parseFloat(dewReading.value).toFixed(1)   : null;
  const pressVal = pressReading ? parseFloat(pressReading.value).toFixed(1) : null;

  // AQI
  const aqiVal  = pm25ToAqi(pm25Val);
  const aqiCat  = aqiCategory(aqiVal);

  // 7-day chart data
  const chartData = (() => {
    // Group raw rows by date, build trend for Temperature + Humidity
    const days = [...new Set(weeklyRaw.map(r => r.day?.slice(0, 10)))].sort();
    const getLine = (keyword) => {
      return days.map(day => {
        const row = weeklyRaw.find(r =>
          r.day?.slice(0, 10) === day &&
          r.type_name?.toLowerCase().includes(keyword)
        );
        return row ? parseFloat(row.avg_value) : null;
      });
    };

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
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 2.5,
        },
        {
          label: 'Humidity',
          data: getLine('humidity'),
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6,182,212,0.06)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 2.5,
        },
      ],
    };
  })();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 800 },
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { size: 12 } } },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
    },
  };

  // Map defaults
  const mapCenter = mapSensors.length > 0
    ? [mapSensors[0].lat, mapSensors[0].lng]
    : [23.8103, 90.4125];

  // ——— Loading screen ———
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <Spinner />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Loading AtmoInsight Weather Dashboard…</span>
      </div>
    );
  }

  return (
    <>
      {/* ── Inline keyframe for spinner ── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes radarPulse {
          0%   { transform: scale(1);   opacity: 0.55; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .mt-card {
          background: rgba(30,41,59,0.55);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          padding: 1.4rem 1.6rem;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .mt-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 28px rgba(0,0,0,0.25);
          border-color: rgba(6,182,212,0.2);
        }
      `}</style>

      <div className="animate-fade-in" style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>

        {/* ═══════════════════════════════════════════════════════
            SECTION 1 — HERO: Location + Current Temperature
        ════════════════════════════════════════════════════════ */}
        <div className="mt-card" style={{
          marginBottom: '2rem',
          background: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(139,92,246,0.1))',
          border: '1px solid rgba(6,182,212,0.18)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1.5rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2rem 2.4rem',
        }}>
          {/* Left — location info */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '1.1rem' }}>📍</span>
              <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>
                {location ? `${location.name}${location.region ? ' · ' + location.region : ''}` : 'Loading location…'}
              </span>
            </div>
            <h1 className="text-gradient" style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0, lineHeight: 1.1 }}>
              AtmoInsight Live Weather
            </h1>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              {tempReading ? new Date(tempReading.timestamp).toLocaleString() : '—'}
            </div>
          </div>

          {/* Center — big temperature */}
          <div style={{ textAlign: 'center', flex: '1 1 180px' }}>
            <div style={{ fontSize: '5rem', fontWeight: 900, lineHeight: 1, color: '#f97316', filter: 'drop-shadow(0 0 20px rgba(249,115,22,0.4))' }}>
              {tempVal != null ? `${tempVal}°` : '—'}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              {tempReading?.unit_symbol || tempReading?.unit_name || 'Temperature'}
            </div>
          </div>

          {/* Right — feels like / meta + refresh */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1rem' }}>
            <div className="mt-card" style={{ padding: '0.9rem 1.4rem', textAlign: 'center', minWidth: 130 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feels Like (Dew Pt)</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#67e8f9' }}>
                {dewVal != null ? `${dewVal}°` : '—'}
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', fontSize: '0.88rem' }}
            >
              {refreshing ? <Spinner /> : '🔄'} Refresh
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 2 — 7-Day Temperature & Humidity Trend
        ════════════════════════════════════════════════════════ */}
        <div className="mt-card" style={{ marginBottom: '2rem' }}>
          <SectionHeading icon="📈" title="Last 7 Days — Temperature & Humidity Trend" badge="Daily Averages · DB" />
          {weeklyRaw.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
              No weekly data available yet. Readings will appear here once the DB has 7+ days of data.
            </div>
          ) : (
            <div style={{ height: 260 }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 3 — AQI Index
        ════════════════════════════════════════════════════════ */}
        <div className="mt-card" style={{ marginBottom: '2rem', background: aqiCat.bg, border: `1px solid ${aqiCat.color}33` }}>
          <SectionHeading icon="🌫️" title="Air Quality Index (AQI)" badge="PM2.5 → US EPA" />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2rem' }}>
            {/* Big AQI number */}
            <div style={{ textAlign: 'center', minWidth: 120 }}>
              <div style={{
                fontSize: '4.5rem', fontWeight: 900, color: aqiCat.color,
                filter: `drop-shadow(0 0 16px ${aqiCat.color}66)`,
                lineHeight: 1,
              }}>
                {aqiVal ?? '—'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>AQI Value</div>
            </div>

            <div style={{ flex: 1 }}>
              {/* Category badge */}
              <div style={{
                display: 'inline-block', padding: '0.35rem 1rem', borderRadius: 999,
                background: `${aqiCat.color}22`, border: `1.5px solid ${aqiCat.color}`,
                color: aqiCat.color, fontWeight: 700, fontSize: '1rem', marginBottom: '0.6rem',
              }}>
                {aqiCat.label}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                {pm25Val != null ? `Raw PM2.5: ${pm25Val.toFixed(1)} µg/m³` : 'No PM2.5 reading available.'}
              </div>
              {pm25Reading && (
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Sensor {pm25Reading.sensor_id} · {new Date(pm25Reading.timestamp).toLocaleString()}
                </div>
              )}
            </div>

            {/* AQI Scale bar */}
            <div style={{ minWidth: 220 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Scale</div>
              {[
                ['Good', '#22c55e'],
                ['Moderate', '#eab308'],
                ['Unhealthy (Sensitive)', '#f97316'],
                ['Unhealthy', '#ef4444'],
                ['Very Unhealthy', '#a855f7'],
                ['Hazardous', '#7f1d1d'],
              ].map(([lbl, col]) => (
                <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: col, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.75rem', color: aqiCat.label === lbl ? '#f8fafc' : '#64748b', fontWeight: aqiCat.label === lbl ? 700 : 400 }}>{lbl}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 4 — Weather Cards: Wind, Dew Point, Pressure
        ════════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.2rem', marginBottom: '2rem' }}>
          {[
            { icon: '💨', label: 'Wind Speed', value: windVal, unit: windReading?.unit_symbol || windReading?.unit_name || 'm/s', color: '#06b6d4' },
            { icon: '🌡️', label: 'Dew Point',  value: dewVal,  unit: dewReading?.unit_symbol  || dewReading?.unit_name  || '°C',  color: '#34d399' },
            { icon: '🔵', label: 'Pressure',   value: pressVal, unit: pressReading?.unit_symbol || pressReading?.unit_name || 'hPa', color: '#818cf8' },
          ].map(({ icon, label, value, unit, color }) => (
            <div key={label} className="mt-card" style={{ textAlign: 'center', border: `1px solid ${color}22` }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>{icon}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>{label}</div>
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color, lineHeight: 1 }}>
                {value ?? '—'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.3rem' }}>{unit}</div>
            </div>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════
            SECTION 5 — Interactive Radar Map
        ════════════════════════════════════════════════════════ */}
        <div className="mt-card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header bar above map */}
          <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🗺️</span>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Sensor Radar Map</h2>
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)', fontWeight: 600 }}>
              {mapSensors.length} Active Sensors
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Click markers for latest reading</span>
          </div>

          {mapSensors.length === 0 ? (
            <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No sensors with GPS coordinates found.
            </div>
          ) : (
            <div style={{ height: 480, width: '100%' }}>
              <MapContainer center={mapCenter} zoom={7} style={{ height: '100%', width: '100%' }}>
                {/* Dark radar-style tile layer (CartoDB Dark Matter) */}
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
                />

                {mapSensors.map((sensor) => {
                  const val = parseFloat(sensor.latest_value);
                  const isHigh = val > 80;
                  // Radar pulse: circle radius scales with sensor reading value
                  const pulseRadius = isNaN(val) ? 5000 : Math.max(3000, Math.min(val * 400, 25000));
                  const pulseColor  = isHigh ? '#ef4444' : '#06b6d4';

                  return (
                    <span key={sensor.sensor_id}>
                      {/* Radar "precipitation" overlay circle */}
                      <Circle
                        center={[sensor.lat, sensor.lng]}
                        radius={pulseRadius}
                        pathOptions={{
                          color: pulseColor,
                          fillColor: pulseColor,
                          fillOpacity: 0.06,
                          weight: 1.2,
                          opacity: 0.3,
                        }}
                      />
                      {/* Smaller inner glow circle */}
                      <Circle
                        center={[sensor.lat, sensor.lng]}
                        radius={pulseRadius * 0.4}
                        pathOptions={{
                          color: pulseColor,
                          fillColor: pulseColor,
                          fillOpacity: 0.12,
                          weight: 0,
                          opacity: 0,
                        }}
                      />
                      {/* Sensor marker */}
                      <Marker position={[sensor.lat, sensor.lng]}>
                        <Popup>
                          <div style={{ minWidth: 180 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: 4, marginBottom: 6 }}>
                              📡 {sensor.sensor_name || `Sensor #${sensor.sensor_id}`}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 4 }}>
                              📍 {sensor.location_name || '—'}
                            </div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: isHigh ? '#ef4444' : '#10b981' }}>
                              {isNaN(val) ? '—' : val.toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Latest reading</div>
                            {isHigh && (
                              <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#ef4444', fontWeight: 600 }}>
                                ⚠️ Above threshold (80)
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    </span>
                  );
                })}
              </MapContainer>
            </div>
          )}
        </div>

        {/* Footer note */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.78rem', color: '#334155' }}>
          AtmoInsight · Data sourced from Neon PostgreSQL · Reading, MeasurementType, Location, Sensor tables
        </div>
      </div>
    </>
  );
}
