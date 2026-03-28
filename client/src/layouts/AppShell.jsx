import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppShell() {
  return (
    <div className="flex h-screen w-full bg-surface-primary text-text-primary overflow-hidden flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-surface-primary pb-[4.5rem] md:pb-0 min-h-0">
        <Outlet />
      </main>
    </div>
  );
}
