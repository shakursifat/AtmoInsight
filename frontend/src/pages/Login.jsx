import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [role, setRole] = useState('Citizen'); // Default role
    const [error, setError] = useState('');
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setError('');

        if (isRegister) {
            try {
                await axios.post('http://localhost:5000/api/auth/register', {
                    username, email, password, role
                });
                // Auto login after register
                const success = await login(email, password);
                if (success) navigate('/dashboard');
            } catch (err) {
                setError(err.response?.data?.error || 'Registration failed');
            }
        } else {
            const success = await login(email, password);
            if (success) navigate('/dashboard');
            else setError('Invalid credentials');
        }
    };

    // Quick Login Demo Helpers
    const demoLogin = async (demoEmail, demoPassword) => {
        setEmail(demoEmail);
        setPassword(demoPassword);
        setError('');
        const success = await login(demoEmail, demoPassword);
        if (success) navigate('/dashboard');
        else setError('Demo credentials failed. Did you register them?');
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100vw', height: '100vh' }}>
            <div className="glass-panel animate-slide-up" style={{ padding: '3rem', width: '400px', textAlign: 'center' }}>
                <h1 className="text-gradient" style={{ marginBottom: '1.5rem', fontSize: '2rem' }}>
                    AtmoInsight
                </h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                    {isRegister ? 'Join the network' : 'Sign in to your dashboard'}
                </p>

                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {isRegister && (
                        <>
                            <input
                                type="text"
                                placeholder="Username"
                                className="input-glass"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                            <select
                                className="input-glass"
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                style={{ WebkitAppearance: 'none', appearance: 'none' }}
                            >
                                <option value="Citizen">Role: Citizen (Public)</option>
                                <option value="Scientist">Role: Scientist (Analytics)</option>
                                <option value="Admin">Role: System Admin (God Mode)</option>
                            </select>
                        </>
                    )}
                    <input
                        type="email"
                        placeholder="Email Address"
                        className="input-glass"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        className="input-glass"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }}>
                        {isRegister ? 'Register Account' : 'Login Securely'}
                    </button>
                </form>

                <p style={{ marginTop: '2rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    {isRegister ? 'Already have an account? ' : "Don't have an account? "}
                    <span
                        style={{ color: 'var(--accent-cyan)', cursor: 'pointer', fontWeight: 'bold' }}
                        onClick={() => setIsRegister(!isRegister)}
                    >
                        {isRegister ? 'Login here' : 'Register Now'}
                    </span>
                </p>

                {/* Demo Mock Logins for testing RBAC */}
                {!isRegister && (
                    <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Test Restricted Dashboards (Must Register First)</p>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button onClick={() => demoLogin('citizen@test.com', 'password')} style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>
                                Citizen
                            </button>
                            <button onClick={() => demoLogin('scientist@test.com', 'password')} style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'rgba(59,130,246,0.2)', border: 'none', color: '#60a5fa', borderRadius: '4px', cursor: 'pointer' }}>
                                Scientist
                            </button>
                            <button onClick={() => demoLogin('admin@test.com', 'password')} style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'rgba(239,68,68,0.2)', border: 'none', color: '#f87171', borderRadius: '4px', cursor: 'pointer' }}>
                                Admin
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
