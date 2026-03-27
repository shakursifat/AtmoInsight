import Link from "next/link";

export default function WidgetGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl mx-auto px-6">
      
      {/* Card 1: Live Readings */}
      <Link href="/dashboard/readings" className="block bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
        <h2 className="text-gray-900 font-semibold mb-3">Live Readings</h2>
        <div className="flex flex-col gap-2 font-mono text-sm">
          <div className="flex justify-between items-center bg-slate-50 p-2 rounded">
            <span className="text-gray-500">PM2.5</span>
            <span className="text-red-600 font-medium">178.9 µg/m³</span>
          </div>
          <div className="flex justify-between items-center bg-slate-50 p-2 rounded">
            <span className="text-gray-500">River Level</span>
            <span className="text-amber-500 font-medium">8.4m</span>
          </div>
          <div className="flex justify-between items-center bg-slate-50 p-2 rounded">
            <span className="text-gray-500">BUET Temp</span>
            <span className="text-emerald-500 font-medium">34.1 °C</span>
          </div>
        </div>
      </Link>

      {/* Card 2: Active Events */}
      <Link href="/dashboard/events" className="block bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
        <h2 className="text-gray-900 font-semibold mb-1">Active Events</h2>
        <p className="text-gray-500 text-xs mb-3">3 alerts, 2 disasters</p>
        <div className="flex flex-col gap-2">
          <div className="bg-red-50 text-red-700 text-xs px-2 py-1.5 rounded border border-red-100 font-medium truncate">
            🔴 PM2.5 Critical Spike (Dhaka City)
          </div>
          <div className="bg-amber-50 text-amber-700 text-xs px-2 py-1.5 rounded border border-amber-100 font-medium truncate">
            🟠 Buriganga Flood (Ongoing)
          </div>
        </div>
      </Link>

      {/* Card 3: Active Sensors */}
      <Link href="/dashboard/sensors" className="block bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
        <h2 className="text-gray-900 font-semibold mb-3">Active Sensors</h2>
        <ul className="flex flex-col gap-2 text-sm font-mono">
          <li className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <span className="text-gray-700 truncate">Dhaka City Ctr</span>
            </div>
            <span className="text-gray-500">178.9</span>
          </li>
          <li className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-gray-700 truncate">BUET Weather</span>
            </div>
            <span className="text-gray-500">34°C</span>
          </li>
          <li className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-gray-700 truncate">Sylhet Station</span>
            </div>
            <span className="text-gray-500">3.2M</span>
          </li>
        </ul>
      </Link>

      {/* Card 4: 7-Day Forecast */}
      <Link href="/dashboard/forecast" className="block bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
        <h2 className="text-gray-900 font-semibold mb-3">7-Day Forecast</h2>
        <div className="flex justify-between mt-2">
          {/* Day 1 */}
          <div className="flex flex-col items-center">
            <span className="text-gray-500 text-xs mb-1">Mon</span>
            <div className="h-8 w-8 flex items-center justify-center bg-slate-50 rounded-full mb-1">
              ☁️
            </div>
            <span className="font-mono text-xs text-gray-700">20%</span>
          </div>
          {/* Day 2 */}
          <div className="flex flex-col items-center">
            <span className="text-gray-500 text-xs mb-1">Tue</span>
            <div className="h-8 w-8 flex items-center justify-center bg-slate-50 rounded-full mb-1">
              🌧️
            </div>
            <span className="font-mono text-xs text-blue-600">80%</span>
          </div>
          {/* Day 3 */}
          <div className="flex flex-col items-center">
            <span className="text-gray-500 text-xs mb-1">Wed</span>
            <div className="h-8 w-8 flex items-center justify-center bg-slate-50 rounded-full mb-1">
              ☁️
            </div>
            <span className="font-mono text-xs text-gray-700">10%</span>
          </div>
        </div>
      </Link>

    </div>
  );
}
