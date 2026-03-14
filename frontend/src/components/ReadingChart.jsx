import { useEffect, useRef } from 'react';
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function ReadingChart({ readings, unitSymbol }) {
    // Reverse to show oldest → newest (chronological)
    const sorted = [...(readings || [])].reverse();

    const labels = sorted.map(r => new Date(r.timestamp).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }));

    const values = sorted.map(r => parseFloat(r.value));

    const data = {
        labels,
        datasets: [
            {
                label: `Value ${unitSymbol ? `(${unitSymbol})` : ''}`,
                data: values,
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                borderWidth: 2,
                pointRadius: sorted.length > 50 ? 0 : 3,
                pointHoverRadius: 6,
                tension: 0.3,
                fill: true,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                labels: {
                    color: '#94a3b8',
                    font: { size: 12 }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleColor: '#67e8f9',
                bodyColor: '#e2e8f0',
                borderColor: 'rgba(6, 182, 212, 0.3)',
                borderWidth: 1,
            },
        },
        scales: {
            x: {
                ticks: {
                    color: '#64748b',
                    maxTicksLimit: 8,
                    maxRotation: 30,
                    font: { size: 11 }
                },
                grid: { color: 'rgba(255,255,255,0.04)' }
            },
            y: {
                ticks: { color: '#64748b', font: { size: 11 } },
                grid: { color: 'rgba(255,255,255,0.06)' }
            }
        }
    };

    if (!readings || readings.length === 0) {
        return (
            <div className="rp-chart-empty">
                <p>📈 No data to plot yet.</p>
            </div>
        );
    }

    return (
        <div style={{ height: '280px' }}>
            <Line data={data} options={options} />
        </div>
    );
}
