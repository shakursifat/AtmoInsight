import { useState, useMemo } from 'react';
import { useTimeseries, useSensorsGeoJSON } from '../api/hooks';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Analytics() {
  const { data: geoData } = useSensorsGeoJSON();
  
  const sensors = useMemo(() => {
    if (!geoData || !geoData.features) return [];
    return geoData.features.map(f => ({
      id: f.properties.sensor_id,
      name: `${f.properties.name} (${f.properties.location_name})`
    }));
  }, [geoData]);

  const [sensorId, setSensorId] = useState(1); // Default id 1
  const [type, setType] = useState('PM2.5');
  const [days, setDays] = useState(30);

  // Sync initially when sensors load if id 1 isn't correct
  useMemo(() => {
    if (sensors.length > 0 && !sensors.find(s => String(s.id) === String(sensorId))) {
      setSensorId(sensors[0].id);
    }
  }, [sensors]);

  const { data, loading, error } = useTimeseries(sensorId, type, days);

  const measurements = ['PM2.5', 'Temperature', 'Humidity', 'Water Level', 'Wind Speed'];
  const dayOptions = [7, 30, 90];

  // Map to chart format
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].reverse().map(d => ({
      ...d,
      dateShort: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      avg_value: parseFloat(d.avg_value),
      min_value: parseFloat(d.min_value),
      max_value: parseFloat(d.max_value),
    }));
  }, [data]);

  const avgOverPeriod = chartData.length > 0 ? (chartData.reduce((a, b) => a + b.avg_value, 0) / chartData.length).toFixed(1) : 0;
  let minOverPeriod = chartData.length > 0 ? chartData[0].min_value : 0;
  let maxOverPeriod = chartData.length > 0 ? chartData[0].max_value : 0;
  
  chartData.forEach(d => {
    if (d.min_value < minOverPeriod) minOverPeriod = d.min_value;
    if (d.max_value > maxOverPeriod) maxOverPeriod = d.max_value;
  });

  return (
    <div className="h-full flex flex-col">
      {/* Controls Bar */}
      <div className="bg-surface-secondary border-b border-border-subtle p-4 flex flex-col sm:flex-row gap-4 flex-wrap items-end shrink-0">
        
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-semibold text-text-secondary uppercase">Sensor Location</label>
          <select 
            value={sensorId} 
            onChange={e => setSensorId(e.target.value)}
            className="bg-surface-primary border border-border-subtle text-text-primary px-3 py-2 rounded-md outline-none focus:border-accent-gold min-w-[200px]"
          >
            {sensors.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
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
              <option key={m} value={m}>{m}</option>
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

      {/* Chart Area */}
      <div className="flex-1 p-6 relative overflow-hidden flex flex-col gap-6">
        {loading ? <LoadingSpinner /> : error ? <EmptyState message="Failed to load analytics" /> : chartData.length === 0 ? <EmptyState message="No data for this period" /> : (
          <>
            <div className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-data-blue)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-data-blue)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                  <XAxis 
                    dataKey="dateShort" 
                    stroke="var(--color-text-muted)" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="var(--color-text-muted)" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={val => val}
                    domain={['auto', 'auto']}
                    dx={-10}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-surface-secondary)', borderColor: 'var(--color-border-subtle)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
                    itemStyle={{ color: 'var(--color-data-blue)' }}
                    labelStyle={{ color: 'var(--color-text-muted)', marginBottom: '4px' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="avg_value" 
                    stroke="var(--color-data-blue)" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorAvg)" 
                    activeDot={{ r: 6, fill: 'var(--color-surface-primary)', stroke: 'var(--color-data-blue)', strokeWidth: 2 }}
                    name="Average"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Summary Row */}
            <div className="flex flex-wrap gap-4 items-center bg-surface-secondary border border-border-subtle p-4 rounded-lg shrink-0 w-full justify-between sm:justify-start">
              <div className="flex flex-col flex-1 sm:flex-none">
                <span className="text-text-muted text-[11px] uppercase tracking-wider">Period Avg</span>
                <span className="font-data text-xl text-data-blue">{avgOverPeriod}</span>
              </div>
               <div className="flex flex-col flex-1 sm:flex-none sm:pl-6 sm:border-l border-border-subtle">
                <span className="text-text-muted text-[11px] uppercase tracking-wider">Min Measured</span>
                <span className="font-data text-lg text-text-secondary">{minOverPeriod}</span>
              </div>
               <div className="flex flex-col flex-1 sm:flex-none sm:pl-6 sm:border-l border-border-subtle">
                <span className="text-text-muted text-[11px] uppercase tracking-wider">Max Spike</span>
                <span className="font-data text-lg text-severity-critical">{maxOverPeriod}</span>
              </div>
              <div className="flex flex-col flex-1 sm:flex-none sm:pl-6 sm:border-l border-border-subtle">
                <span className="text-text-muted text-[11px] uppercase tracking-wider">Log Entries</span>
                <span className="font-data text-lg text-text-secondary">{chartData.length}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
