import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Map, LayoutDashboard, Bell, CloudLightning, LineChart, FileText, User, LogOut } from 'lucide-react';

const LINKS = [
  { to: '/', icon: Map, label: 'Map Explorer' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/disasters', icon: CloudLightning, label: 'Disasters' },
  { to: '/analytics', icon: LineChart, label: 'Analytics' },
  { to: '/reports', icon: FileText, label: 'Reports' },
];

export default function Sidebar() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = () => {
      const stored = localStorage.getItem('user');
      if (stored) {
        try { setUser(JSON.parse(stored)); } catch(e) { setUser(null); }
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
  };

  return (
    <div className="w-14 md:w-60 h-full bg-surface-secondary border-r border-border-subtle flex flex-col shrink-0 transition-all">
      {/* Brand */}
      <div className="p-4 flex flex-col items-center md:items-start overflow-hidden">
        <h1 className="text-accent-gold font-bold text-lg md:text-xl truncate">AtmoInsight</h1>
        <span className="text-text-muted text-xs hidden md:block uppercase tracking-wider mt-px">Hub</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 pt-6 space-y-1">
        {LINKS.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                isActive 
                  ? 'bg-surface-elevated text-white border-l-2 border-accent-gold' 
                  : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary border-l-2 border-transparent'
              }`
            }
          >
            <link.icon className="w-5 h-5 shrink-0" />
            <span className="hidden md:block text-sm font-medium">{link.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border-subtle w-full flex flex-col gap-2">
        {user ? (
          <>
            <div className="flex items-center gap-3 px-1 text-text-primary">
              <div className="w-8 h-8 shrink-0 bg-data-blue/20 text-data-blue border border-data-blue/50 rounded-md flex items-center justify-center text-sm font-bold uppercase transition-colors">
                {user.username.charAt(0)}
              </div>
              <div className="hidden md:flex flex-col min-w-0">
                 <span className="text-sm font-medium truncate text-text-primary leading-tight">{user.username}</span>
                 <span className="text-[11px] text-text-muted truncate lowercase tracking-wider">{user.role_name || 'operator'}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-3 px-1 mt-2 text-text-muted hover:text-severity-critical transition-colors text-sm font-medium w-full text-left">
               <LogOut className="w-4 h-4 shrink-0" />
               <span className="hidden md:block">Disconnect</span>
            </button>
          </>
        ) : (
          <NavLink to="/login" className="flex items-center gap-3 px-1 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium">
            <User className="w-5 h-5 shrink-0" />
            <span className="hidden md:block">Guest Console</span>
          </NavLink>
        )}
      </div>
    </div>
  );
}
