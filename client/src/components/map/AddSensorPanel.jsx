import { useState } from 'react';
import { X, MapPin, Cpu, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import client from '../../api/client';
import { useSensorTypes } from '../../api/hooks';

export default function AddSensorPanel({ coordinates, onClose, onSensorCreated }) {
  const { types: sensorTypes, loading: typesLoading } = useSensorTypes();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    sensor_type_id: '',
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
    if (!form.name.trim()) {
      setError('Sensor name is required');
      return;
    }
    if (!form.sensor_type_id) {
      setError('Please select a sensor type');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        sensor_type_id: parseInt(form.sensor_type_id, 10),
        lat: coordinates[1],
        lng: coordinates[0],
        location_name: form.location_name.trim() || form.name.trim(),
        address: form.address.trim(),
        region: form.region.trim(),
        status: form.status,
      };

      await client.post('/api/sensors', payload);
      setSuccess(true);

      // Brief delay so the user sees the success state, then close and refresh
      setTimeout(() => {
        onSensorCreated?.();
        onClose();
      }, 1200);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to create sensor';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const lat = coordinates?.[1]?.toFixed(6) ?? '—';
  const lng = coordinates?.[0]?.toFixed(6) ?? '—';

  return (
    <div className="absolute top-0 right-0 h-full z-30 pointer-events-auto flex flex-col" style={{ width: 'min(380px, 100vw)' }}>
      {/* Backdrop for mobile */}
      <div className="absolute inset-0 -left-[100vw] bg-black/40 animate-fade-in md:hidden" onClick={onClose} />

      {/* Panel */}
      <div className="relative h-full bg-surface-secondary/95 backdrop-blur-xl border-l border-border-subtle shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-gold/15 border border-accent-gold/30 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-accent-gold" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary tracking-tight">Deploy Sensor</h3>
              <span className="text-[10px] text-text-muted uppercase tracking-wider">Admin · New Node</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-elevated text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Coordinates Display */}
        <div className="px-5 pt-4 pb-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-3.5 h-3.5 text-severity-safe" />
            <span className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Selected Location</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-primary rounded-md px-3 py-2 border border-border-subtle">
              <span className="text-[9px] text-text-muted uppercase block mb-0.5">Latitude</span>
              <span className="font-data text-sm text-data-blue font-medium">{lat}</span>
            </div>
            <div className="bg-surface-primary rounded-md px-3 py-2 border border-border-subtle">
              <span className="text-[9px] text-text-muted uppercase block mb-0.5">Longitude</span>
              <span className="font-data text-sm text-data-blue font-medium">{lng}</span>
            </div>
          </div>
        </div>

        {/* Success State */}
        {success && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-5">
            <div className="w-14 h-14 rounded-full bg-severity-safe/15 border border-severity-safe/30 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-severity-safe" />
            </div>
            <span className="text-sm font-semibold text-severity-safe">Sensor Deployed</span>
            <span className="text-xs text-text-muted">New node is now active on the network.</span>
          </div>
        )}

        {/* Form */}
        {!success && (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-auto">
            <div className="px-5 py-4 flex flex-col gap-4 flex-1">
              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-severity-critical/10 border border-severity-critical/30 text-severity-critical text-xs font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Sensor Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">
                  Sensor Name <span className="text-severity-critical">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="AQ-UTT-01"
                  disabled={submitting}
                  className="bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors font-data disabled:opacity-50"
                />
              </div>

              {/* Sensor Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">
                  Sensor Type <span className="text-severity-critical">*</span>
                </label>
                <select
                  name="sensor_type_id"
                  value={form.sensor_type_id}
                  onChange={handleChange}
                  disabled={submitting || typesLoading}
                  className="bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors disabled:opacity-50"
                >
                  <option value="">Select type…</option>
                  {sensorTypes.map(t => (
                    <option key={t.sensor_type_id} value={t.sensor_type_id}>
                      {t.type_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Location Name</label>
                <input
                  type="text"
                  name="location_name"
                  value={form.location_name}
                  onChange={handleChange}
                  placeholder="Uttara Sector 10"
                  disabled={submitting}
                  className="bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors disabled:opacity-50"
                />
              </div>

              {/* Address */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Address</label>
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Road 12, Uttara, Dhaka-1230"
                  disabled={submitting}
                  className="bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors disabled:opacity-50"
                />
              </div>

              {/* Region */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Region</label>
                <input
                  type="text"
                  name="region"
                  value={form.region}
                  onChange={handleChange}
                  placeholder="Dhaka Metropolitan"
                  disabled={submitting}
                  className="bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors disabled:opacity-50"
                />
              </div>

              {/* Status */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Initial Status</label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  disabled={submitting}
                  className="bg-surface-primary border border-border-subtle focus:border-data-blue outline-none rounded-md px-3 py-2 text-text-primary text-sm transition-colors disabled:opacity-50"
                >
                  <option value="Active">Active</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            {/* Submit */}
            <div className="px-5 py-4 border-t border-border-subtle shrink-0 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-md border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-surface-elevated text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 rounded-md bg-accent-gold text-surface-primary hover:bg-accent-gold/90 text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Deploy Sensor'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
