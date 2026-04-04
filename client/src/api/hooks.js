import { useState, useEffect, useCallback, useMemo } from 'react';
import client from './client';

function useFetch(url, params = null, options = {}) {
  const { enabled = true } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!enabled);
  const [error, setError] = useState(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger(n => n + 1), []);

  const paramsKey = useMemo(() => JSON.stringify(params ?? null), [params]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);

    client.get(url, { params, signal: controller.signal })
      .then(res => {
        setData(res.data);
        setError(null);
      })
      .catch(err => {
        if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
          setError(err.message || 'API Error');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, paramsKey, trigger, enabled]);

  return { data, loading, error, refetch };
}

export function useSensorsGeoJSON() {
  const { data, loading, error, refetch } = useFetch('/api/map/sensors');
  return { data, loading, error, refetch };
}

export function useDisastersGeoJSON() {
  const { data, loading, error, refetch } = useFetch('/api/map/disasters');
  return { data, loading, error, refetch };
}

export function useCurrentConditions() {
  const { data, loading, error, refetch } = useFetch('/api/current-conditions');
  return { conditions: data?.conditions || [], loading, error, refetch };
}

export function useActiveAlerts() {
  const { data, loading, error, refetch } = useFetch('/api/alerts/active');
  return { alerts: data?.alerts || [], loading, error, refetch };
}

export function useDisasters(subgroup = 'All') {
  const params = { limit: 500 };
  if (subgroup && subgroup !== 'All') {
    params.subgroup = subgroup;
  }
  const { data, loading, error, refetch } = useFetch('/api/disasters', params);
  return { disasters: data?.disasters || [], loading, error, refetch };
}

export function useDisasterSummary() {
  const { data, loading, error, refetch } = useFetch('/api/disasters/summary');
  return { summary: data?.summary || [], loading, error, refetch };
}

export function useTimeseries(sensorId, type, days = 30) {
  const { data, loading, error, refetch } = useFetch(
    `/api/readings/timeseries/${sensorId}`,
    { type, days },
    { enabled: sensorId != null && sensorId !== '' }
  );
  return { data: data?.data || [], loading, error, refetch };
}

export function usePollutionAverage(locationId, type, interval = '30 days') {
  const { data, loading, error, refetch } = useFetch(
    '/api/analytics/pollution-average',
    { location_id: locationId, type, interval },
    { enabled: locationId != null && locationId !== '' }
  );
  return { data: data?.data ?? null, loading, error, refetch };
}

export function useSatelliteCorrelation() {
  const { data, loading, error, refetch } = useFetch('/api/analytics/satellite-correlation');
  return { correlations: data?.correlations || [], loading, error, refetch };
}

export function useClimateIndicators() {
  const { data, loading, error, refetch } = useFetch('/api/analytics/climate-indicators');
  return { indicators: data?.indicators || [], loading, error, refetch };
}

export function useForecasts(minProbability = 0, upcomingOnly = true) {
  const { data, loading, error, refetch } = useFetch('/api/forecasts', {
    min_probability: minProbability,
    upcoming_only: upcomingOnly,
  });
  return { forecasts: data?.forecasts || [], loading, error, refetch };
}

export function useMonthlyTrend(type = 'PM2.5', months = 12) {
  const { data, loading, error, refetch } = useFetch('/api/analytics/monthly-trend', { type, months });
  return { data: data?.data || [], loading, error, refetch, meta: { type: data?.type, months: data?.months } };
}

export function useSensorTypes() {
  const { data, loading, error, refetch } = useFetch('/api/sensors/types');
  return { types: data || [], loading, error, refetch };
}
