import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { useContext } from 'react';
import Login from './pages/Login';
import MainDashboard from './pages/MainDashboard';
import SensorPage from './pages/SensorPage';
import ReadingPage from './pages/ReadingPage';
import MainTab from './pages/MainTab';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <div>Loading...</div>;

  return user ? children : <Navigate to="/" />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      {/* /dashboard and /main-dashboard both serve the new MainDashboard for all roles */}
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <MainDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/main-dashboard"
        element={
          <PrivateRoute>
            <MainDashboard />
          </PrivateRoute>
        }
      />

      <Route
        path="/sensors"
        element={
          <PrivateRoute>
            <SensorPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/readings"
        element={
          <PrivateRoute>
            <ReadingPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/main"
        element={
          <PrivateRoute>
            <MainTab />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;