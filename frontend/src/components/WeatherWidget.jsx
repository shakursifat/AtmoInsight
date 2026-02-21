import { useState, useEffect } from 'react';
import axios from 'axios';

export default function WeatherWidget() {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWeather = async () => {
            try {
                // Querying for Dhaka, Bangladesh coordinates (similar to our mock sensors)
                // Including temperature, humidity, and wind_speed
                const res = await axios.get('https://api.open-meteo.com/v1/forecast?latitude=23.8103&longitude=90.4125&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto');

                setWeather(res.data.current);
            } catch (err) {
                console.error("Failed to load meteorological data", err);
            } finally {
                setLoading(false);
            }
        };

        fetchWeather();

        // Refresh every 15 minutes
        const interval = setInterval(fetchWeather, 900000);
        return () => clearInterval(interval);
    }, []);

    if (loading || !weather) {
        return (
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', color: 'var(--text-muted)' }}>
                Synching meteorological feeds...
            </div>
        );
    }

    return (
        <div className="glass-panel" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.25rem 2rem',
            marginBottom: '2rem',
            background: 'linear-gradient(90deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)',
            borderLeft: '4px solid #3b82f6'
        }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '0.75rem', borderRadius: '50%', color: '#60a5fa' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path>
                    </svg>
                </div>
                <div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f8fafc' }}>
                        {weather.temperature_2m}°C
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Ambient Temp (Dhaka)
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '0.75rem', borderRadius: '50%', color: '#34d399' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20"></path><path d="M12 2a4 4 0 0 0-4 4"></path><path d="M12 2a4 4 0 0 1 4 4"></path><path d="M12 22a4 4 0 0 0-4-4"></path><path d="M12 22a4 4 0 0 1 4-4"></path><path d="M12 11h10"></path><path d="M22 11a4 4 0 0 0-4-4"></path><path d="M22 11a4 4 0 0 1-4 4"></path><path d="M2 11h10"></path><path d="M2 11a4 4 0 0 0 4-4"></path><path d="M2 11a4 4 0 0 1 4 4"></path>
                    </svg>
                </div>
                <div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f8fafc' }}>
                        {weather.wind_speed_10m} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>km/h</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Wind Speed
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(168, 85, 247, 0.15)', padding: '0.75rem', borderRadius: '50%', color: '#c084fc' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22a6 6 0 0 0 6-6c0-4-6-10-6-10S6 12 6 16a6 6 0 0 0 6 6z"></path>
                    </svg>
                </div>
                <div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f8fafc' }}>
                        {weather.relative_humidity_2m}%
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Humidity
                    </div>
                </div>
            </div>

            <div>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)' }}>
                    <span style={{ color: '#38bdf8' }}>Open-Meteo Satellite</span>
                </div>
            </div>

        </div>
    );
}
