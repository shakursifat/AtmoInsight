import { createContext, useState, useEffect } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token') || '');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem('token');

        if (storedToken) {
            setToken(storedToken);
            setUser({ authenticated: true });
        } else {
            setToken('');
            setUser(null);
        }

        setLoading(false);
    }, []);

    const login = async (email, password) => {
        try {
            const res = await axios.post('http://localhost:5000/api/auth/login', { email, password });
            setToken(res.data.token);
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user || { authenticated: true });
            return true;
        } catch (err) {
            console.error("Login failed:", err);
            return false;
        }
    };

    const logout = () => {
        setToken('');
        setUser(null);
        localStorage.removeItem('token');
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};