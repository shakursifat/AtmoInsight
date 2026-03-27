import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import { AlertTriangle, Loader2 } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // Login
        const res = await client.post('/api/auth/login', {
          email: formData.email,
          password: formData.password
        });
        
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        
        // Broadcast custom event so the Sidebar updates
        window.dispatchEvent(new Event('auth-change'));
        navigate('/dashboard'); // route to dashboard after auth
      } else {
        // Registration
        const res = await client.post('/api/auth/register', {
          username: formData.username,
          email: formData.email,
          password: formData.password
        });
        
        // Upon successful registration, toggle back to login screen 
        setIsLogin(true);
        setError('Registration successful. You can now log in.');
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError('An unexpected error occurred. Is the server running?');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-surface-primary flex flex-col md:flex-row">
      <div className="flex-1 flex flex-col justify-center items-center md:items-start px-8 md:px-16 lg:px-24 py-12">
        <div className="mb-10 w-full max-w-sm">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2">
            {isLogin ? 'Welcome Back' : 'Join AtmoInsight'}
          </h1>
          <p className="text-text-muted text-sm border-l-2 border-accent-gold pl-3">
            Secure environmental terminal access
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-5">
          {error && (
            <div className={`p-3 rounded-md border flex items-start gap-3 text-sm font-medium ${isLogin && error.includes('successful') ? 'bg-severity-safe/10 border-severity-safe/30 text-severity-safe' : 'bg-severity-critical/10 border-severity-critical/30 text-severity-critical'}`}>
               {!isLogin || !error.includes('successful') ? <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> : null}
               <span>{error}</span>
            </div>
          )}

          {!isLogin && (
            <div className="flex flex-col gap-2">
              <label className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold">Username</label>
              <input
                type="text"
                name="username"
                required={!isLogin}
                value={formData.username}
                onChange={handleInputChange}
                className="bg-surface-secondary border border-border-subtle focus:border-data-blue outline-none rounded-md px-4 py-2.5 text-text-primary transition-colors disabled:opacity-50 text-sm"
                placeholder="monitor_user1"
                disabled={loading}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold">Email Address</label>
            <input
              type="email"
              name="email"
              required
              value={formData.email}
              onChange={handleInputChange}
              className="bg-surface-secondary border border-border-subtle focus:border-data-blue outline-none rounded-md px-4 py-2.5 text-text-primary transition-colors disabled:opacity-50 text-sm"
              placeholder="operator@atmoinsight.gov"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold">Password</label>
            <input
              type="password"
              name="password"
              required
              value={formData.password}
              onChange={handleInputChange}
              className="bg-surface-secondary border border-border-subtle focus:border-data-blue outline-none rounded-md px-4 py-2.5 text-text-primary transition-colors disabled:opacity-50 font-data tracking-widest text-sm"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full bg-data-blue text-surface-primary hover:bg-data-blue/90 font-semibold py-2.5 rounded-md transition-colors flex justify-center items-center h-[44px]"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Sign In Server' : 'Provision Account')}
          </button>

          <div className="mt-4 text-center text-sm text-text-muted flex justify-center items-center gap-2">
            <span>{isLogin ? "No active account?" : "Already provisioned?"}</span>
            <button 
              type="button" 
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-accent-gold hover:underline font-medium"
            >
              {isLogin ? 'Register Access' : 'Sign in instead'}
            </button>
          </div>
        </form>
        
        <div className="mt-16 text-sm">
           <Link to="/" className="text-text-muted hover:text-text-primary transition-colors">&larr; Return to Live Guest Map</Link>
        </div>
      </div>
      
      {/* Decorative Right Side for Desktop */}
      <div className="hidden lg:flex flex-1 justify-center items-center relative overflow-hidden bg-surface-secondary border-l border-border-subtle p-12">
         <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, var(--color-data-blue) 1.5px, transparent 1.5px)', backgroundSize: '32px 32px' }}></div>
         <div className="relative z-10 max-w-lg text-center leading-relaxed flex flex-col items-center">
            <div className="w-16 h-16 rounded-full border border-accent-gold flex items-center justify-center mb-6 bg-surface-primary">
               <div className="w-8 h-8 rounded-full bg-accent-gold/20 animate-pulse"></div>
            </div>
            <h2 className="text-text-primary font-data text-xl uppercase mb-4 tracking-widest border-b border-border-subtle inline-block px-4 pb-3">Secured Node Access</h2>
            <p className="text-text-muted mt-4">Authorized terminal operators gain full systems access to disaster deployment logs, administrative analytics overrides, and private sensor polling directly via the PostgreSQL network core.</p>
         </div>
      </div>
    </div>
  );
}
