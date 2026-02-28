import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import QueryEditor from '../components/QueryEditor';
import TriggerDemo from '../components/TriggerDemo';
import FunctionDemo from '../components/FunctionDemo';

const TABS = [
    { key: 'query', label: '⚡ Query Lab', desc: 'Execute SQL' },
    { key: 'trigger', label: '🔥 Trigger Demo', desc: 'DB Triggers' },
    { key: 'function', label: '🔧 Function Demo', desc: 'Stored Functions' },
];

const ROLE_LABELS = { 1: 'Admin', 2: 'Scientist', 3: 'Citizen' };
const ROLE_COLORS = { 1: '#ef4444', 2: '#8b5cf6', 3: '#22c55e' };

export default function SQLExplorer() {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('query');

    const roleName = ROLE_LABELS[user?.role_id] || user?.role || 'User';
    const roleColor = ROLE_COLORS[user?.role_id] || '#94a3b8';

    return (
        <div className="sql-explorer-root animate-fade-in">

            {/* Top Navigation Bar */}
            <div className="sql-explorer-navbar">
                <div className="sql-navbar-left">
                    <button className="btn-back" onClick={() => navigate('/dashboard')}>
                        ← Dashboard
                    </button>
                    <div className="sql-navbar-brand">
                        <span className="sql-brand-icon">🛢️</span>
                        <span className="sql-brand-title">SQL Explorer</span>
                        <span className="sql-brand-subtitle">AtmoInsight Live Database</span>
                    </div>
                </div>
                <div className="sql-navbar-right">
                    <div className="sql-user-badge">
                        <span style={{ color: roleColor, fontWeight: 600 }}>{roleName}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{user?.email || user?.username}</span>
                    </div>
                    <button className="btn-signout" onClick={() => { logout(); navigate('/'); }}>
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="sql-tabs-bar">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`sql-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        <span className="sql-tab-label">{tab.label}</span>
                        <span className="sql-tab-desc">{tab.desc}</span>
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="sql-explorer-content">

                {/* Schema Quick Reference (visible on query tab) */}
                {activeTab === 'query' && (
                    <div className="schema-hint-bar">
                        <span className="schema-hint-title">📚 Key tables:</span>
                        {['reading', 'sensor', 'location', 'alert', 'disasterevent', 'userreport', 'forecast', 'measurementtype'].map(t => (
                            <code key={t} className="schema-table-chip">{t}</code>
                        ))}
                    </div>
                )}

                {/* Tab Content */}
                {activeTab === 'query' && <QueryEditor />}
                {activeTab === 'trigger' && <TriggerDemo />}
                {activeTab === 'function' && <FunctionDemo />}
            </div>

            {/* Footer */}
            <div className="sql-explorer-footer">
                <span>AtmoInsight SQL Explorer</span>
                <span style={{ color: 'var(--text-muted)' }}>Connected to Neon PostgreSQL · Socket.io Live</span>
                <span style={{ color: 'var(--text-muted)' }}>
                    {user?.role_id === 1 ? '🔓 Full Access' : '🔒 SELECT-only mode'}
                </span>
            </div>
        </div>
    );
}
