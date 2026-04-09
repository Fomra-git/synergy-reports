import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  FilePlus, 
  Settings, 
  Users, 
  LogOut, 
  FileSpreadsheet,
  LayoutGrid,
  Sun,
  Moon
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useConfig } from '../context/ConfigContext';

export default function Layout() {
  const { logout, isAdmin, currentUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { config } = useConfig();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px', minHeight: '100px' }}>
          {config?.logoBase64 ? (
             <img 
               src={config.logoBase64} 
               alt={`${config.appName || 'App'} Logo`} 
               style={{ 
                 maxHeight: '80px', 
                 maxWidth: '180px', 
                 objectFit: 'contain',
                 filter: isDark ? 'none' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' 
               }} 
             />
          ) : (
             <div className="login-logo-icon" style={{ width: '64px', height: '64px' }}>
               <FileSpreadsheet size={32} />
             </div>
          )}
        </div>

        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            Dashboard
          </NavLink>
          <NavLink to="/generate" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <FilePlus size={20} />
            Generate Report
          </NavLink>
          <NavLink to="/templates" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutGrid size={20} />
            Manage Templates
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Users size={20} />
                Admin Panel
              </NavLink>
            </>
          )}
        </nav>

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ 
              width: '32px', 
              height: '32px', 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, var(--secondary), var(--primary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: '700'
            }}>
              {currentUser?.email?.[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentUser?.email}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {isAdmin ? 'Administrator' : 'User'}
              </p>
            </div>
          </div>
          
          <button 
            onClick={toggleTheme} 
            className="nav-link" 
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '8px' }}
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>

          <button onClick={handleLogout} className="nav-link" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
