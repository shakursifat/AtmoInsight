import Link from "next/link";

export default function SensorsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 p-8">
      <h1 className="text-2xl font-bold mb-4">Active Sensors</h1>
      <p className="text-gray-500 mb-6">Detailed status of all hardware sensors.</p>
      <Link href="/dashboard" className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-md text-gray-700 hover:bg-slate-200 transition-colors">
        Back to Dashboard
      </Link>
    </div>
  );
}
