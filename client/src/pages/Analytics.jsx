import { useState, useMemo, useEffect } from 'react';
import {
  useTimeseries,
  useSensorsGeoJSON,
  usePollutionAverage,
  useSatelliteCorrelation,
  useClimateIndicators,
} from '../api/hooks';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ScatterChart,
  Scatter,
} from 'recharts';
import { formatNumber } from '../utils/format';

const chartTooltip = {
  contentStyle: {
    backgroundColor: '#1C1C1F',
    borderColor: '#2A2A2E',
    borderRadius: 8,
    color: '#E8E8E8',
  },
  labelStyle: { color: '#5A5A5F', marginBottom: 4 },
  itemStyle: { color: '#5AC8FA' },
};

function SectionError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 min-h-[120px]">
      <p className="text-sm" style={{ color: 'rgba(255, 59, 48, 0.7)' }}>
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs px-3 py-1.5 rounded-md border border-border-subtle bg-surface-elevated text-text-secondary hover:text-accent-gold transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function indicatorValueClass(valueStr) {
  if (valueStr == null) return 'text-text-primary';
  const s = String(valueStr);
  if (s.trim().startsWith('+')) return 'text-severity-high';
  if (s.trim().startsWith('-')) return 'text-data-blue';
  return 'text-text-primary';
}

export default function Analytics() {
  const { data: geoData } = useSensorsGeoJSON();

  const sensors = useMemo(() => {
    if (!geoData || !geoData.features) return [];
    const seen = new Set();
    const list = [];
    for (const f of geoData.features) {
      const id = f.properties?.sensor_id;
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      list.push({
        id,
        name: `${f.properties.name} (${f.properties.location_name})`,
        locationId: f.properties.location_id,
        status: f.properties?.status,
      });
    }
    return list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [geoData]);

  const [sensorId, setSensorId] = useState(1);
  const [type, setType] = useState('PM2.5');
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (sensors.length > 0 && !sensors.find(s => String(s.id) === String(sensorId))) {
      setSensorId(sensors[0].id);
    }
  }, [sensors, sensorId]);

  const selectedLocationId = useMemo(() => {
    const s = sensors.find(x => String(x.id) === String(sensorId));
    return s?.locationId ?? null;
  }, [sensors, sensorId]);

  const intervalStr = `${days} days`;

  const {
    data: tsData,
    loading: tsLoading,
    error: tsError,
    refetch: refetchTs,
  } = useTimeseries(sensorId, type, days);
  const {
    data: pollAvg,
    loading: pollLoading,
    error: pollError,
    refetch: refetchPoll,
  } = usePollutionAverage(selectedLocationId, type, intervalStr);
  const {
    correlations,
    loading: satLoading,
    error: satError,
    refetch: refetchSat,
  } = useSatelliteCorrelation();
  const {
    indicators,
    loading: ciLoading,
    error: ciError,
    refetch: refetchCi,
  } = useClimateIndicators();

  const measurements = ['PM2.5', 'Temperature', 'Humidity', 'Water Level', 'Wind Speed'];
  const dayOptions = [7, 30, 90];

  const chartData = useMemo(() => {
    if (!tsData || tsData.length === 0) return [];
    return [...tsData].reverse().map(d => ({
      ...d,
      dateShort: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      avg_value: parseFloat(d.avg_value),
      min_value: parseFloat(d.min_value),
      max_value: parseFloat(d.max_value),
    }));
  }, [tsData]);

  const satelliteNames = useMemo(() => {
    const set = new Set();
    correlations.forEach(c => {
      if (c.satellite_name) set.add(c.satellite_name);
    });
    return [...set];
  }, [correlations]);

  return (
    <div className="h-full flex flex-col overflow-x-hidden">
      <div className="bg-surface-secondary border-b border-border-subtle p-4 flex flex-col sm:flex-row gap-4 flex-wrap items-end shrink-0">
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-text-secondary uppercase">Sensor Location</label>
          <select
            value={sensorId}
            onChange={e => setSensorId(e.target.value)}
            className="bg-surface-primary border border-border-subtle text-text-primary px-3 py-2 rounded-md outline-none focus:border-accent-gold min-w-[200px]"
          >
            {sensors.map(s => (
              <option key={`sensor-${s.id}`} value={s.id}>
                {s.name}
                {s.status && s.status !== 'Active' ? ` — ${s.status}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-text-secondary uppercase">Measurement Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="bg-surface-primary border border-border-subtle text-text-primary px-3 py-2 rounded-md outline-none focus:border-accent-gold min-w-[150px]"
          >
            {measurements.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-text-secondary uppercase">Time Range</label>
          <div className="flex border border-border-subtle bg-surface-primary rounded-md p-1 h-[42px]">
            {dayOptions.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded text-sm transition-colors ${
                  days === d
                    ? 'bg-surface-elevated text-text-primary shadow-sm border border-border-subtle'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section 1 — Time series */}
      <section className="p-4 md:p-6 border-b border-border-subtle space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Time Series Explorer</h2>
        <div className="relative min-h-[320px] w-full max-w-full">
          {tsLoading ? (
            <div className="flex justify-center items-center min-h-[300px]">
              <LoadingSpinner />
            </div>
          ) : tsError ? (
            <SectionError message={tsError} onRetry={refetchTs} />
          ) : chartData.length === 0 ? (
            <EmptyState message="No sensor data available" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5AC8FA" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#5AC8FA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2E" vertical={false} />
                <XAxis
                  dataKey="dateShort"
                  stroke="#5A5A5F"
                  tick={{ fill: '#8A8A8F', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#5A5A5F"
                  tick={{ fill: '#8A8A8F', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                  domain={['auto', 'auto']}
                />
                <Tooltip {...chartTooltip} />
                {type === 'PM2.5' && (
                  <ReferenceLine
                    y={75}
                    stroke="#FFD60A"
                    strokeDasharray="4 4"
                    label={{
                      value: 'WHO 24h guideline',
                      fill: '#FFD60A',
                      fontSize: 11,
                      position: 'insideTopRight',
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="avg_value"
                  stroke="#5AC8FA"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorAvg)"
                  name="Average"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="relative min-h-[100px]">
          {pollLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : pollError ? (
            <SectionError message={pollError} onRetry={refetchPoll} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Average', val: pollAvg?.avg_value, unit: pollAvg?.unit_symbol },
                { label: 'Min', val: pollAvg?.min_value, unit: pollAvg?.unit_symbol },
                { label: 'Max', val: pollAvg?.max_value, unit: pollAvg?.unit_symbol },
                { label: 'Reading count', val: pollAvg?.reading_count, unit: null },
              ].map(row => (
                <div
                  key={row.label}
                  className="bg-surface-secondary border border-border-subtle rounded-lg p-3 flex flex-col gap-1"
                >
                  <span className="text-[10px] uppercase tracking-wider text-text-muted">{row.label}</span>
                  <span className="font-data text-lg text-data-blue">
                    {row.val != null ? formatNumber(row.val) : '—'}
                    {row.unit ? (
                      <span className="text-xs text-text-muted ml-1">{row.unit}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Section 2 — Satellite */}
      <section className="p-4 md:p-6 border-b border-border-subtle space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Satellite AOD vs ground PM2.5
        </h2>
        <div className="relative min-h-[320px] w-full max-w-full">
          {satLoading ? (
            <div className="flex justify-center items-center min-h-[300px]">
              <LoadingSpinner />
            </div>
          ) : satError ? (
            <SectionError message={satError} onRetry={refetchSat} />
          ) : correlations.length === 0 ? (
            <EmptyState message="No satellite correlation data available." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2E" />
                <XAxis
                  type="number"
                  dataKey="aerosol_optical_depth"
                  name="AOD"
                  stroke="#5A5A5F"
                  tick={{ fill: '#8A8A8F', fontSize: 12 }}
                  label={{ value: 'Aerosol Optical Depth', position: 'bottom', fill: '#8A8A8F', fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="ground_pm25"
                  name="PM2.5"
                  stroke="#5A5A5F"
                  tick={{ fill: '#8A8A8F', fontSize: 12 }}
                  label={{
                    value: 'Ground PM2.5 (µg/m³)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#8A8A8F',
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const p = payload[0].payload;
                    return (
                      <div
                        className="rounded-lg border px-3 py-2 text-xs"
                        style={{
                          backgroundColor: '#1C1C1F',
                          borderColor: '#2A2A2E',
                          color: '#E8E8E8',
                        }}
                      >
                        <div className="text-text-secondary mb-1">{p.satellite_name}</div>
                        <div className="font-data text-data-blue">
                          AOD {p.aerosol_optical_depth} · PM2.5 {Number(p.ground_pm25).toFixed(1)}
                        </div>
                        <div className="text-text-muted mt-1">{p.sensor_name}</div>
                        <div className="text-text-muted text-[10px] font-data">
                          {p.satellite_time ? new Date(p.satellite_time).toLocaleString() : ''}
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter
                  name="Observations"
                  data={correlations}
                  fill="#5AC8FA"
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
        {!satLoading && !satError && correlations.length > 0 && (
          <p className="text-xs text-text-muted">
            {correlations.length} correlation point{correlations.length === 1 ? '' : 's'}
            {satelliteNames.length ? ` · Satellites: ${satelliteNames.join(', ')}` : ''}
          </p>
        )}
      </section>

      {/* Section 3 — Climate */}
      <section className="p-4 md:p-6 pb-24 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Climate indicators</h2>
        <div className="relative min-h-[120px]">
          {ciLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : ciError ? (
            <SectionError message={ciError} onRetry={refetchCi} />
          ) : indicators.length === 0 ? (
            <EmptyState message="No climate indicators available" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {indicators.map(ind => (
                <div
                  key={ind.indicator_id}
                  className="bg-surface-secondary border border-border-subtle rounded-lg p-4 flex flex-col gap-2"
                >
                  <span className="text-sm text-text-primary leading-snug">{ind.name}</span>
                  <span className={`font-data text-2xl ${indicatorValueClass(ind.value)}`}>{ind.value}</span>
                  <span className="text-xs text-text-muted">{ind.period}</span>
                  <span className="text-xs text-text-secondary">{ind.measurement_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
