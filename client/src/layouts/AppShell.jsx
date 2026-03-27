import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppShell() {
  return (
    <div className="flex h-screen w-full bg-surface-primary text-text-primary overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-surface-primary">
        <Outlet />
      </main>
    </div>
  );
}
