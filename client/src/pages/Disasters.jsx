import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDisasters, useDisasterSummary, useForecasts } from '../api/hooks';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import EmptyState from '../components/shared/EmptyState';
import SeverityBadge from '../components/shared/SeverityBadge';
import { formatCurrency, formatNumber, formatPercent } from '../utils/format';

const SUBGROUP_TABS = ['All', 'Meteorological', 'Climatological', 'Geophysical', 'Hydrological'];

// Meteorological sub-type classification →  what type of event is it?
const METEO_TYPE_CONFIG = {
  cyclone:   { label: 'Cyclone',      icon: '🌀', color: 'text-severity-critical', bg: 'bg-severity-critical/10 border-severity-critical/30' },
  typhoon:   { label: 'Typhoon',      icon: '🌀', color: 'text-severity-critical', bg: 'bg-severity-critical/10 border-severity-critical/30' },
  hurricane: { label: 'Hurricane',    icon: '🌀', color: 'text-severity-critical', bg: 'bg-severity-critical/10 border-severity-critical/30' },
  tornado:   { label: 'Tornado',      icon: '🌪️', color: 'text-severity-high',     bg: 'bg-severity-high/10 border-severity-high/30' },
  storm:     { label: 'Severe Storm', icon: '⛈️', color: 'text-severity-high',     bg: 'bg-severity-high/10 border-severity-high/30' },
  thunderstorm: { label: 'Thunderstorm', icon: '⛈️', color: 'text-severity-moderate', bg: 'bg-severity-moderate/10 border-severity-moderate/30' },
  hail:      { label: 'Hailstorm',    icon: '🌨️', color: 'text-severity-moderate', bg: 'bg-severity-moderate/10 border-severity-moderate/30' },
  dust:      { label: 'Dust Storm',   icon: '🌫️', color: 'text-severity-moderate', bg: 'bg-severity-moderate/10 border-severity-moderate/30' },
  fog:       { label: 'Dense Fog',    icon: '🌫️', color: 'text-text-secondary',    bg: 'bg-surface-elevated border-border-subtle' },
  wind:      { label: 'High Winds',   icon: '💨', color: 'text-data-blue',          bg: 'bg-data-blue/10 border-data-blue/30' },
  snow:      { label: 'Snowstorm',    icon: '❄️', color: 'text-data-blue',          bg: 'bg-data-blue/10 border-data-blue/30' },
  blizzard:  { label: 'Blizzard',     icon: '❄️', color: 'text-data-blue',          bg: 'bg-data-blue/10 border-data-blue/30' },
};

// Hydrological sub-types
const HYDRO_TYPE_CONFIG = {
  flood:     { label: 'Flood',        icon: '🌊', color: 'text-data-blue',          bg: 'bg-data-blue/10 border-data-blue/30' },
  landslide: { label: 'Landslide',    icon: '⛰️', color: 'text-severity-high',      bg: 'bg-severity-high/10 border-severity-high/30' },
  mudslide:  { label: 'Mudslide',     icon: '⛰️', color: 'text-severity-high',      bg: 'bg-severity-high/10 border-severity-high/30' },
  tsunami:   { label: 'Tsunami',      icon: '🌊', color: 'text-severity-critical',  bg: 'bg-severity-critical/10 border-severity-critical/30' },
  surge:     { label: 'Storm Surge',  icon: '🌊', color: 'text-severity-high',      bg: 'bg-severity-high/10 border-severity-high/30' },
  drought:   { label: 'Drought',      icon: '☀️', color: 'text-severity-moderate',  bg: 'bg-severity-moderate/10 border-severity-moderate/30' },
};

// Geophysical sub-types
const GEO_TYPE_CONFIG = {
  earthquake: { label: 'Earthquake', icon: '🏔️', color: 'text-severity-critical',  bg: 'bg-severity-critical/10 border-severity-critical/30' },
  volcano:    { label: 'Volcanic Eruption', icon: '🌋', color: 'text-severity-critical', bg: 'bg-severity-critical/10 border-severity-critical/30' },
  eruption:   { label: 'Eruption',   icon: '🌋', color: 'text-severity-critical',  bg: 'bg-severity-critical/10 border-severity-critical/30' },
  landslide:  { label: 'Rockslide',  icon: '⛰️', color: 'text-severity-high',      bg: 'bg-severity-high/10 border-severity-high/30' },
};

// Climatological sub-types
const CLIM_TYPE_CONFIG = {
  heatwave:  { label: 'Heat Wave',   icon: '🌡️', color: 'text-severity-critical',  bg: 'bg-severity-critical/10 border-severity-critical/30' },
  cold:      { label: 'Cold Wave',   icon: '🥶', color: 'text-data-blue',           bg: 'bg-data-blue/10 border-data-blue/30' },
  wildfire:  { label: 'Wildfire',    icon: '🔥', color: 'text-severity-critical',  bg: 'bg-severity-critical/10 border-severity-critical/30' },
  fire:      { label: 'Wildfire',    icon: '🔥', color: 'text-severity-critical',  bg: 'bg-severity-critical/10 border-severity-critical/30' },
  drought:   { label: 'Drought',     icon: '☀️', color: 'text-severity-moderate',  bg: 'bg-severity-moderate/10 border-severity-moderate/30' },
};

// Determine the specific disaster sub-type config from type_name / description / subgroup
function getDisasterTypeConfig(disaster) {
  const typeName = (disaster.disaster_type || '').toLowerCase();
  const subgroup = (disaster.subgroup || '').toLowerCase();
  const desc = (disaster.description || '').toLowerCase();
  const searchStr = `${typeName} ${desc}`;

  let configMap = {};
  if (subgroup.includes('meteorolog')) configMap = METEO_TYPE_CONFIG;
  else if (subgroup.includes('hydro')) configMap = HYDRO_TYPE_CONFIG;
  else if (subgroup.includes('geophys')) configMap = GEO_TYPE_CONFIG;
  else if (subgroup.includes('climatol')) configMap = CLIM_TYPE_CONFIG;

  for (const [key, cfg] of Object.entries(configMap)) {
    if (searchStr.includes(key)) return cfg;
  }

  // Fallback: try all maps
  const allMaps = [METEO_TYPE_CONFIG, HYDRO_TYPE_CONFIG, GEO_TYPE_CONFIG, CLIM_TYPE_CONFIG];
  for (const map of allMaps) {
    for (const [key, cfg] of Object.entries(map)) {
      if (searchStr.includes(key)) return cfg;
    }
  }

  return null;
}

// Build readable description for auto-generated events
function buildDisasterDescription(disaster, typeConfig) {
  const raw = disaster.description || '';
  const isAutoGenerated =
    raw.startsWith('Auto-generated') ||
    raw.startsWith('Ongoing event (updated)') ||
    raw === '';

  if (!isAutoGenerated) return raw;

  const typeName = disaster.disaster_type || typeConfig?.label || disaster.subgroup || 'Disaster';
  const location = [disaster.location_name, disaster.region].filter(Boolean).join(', ');
  const sev = (disaster.severity || '').toLowerCase();

  let msg = '';
  if (sev === 'extreme' || sev === 'critical') {
    msg = `Extreme ${typeName} event`;
  } else if (sev === 'high') {
    msg = `High-severity ${typeName} event`;
  } else {
    msg = `${typeName} event`;
  }

  if (location) msg += ` recorded in ${location}`;
  msg += '. Sensor readings exceeded critical thresholds.';

  return msg;
}

function forecastProbClass(pct) {
  if (pct > 80) return 'text-severity-high';
  if (pct > 60) return 'text-severity-moderate';
  return 'text-text-secondary';
}

// Meteorological type filter tabs (shown when Meteorological subgroup is selected)
const METEO_TYPE_TABS = ['All Types', 'Cyclone', 'Typhoon', 'Hurricane', 'Tornado', 'Severe Storm', 'Thunderstorm'];
const HYDRO_TYPE_TABS = ['All Types', 'Flood', 'Landslide', 'Mudslide', 'Tsunami', 'Storm Surge'];

export default function Disasters() {
  const { disasters, loading: distLoading, error: distErr, refetch: refetchDisasters } = useDisasters();
  const { summary, loading: sumLoading, error: sumErr, refetch: refetchSummary } = useDisasterSummary();
  const {
    forecasts,
    loading: fcLoading,
    error: fcErr,
    refetch: refetchForecasts,
  } = useForecasts(0.5, true);

  const [subgroup, setSubgroup] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All Types');

  // Reset type filter when subgroup changes
  const handleSubgroupChange = (sg) => {
    setSubgroup(sg);
    setTypeFilter('All Types');
  };

  const filtered = useMemo(() => {
    if (!disasters?.length) return [];
    let list = subgroup === 'All'
      ? disasters
      : disasters.filter(d => (d.subgroup || '').toLowerCase() === subgroup.toLowerCase());

    if (typeFilter !== 'All Types') {
      list = list.filter(d => {
        const cfg = getDisasterTypeConfig(d);
        return cfg?.label?.toLowerCase() === typeFilter.toLowerCase();
      });
    }

    return list;
  }, [disasters, subgroup, typeFilter]);

  // Which type tabs to show for the active subgroup
  const typeTabsForSubgroup = useMemo(() => {
    if (subgroup === 'Meteorological') return METEO_TYPE_TABS;
    if (subgroup === 'Hydrological') return HYDRO_TYPE_TABS;
    return null;
  }, [subgroup]);

  const renderImpact = (lbl, val, isMoney = false) => {
    if (val === null || val === undefined || val === '' || val === '0') return null;
    const display = isMoney ? formatCurrency(val) : formatNumber(val);
    return (
      <div className="flex flex-col bg-surface-primary px-2 py-1 rounded border border-border-subtle">
        <span className="text-[10px] uppercase text-text-muted">{lbl}</span>
        <span className="font-data text-xs text-text-secondary">{display}</span>
      </div>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 pb-24 flex flex-col lg:grid lg:grid-cols-12 gap-8 items-start">
      {/* Summary first on mobile */}
      <section className="lg:col-span-4 lg:order-2 order-1 w-full lg:sticky lg:top-6 bg-surface-secondary border border-border-subtle rounded-lg p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-4 border-b border-border-subtle pb-2">
          Impact Overview
        </h2>

        {sumLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : sumErr ? (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: 'rgba(255, 59, 48, 0.7)' }}>
              {sumErr}
            </p>
            <button
              type="button"
              onClick={() => refetchSummary()}
              className="text-xs px-3 py-1.5 rounded-md border border-border-subtle bg-surface-elevated text-text-secondary hover:text-accent-gold"
            >
              Retry
            </button>
          </div>
        ) : summary.length === 0 ? (
          <EmptyState message="No summaries" />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'deaths', field: 'total_deaths' },
                { label: 'injuries', field: 'total_injuries' },
                { label: 'affected', field: 'total_affected' },
              ].map(({ label, field }) => {
                const total = summary.reduce(
                  (acc, s) => acc + (parseInt(s[field] || '0', 10) || 0),
                  0
                );
                if (total === 0) return null;
                return (
                  <div key={field} className="bg-surface-primary border border-border-subtle p-3 rounded">
                    <div className="text-text-muted text-[10px] uppercase mb-1">{label}</div>
                    <div className="font-data text-xl text-text-primary">{formatNumber(total)}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3">
              <div className="text-xs font-semibold text-text-secondary uppercase mb-1">Events By Type</div>
              {summary.map(s => {
                // Find a matching type config for the icon
                const fakeDisaster = {
                  disaster_type: s.disaster_type || '',
                  subgroup: s.subgroup || s.subgroup_name || '',
                  description: '',
                };
                const cfg = getDisasterTypeConfig(fakeDisaster);
                return (
                  <div
                    key={`${s.subgroup || s.subgroup_name || ''}-${s.disaster_type || ''}`}
                    className="flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-primary flex items-center gap-1.5">
                        {cfg?.icon && <span>{cfg.icon}</span>}
                        {s.disaster_type || s.subgroup || s.subgroup_name}
                      </span>
                      <span className="font-data text-text-muted">{formatNumber(s.event_count)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-primary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-data-blue"
                        style={{ width: `${Math.min((s.event_count / 5) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-border-subtle">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-3">
            Upcoming forecasts
            {!fcLoading && !fcErr && (
              <span className="ml-2 text-text-primary font-data text-xs">({forecasts.length})</span>
            )}
          </h3>
          {fcLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : fcErr ? (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: 'rgba(255, 59, 48, 0.7)' }}>
                {fcErr}
              </p>
              <button
                type="button"
                onClick={() => refetchForecasts()}
                className="text-xs px-3 py-1.5 rounded-md border border-border-subtle bg-surface-elevated text-text-secondary hover:text-accent-gold"
              >
                Retry
              </button>
            </div>
          ) : forecasts.length === 0 ? (
            <EmptyState message="No forecasts above 50% probability" />
          ) : (
            <div className="flex flex-col gap-3">
              {forecasts.map(f => (
                <div
                  key={f.forecast_id}
                  className="bg-surface-primary border border-border-subtle rounded-lg p-3 flex flex-col gap-1"
                >
                  <span className={`font-data text-xl font-bold ${forecastProbClass(Number(f.probability_pct))}`}>
                    {formatPercent(Number(f.probability_pct), 1)}
                  </span>
                  <p className="text-sm text-text-primary line-clamp-2">{f.description}</p>
                  <div className="text-[11px] text-text-muted mt-1">
                    {f.location_name} · {f.model_name}
                  </div>
                  <div className="text-[10px] text-text-muted font-data">
                    {f.predicted_timestamp ? new Date(f.predicted_timestamp).toLocaleString() : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Timeline */}
      <section className="lg:col-span-8 lg:order-1 order-2 flex flex-col gap-6 w-full">
        <header>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Disaster Intelligence</h1>
          <p className="text-text-muted text-sm">Chronological events and severity ratings</p>
        </header>

        {/* Subgroup tabs */}
        <div className="flex flex-wrap gap-2 border-b border-border-subtle pb-3">
          {SUBGROUP_TABS.map(tab => {
            const active = subgroup === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => handleSubgroupChange(tab)}
                className={`text-xs px-3 py-2 rounded-t-md transition-colors border-b-2 ${
                  active
                    ? 'text-accent-gold border-accent-gold bg-surface-elevated/50'
                    : 'text-text-secondary border-transparent hover:text-text-primary hover:bg-surface-secondary'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Sub-type filter buttons (Meteorological → Cyclone, Typhoon, Tornado…) */}
        {typeTabsForSubgroup && (
          <div className="flex flex-wrap gap-2 -mt-3">
            {typeTabsForSubgroup.map(tab => {
              const active = typeFilter === tab;
              // Find icon for the specific type
              const allConfigs = { ...METEO_TYPE_CONFIG, ...HYDRO_TYPE_CONFIG };
              const cfg = Object.values(allConfigs).find(c => c.label === tab);
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTypeFilter(tab)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors duration-200 ${
                    active
                      ? `bg-surface-elevated border-accent-gold text-accent-gold`
                      : 'bg-surface-secondary border-border-subtle text-text-secondary hover:text-text-primary hover:border-text-muted'
                  }`}
                >
                  {cfg?.icon && <span>{cfg.icon}</span>}
                  {tab}
                </button>
              );
            })}
          </div>
        )}

        <div className="relative border-l-2 border-border-subtle pl-6 space-y-8 ml-2 mt-2">
          {distLoading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : distErr ? (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: 'rgba(255, 59, 48, 0.7)' }}>
                {distErr}
              </p>
              <button
                type="button"
                onClick={() => refetchDisasters()}
                className="text-xs px-3 py-1.5 rounded-md border border-border-subtle bg-surface-elevated text-text-secondary hover:text-accent-gold"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState message="No recorded disasters" />
          ) : (
            filtered.map((d, i) => {
              const borderColors = {
                critical: 'border-severity-critical bg-severity-critical',
                high: 'border-severity-high bg-severity-high',
                moderate: 'border-severity-moderate bg-severity-moderate',
                safe: 'border-severity-safe bg-severity-safe',
                extreme: 'border-severity-critical bg-severity-critical',
              };
              const sevNorm = (d.severity || '').toLowerCase();
              const bColor = borderColors[sevNorm] || borderColors.safe;

              const lat = d.latitude != null ? Number(d.latitude) : null;
              const lng = d.longitude != null ? Number(d.longitude) : null;
              const mapHref =
                lat != null && lng != null
                  ? `/?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&zoom=13&disaster=${encodeURIComponent(d.event_id)}`
                  : null;

              const typeConfig = getDisasterTypeConfig(d);
              const displayDescription = buildDisasterDescription(d, typeConfig);

              return (
                <div
                  key={d.event_id}
                  className="relative group opacity-0 animate-disaster-card"
                  style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'forwards' }}
                >
                  <div
                    className={`absolute -left-9 w-4 h-4 rounded-full mt-1.5 border-[3px] border-surface-primary ${bColor.split(' ')[1]}`}
                  />

                  <div className="bg-surface-secondary border border-border-subtle rounded-lg p-5 group-hover:bg-surface-elevated transition-colors shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Specific disaster type tag (e.g. Cyclone, Tornado, Flood) */}
                        {typeConfig ? (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border ${typeConfig.bg} ${typeConfig.color}`}>
                            <span>{typeConfig.icon}</span>
                            {typeConfig.label}
                          </span>
                        ) : (
                          <span className="bg-surface-primary border border-border-subtle text-text-secondary font-medium px-2 py-0.5 rounded text-xs">
                            {d.disaster_type}
                          </span>
                        )}

                        {/* Subgroup badge when not filtered */}
                        {subgroup === 'All' && d.subgroup && (
                          <span className="bg-surface-primary border border-border-subtle text-text-muted px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                            {d.subgroup}
                          </span>
                        )}

                        <SeverityBadge severity={d.severity} />
                      </div>

                      <div className="text-text-muted text-xs flex flex-col items-end">
                        <span className="font-data">
                          {new Date(d.start_timestamp).toLocaleDateString()} &rarr;{' '}
                          {d.end_timestamp ? new Date(d.end_timestamp).toLocaleDateString() : 'Ongoing'}
                        </span>
                        <span className="mt-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-text-muted rounded-full" />
                          {d.location_name}, {d.region}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-text-primary mt-3 leading-relaxed max-w-2xl">
                      {displayDescription}
                    </p>

                    <div className="flex flex-wrap gap-2 mt-4">
                      {renderImpact('Deaths', d.deaths)}
                      {renderImpact('Injuries', d.injuries)}
                      {renderImpact('Affected', d.affected_people)}
                      {renderImpact('Econ. Loss', d.economic_loss, true)}
                    </div>

                    {mapHref && (
                      <div className="mt-4">
                        <Link
                          to={mapHref}
                          className="inline-flex text-xs font-medium text-data-blue hover:text-accent-gold transition-colors border border-border-subtle rounded-md px-3 py-1.5 bg-surface-primary"
                        >
                          View on map
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
