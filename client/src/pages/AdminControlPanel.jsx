import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Radar,
  MapPin,
  Cpu,
  FileText,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Navigation,
  X,
  ChevronRight,
  Activity,
  Clock,
  Layers,
  BarChart3,
} from 'lucide-react';
import client from '../api/client';
import { useSensorTypes } from '../api/hooks';

// ─── Nearby Sensors Panel ────────────────────────────────────────────────────

function NearbySensorsPanel() {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('10000');
  const [measurement, setMeasurement] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sensors, setSensors] = useState(null);
  const [locating, setLocating] = useState(false);

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError('Could not obtain location. Enter coordinates manually.');
        setLocating(false);
      }
    );
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!lat || !lng) {
      setError('Latitude and Longitude are required.');
      return;
    }
    setLoading(true);
    setError('');
    setSensors(null);
    try {
      const params = { lat, lng, radius };
      if (measurement.trim()) params.measurement = measurement.trim();
      const res = await client.get('/api/sensors/nearby', { params });
      setSensors(res.data.sensors || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (s) => {
    if (s === 'Active') return 'text-severity-safe';
    if (s === 'Maintenance') return 'text-severity-moderate';
    return 'text-text-muted';
  };

  const statusDot = (s) => {
    if (s === 'Active') return 'bg-severity-safe';
    if (s === 'Maintenance') return 'bg-severity-moderate';
    return 'bg-text-muted';
  };

  return (
    <div className="bg-surface-secondary border border-border-subtle rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-data-blue/15 border border-data-blue/30 flex items-center justify-center shrink-0">
          <Radar className="w-5 h-5 text-data-blue" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-primary">Nearby Sensors</h2>
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Geospatial lookup via stored procedure</span>
        </div>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="px-5 pt-4 pb-3 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Latitude <span className="text-severity-critical">*</span></label>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={e => { setLat(e.target.value); setError(''); }}
              placeholder="23.710000"
              className="bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors font-data"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Longitude <span className="text-severity-critical">*</span></label>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={e => { setLng(e.target.value); setError(''); }}
              placeholder="90.407400"
              className="bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors font-data"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Radius (metres)</label>
            <select
              value={radius}
              onChange={e => setRadius(e.target.value)}
              className="bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors"
            >
              <option value="1000">1 km</option>
              <option value="5000">5 km</option>
              <option value="10000">10 km</option>
              <option value="25000">25 km</option>
              <option value="50000">50 km</option>
              <option value="100000">100 km</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Measurement Filter</label>
            <input
              type="text"
              value={measurement}
              onChange={e => setMeasurement(e.target.value)}
              placeholder="PM2.5, Temperature… (optional)"
              className="bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-severity-critical/10 border border-severity-critical/30 text-severity-critical text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={locating}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-surface-elevated text-xs font-medium transition-colors disabled:opacity-50"
          >
            {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
            Use My Location
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-data-blue text-surface-primary hover:bg-data-blue/90 text-xs font-bold transition-colors flex-1 justify-center disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {loading ? 'Searching…' : 'Find Nearby Sensors'}
          </button>
        </div>
      </form>

      {/* Results */}
      {sensors !== null && (
        <div className="border-t border-border-subtle px-5 py-3 flex flex-col gap-2 max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">
              Results
            </span>
            <span className="font-data text-xs text-data-blue font-semibold">{sensors.length} sensor{sensors.length !== 1 ? 's' : ''} found</span>
          </div>
          {sensors.length === 0 ? (
            <div className="text-center py-6 text-text-muted text-sm">No sensors within range.</div>
          ) : (
            sensors.map((s) => (
              <div
                key={s.sensor_id}
                className="bg-surface-primary rounded-lg border border-border-subtle px-3 py-2.5 flex items-start gap-3 group hover:border-data-blue/40 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDot(s.status)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 justify-between">
                    <span className="text-sm font-semibold text-text-primary truncate">{s.name}</span>
                    <span className={`text-[10px] font-data font-medium shrink-0 ${statusColor(s.status)}`}>{s.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="text-[10px] text-text-muted flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" />{s.location_name}
                    </span>
                    <span className="text-[10px] text-text-muted flex items-center gap-1">
                      <Layers className="w-2.5 h-2.5" />{s.type_name}
                    </span>
                    <span className="text-[10px] text-data-blue font-data font-medium flex items-center gap-1">
                      <Navigation className="w-2.5 h-2.5" />{(s.distance_metres / 1000).toFixed(2)} km
                    </span>
                  </div>
                  {s.latest_value != null && (
                    <div className="mt-1 flex items-center gap-1">
                      <Activity className="w-2.5 h-2.5 text-severity-safe" />
                      <span className="font-data text-xs text-severity-safe font-semibold">
                        {s.latest_value} {s.latest_unit}
                      </span>
                      {s.latest_timestamp && (
                        <span className="text-[9px] text-text-muted ml-1 flex items-center gap-0.5">
                          <Clock className="w-2 h-2" />
                          {new Date(s.latest_timestamp).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Sensor Panel ─────────────────────────────────────────────────────────

function AddSensorPanel() {
  const { types: sensorTypes, loading: typesLoading } = useSensorTypes();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    sensor_type_id: '',
    lat: '',
    lng: '',
    location_name: '',
    address: '',
    region: '',
    status: 'Active',
  });

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Sensor name is required'); return; }
    if (!form.sensor_type_id) { setError('Please select a sensor type'); return; }
    if (!form.lat || !form.lng) { setError('Latitude and Longitude are required'); return; }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        sensor_type_id: parseInt(form.sensor_type_id, 10),
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        location_name: form.location_name.trim() || form.name.trim(),
        address: form.address.trim(),
        region: form.region.trim(),
        status: form.status,
      };
      await client.post('/api/sensors', payload);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create sensor');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSuccess(false);
    setError('');
    setForm({ name: '', sensor_type_id: '', lat: '', lng: '', location_name: '', address: '', region: '', status: 'Active' });
  };

  return (
    <div className="bg-surface-secondary border border-border-subtle rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent-gold/15 border border-accent-gold/30 flex items-center justify-center shrink-0">
          <Cpu className="w-5 h-5 text-accent-gold" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-primary">Deploy New Sensor</h2>
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Add a node to the monitoring network</span>
        </div>
      </div>

      {/* Success */}
      {success && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5 py-10">
          <div className="w-16 h-16 rounded-full bg-severity-safe/15 border border-severity-safe/30 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-severity-safe" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-severity-safe">Sensor Deployed!</p>
            <p className="text-xs text-text-muted mt-1">The new node is now active on the network.</p>
          </div>
          <button
            onClick={handleReset}
            className="mt-2 px-4 py-2 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-surface-elevated text-xs font-medium transition-colors"
          >
            Deploy Another
          </button>
        </div>
      )}

      {/* Form */}
      {!success && (
        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-severity-critical/10 border border-severity-critical/30 text-severity-critical text-xs font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">
                Sensor Name <span className="text-severity-critical">*</span>
              </label>
              <input type="text" name="name" value={form.name} onChange={handleChange}
                placeholder="AQ-UTT-01" disabled={submitting}
                className="bg-surface-primary border border-border-subtle focus:border-accent-gold outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors font-data disabled:opacity-50" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">
                Sensor Type <span className="text-severity-critical">*</span>
              </label>
              <select name="sensor_type_id" value={form.sensor_type_id} onChange={handleChange}
                disabled={submitting || typesLoading}
                className="bg-surface-primary border border-border-subtle focus:border-accent-gold outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors disabled:opacity-50">
                <option value="">Select type…</option>
                {sensorTypes.map(t => (
                  <option key={t.sensor_type_id} value={t.sensor_type_id}>{t.type_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">
                Latitude <span className="text-severity-critical">*</span>
              </label>
              <input type="number" step="any" name="lat" value={form.lat} onChange={handleChange}
                placeholder="23.710000" disabled={submitting}
                className="bg-surface-primary border border-border-subtle focus:border-accent-gold outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors font-data disabled:opacity-50" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">
                Longitude <span className="text-severity-critical">*</span>
              </label>
              <input type="number" step="any" name="lng" value={form.lng} onChange={handleChange}
                placeholder="90.407400" disabled={submitting}
                className="bg-surface-primary border border-border-subtle focus:border-accent-gold outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors font-data disabled:opacity-50" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Location Name</label>
            <input type="text" name="location_name" value={form.location_name} onChange={handleChange}
              placeholder="Uttara Sector 10" disabled={submitting}
              className="bg-surface-primary border border-border-subtle focus:border-accent-gold outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors disabled:opacity-50" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Address</label>
              <input type="text" name="address" value={form.address} onChange={handleChange}
                placeholder="Road 12, Uttara, Dhaka-1230" disabled={submitting}
                className="bg-surface-primary border border-border-subtle focus:border-accent-gold outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors disabled:opacity-50" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Region</label>
              <input type="text" name="region" value={form.region} onChange={handleChange}
                placeholder="Dhaka Metropolitan" disabled={submitting}
                className="bg-surface-primary border border-border-subtle focus:border-accent-gold outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors disabled:opacity-50" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Initial Status</label>
            <select name="status" value={form.status} onChange={handleChange} disabled={submitting}
              className="bg-surface-primary border border-border-subtle focus:border-accent-gold outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors disabled:opacity-50">
              <option value="Active">Active</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <button type="submit" disabled={submitting}
            className="w-full py-2.5 rounded-md bg-accent-gold text-surface-primary hover:bg-accent-gold/90 text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mt-1">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
            {submitting ? 'Deploying…' : 'Deploy Sensor'}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Reports Nav Card ─────────────────────────────────────────────────────────

function ReportsNavCard({ onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className="bg-surface-secondary border border-border-subtle rounded-xl px-5 py-5 flex items-center gap-4 cursor-pointer hover:border-severity-moderate/50 hover:bg-surface-elevated group transition-all duration-200"
    >
      <div className="w-12 h-12 rounded-xl bg-severity-moderate/15 border border-severity-moderate/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
        <FileText className="w-6 h-6 text-severity-moderate" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-text-primary">Reports Management</h3>
        <p className="text-xs text-text-muted mt-0.5">Review, approve, and manage citizen-submitted environmental incident reports.</p>
      </div>
      <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-severity-moderate group-hover:translate-x-0.5 transition-all" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminControlPanel() {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto bg-surface-primary">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

        {/* Page header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent-gold/15 border border-accent-gold/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-accent-gold" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Admin Control Panel</h1>
            <p className="text-sm text-text-muted mt-0.5">Sensor network management and administrative operations.</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-gold/10 border border-accent-gold/25">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-gold animate-pulse" />
            <span className="text-[10px] font-semibold text-accent-gold uppercase tracking-wider">Admin</span>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active Tools', value: '3', icon: BarChart3, color: 'text-data-blue' },
            { label: 'Procedures', value: '1', icon: Activity, color: 'text-severity-safe' },
            { label: 'Access Level', value: 'Root', icon: ShieldCheck, color: 'text-accent-gold' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-surface-secondary border border-border-subtle rounded-lg px-4 py-3 flex items-center gap-3">
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <div>
                <div className={`font-data text-base font-bold ${color}`}>{value}</div>
                <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Reports nav card */}
        <ReportsNavCard onClick={() => navigate('/reports')} />

        {/* Two-column grid for the two main tools */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <NearbySensorsPanel />
          <AddSensorPanel />
        </div>

      </div>
    </div>
  );
}
