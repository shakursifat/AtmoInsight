"use client";

import dynamic from "next/dynamic";
import WidgetGrid from "../../components/dashboard-ui/WidgetGrid";
import Link from "next/link";

// Dynamically import the map to avoid SSR issues with Leaflet
const DashboardMap = dynamic(() => import("../../components/dashboard-ui/DashboardMap"), {
  ssr: false,
  loading: () => <div className="w-full h-[50vh] min-h-[400px] bg-slate-50 animate-pulse flex items-center justify-center text-gray-400">Loading Map...</div>,
});

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-gray-100 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight text-gray-900">
            AtmoInsight
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/dashboard" className="text-gray-900 font-medium">Map</Link>
            <Link href="#" className="text-gray-500 hover:text-gray-900 transition-colors">Analytics</Link>
            <Link href="#" className="text-gray-500 hover:text-gray-900 transition-colors">Reports</Link>
            <Link href="#" className="text-gray-500 hover:text-gray-900 transition-colors">Alerts</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full border border-blue-100">
            Scientist
          </div>
          <div className="h-8 w-8 rounded-full bg-slate-200 border border-slate-300"></div>
        </div>
      </header>

      {/* Alert Banner */}
      <div className="w-full bg-red-50 text-red-700 border-b border-red-100 px-6 py-2.5 flex items-center justify-center font-medium shadow-sm z-10">
        🔴 CRITICAL &mdash; Dhaka City Centre: PM2.5 at <span className="font-mono ml-2 font-bold">178.9 µg/m³</span>
      </div>

      {/* Main Content Area */}
      <main className="flex-grow flex flex-col relative w-full">
        {/* Hero Map (Top Section ~50vh) */}
        <DashboardMap />

        {/* Widget Grid (Bottom Section) */}
        <div className="w-full bg-white relative -mt-4 pt-12 pb-16 z-10 rounded-t-3xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <WidgetGrid />
        </div>
      </main>
    </div>
  );
}
