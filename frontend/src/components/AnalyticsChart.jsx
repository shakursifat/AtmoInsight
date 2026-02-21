import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from "../context/AuthContext";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

export default function AnalyticsChart({ sensorId = 1 }) {
    const { token } = useContext(AuthContext);
    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const res = await axios.get(`http://localhost:5000/api/analytics/daily?sensor_id=${sensorId}`, config);

                // Data arrives sorted ascending by date
                const data = res.data;

                if (data.length === 0) {
                    setLoading(false);
                    return;
                }

                const labels = data.map(row => {
                    const d = new Date(row.reading_date);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                });

                const avgValues = data.map(row => parseFloat(row.avg_value).toFixed(2));

                setChartData({
                    labels,
                    datasets: [
                        {
                            label: `Daily Avg (Sensor ${sensorId})`,
                            data: avgValues,
                            borderColor: '#06b6d4',
                            backgroundColor: 'rgba(6, 182, 212, 0.2)', // Neon Cyan gradient effect
                            borderWidth: 2,
                            pointBackgroundColor: '#8b5cf6',
                            pointBorderColor: '#fff',
                            pointHoverBackgroundColor: '#fff',
                            pointHoverBorderColor: '#06b6d4',
                            fill: true,
                            tension: 0.4 // Smooth curves
                        }
                    ]
                });
                setLoading(false);
            } catch (err) {
                console.error("Failed to load analytics:", err);
                setLoading(false);
            }
        };

        if (token) fetchAnalytics();
    }, [token, sensorId]);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: '#f8fafc' }
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleColor: '#06b6d4',
                bodyColor: '#f8fafc',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#94a3b8' }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#94a3b8' }
            }
        }
    };

    if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading Historical Data...</div>;
    if (!chartData) return <div style={{ color: 'var(--text-muted)' }}>No historical data available.</div>;

    return (
        <div style={{ height: '300px', width: '100%' }}>
            <Line options={options} data={chartData} />
        </div>
    );
}
