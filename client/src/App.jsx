import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppShell from './layouts/AppShell';
import MapExplorer from './pages/MapExplorer';
import Dashboard from './pages/Dashboard';
import Alerts from './pages/Alerts';
import Disasters from './pages/Disasters';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import Login from './pages/Login';
import { useSocket } from './api/socket';

function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function App() {
  // Init socket once at app level
  useSocket();

  return (
    <Routes>
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<MapExplorer />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="disasters" element={<Disasters />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="reports" element={<Reports />} />
      </Route>
      <Route path="/login" element={<Login />} />
    </Routes>
  );
}

export default App;
