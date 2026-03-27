import { useState, useEffect, useCallback } from 'react';
import client from './client';

function useFetch(url, params = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => setTrigger(n => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    client.get(url, { params, signal: controller.signal })
      .then(res => {
        setData(res.data);
        setError(null);
      })
      .catch(err => {
        if (err.name !== 'CanceledError') setError(err.message || 'API Error');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(params), trigger]);

  return { data, loading, error, refetch };
}

export function useSensorsGeoJSON() {
  const { data, loading, error, refetch } = useFetch('/api/map/sensors');
  return { data, loading, error, refetch };
}

export function useDisastersGeoJSON() {
  const { data, loading, error } = useFetch('/api/map/disasters');
  return { data, loading, error };
}

export function useCurrentConditions() {
  const { data, loading, error, refetch } = useFetch('/api/current-conditions');
  return { conditions: data?.conditions || [], loading, error, refetch };
}

export function useActiveAlerts() {
  const { data, loading, error } = useFetch('/api/alerts/active');
  return { alerts: data?.alerts || [], loading, error };
}

export function useDisasters() {
  const { data, loading, error } = useFetch('/api/disasters');
  return { disasters: data?.disasters || [], loading, error };
}

export function useDisasterSummary() {
  const { data, loading, error } = useFetch('/api/disasters/summary');
  return { summary: data?.summary || [], loading, error };
}

export function useTimeseries(sensorId, type, days = 30) {
  const { data, loading, error } = useFetch(`/api/readings/timeseries/${sensorId}`, { type, days });
  return { data: data?.data || [], loading, error };
}
