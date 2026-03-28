import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Map,
  LayoutDashboard,
  Bell,
  CloudLightning,
  LineChart,
  FileText,
  User,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

const PRIMARY_LINKS = [
  { to: '/', icon: Map, label: 'Map' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/disasters', icon: CloudLightning, label: 'Disasters' },
];

const MORE_LINKS = [
  { to: '/analytics', icon: LineChart, label: 'Analytics' },
  { to: '/reports', icon: FileText, label: 'Reports' },
];

export default function Sidebar() {
  const [user, setUser] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = () => {
      const stored = localStorage.getItem('user');
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch (e) {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    checkAuth();
    window.addEventListener('auth-change', checkAuth);
    return () => window.removeEventListener('auth-change', checkAuth);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    window.dispatchEvent(new Event('auth-change'));
    navigate('/login');
    setMoreOpen(false);
  };

  const navClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-200 ${
      isActive
        ? 'bg-surface-elevated text-white border-l-2 border-accent-gold'
        : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary border-l-2 border-transparent'
    }`;

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-14 md:w-60 h-full bg-surface-secondary border-r border-border-subtle flex-col shrink-0 transition-all">
        <div className="p-4 flex flex-col items-center md:items-start overflow-hidden">
          <h1 className="text-accent-gold font-bold text-lg md:text-xl truncate">AtmoInsight</h1>
          <span className="text-text-muted text-xs hidden md:block uppercase tracking-wider mt-px">Hub</span>
        </div>

        <nav className="flex-1 px-2 pt-6 space-y-1">
          {[...PRIMARY_LINKS, ...MORE_LINKS].map(link => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'} className={navClass}>
              <link.icon className="w-5 h-5 shrink-0" />
              <span className="hidden md:block text-sm font-medium">{link.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border-subtle w-full flex flex-col gap-2">
          {user ? (
            <>
              <div className="flex items-center gap-3 px-1 text-text-primary">
                <div className="w-8 h-8 shrink-0 bg-data-blue/20 text-data-blue border border-data-blue/50 rounded-md flex items-center justify-center text-sm font-bold uppercase transition-colors duration-200">
                  {user.username.charAt(0)}
                </div>
                <div className="hidden md:flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate text-text-primary leading-tight">{user.username}</span>
                  <span className="text-[11px] text-text-muted truncate lowercase tracking-wider">
                    {user.role_name || 'operator'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-1 mt-2 text-text-muted hover:text-severity-critical transition-colors duration-200 text-sm font-medium w-full text-left"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="hidden md:block">Disconnect</span>
              </button>
            </>
          ) : (
            <NavLink
              to="/login"
              className="flex items-center gap-3 px-1 text-text-secondary hover:text-text-primary transition-colors duration-200 text-sm font-medium"
            >
              <User className="w-5 h-5 shrink-0" />
              <span className="hidden md:block">Guest Console</span>
            </NavLink>
          )}
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-secondary border-t border-border-subtle flex items-center justify-around px-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {PRIMARY_LINKS.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-md min-w-[3.5rem] transition-colors duration-200 ${
                isActive ? 'text-accent-gold' : 'text-text-secondary'
              }`
            }
          >
            <link.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{link.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-md min-w-[3.5rem] transition-colors duration-200 ${
            moreOpen ? 'text-accent-gold' : 'text-text-secondary'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* Mobile "More" drawer */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMoreOpen(false)}
            aria-label="Close menu"
          />
          <div className="relative bg-surface-secondary border-t border-border-subtle rounded-t-2xl p-4 pb-8 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-text-secondary uppercase tracking-wider">More</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-2 rounded-md text-text-muted hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {MORE_LINKS.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg text-text-primary hover:bg-surface-elevated transition-colors duration-200"
                >
                  <link.icon className="w-5 h-5 text-text-secondary" />
                  <span className="text-sm font-medium">{link.label}</span>
                </NavLink>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-border-subtle">
              {user ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 shrink-0 bg-data-blue/20 text-data-blue border border-data-blue/50 rounded-md flex items-center justify-center text-sm font-bold uppercase">
                      {user.username.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{user.username}</div>
                      <div className="text-[11px] text-text-muted truncate">{user.role_name || 'operator'}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-xs text-severity-critical font-medium shrink-0"
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <NavLink
                  to="/login"
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-2 text-data-blue text-sm font-medium"
                >
                  <User className="w-4 h-4" />
                  Sign in
                </NavLink>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
