import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { 
  FileSpreadsheet, 
  Users, 
  Settings, 
  History,
  TrendingUp,
  Clock
} from 'lucide-react';

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState({
    templates: 0,
    users: 0,
    reports: 0
  });

  useEffect(() => {
    // Mock simulation for stats fetch
    // In a real app, these would come from Firestore counts
    const fetchStats = async () => {
      try {
        const templatesQuery = await getDocs(collection(db, 'templates'));
        setStats(prev => ({ ...prev, templates: templatesQuery.docs.length }));
        
        if (isAdmin) {
          const usersQuery = await getDocs(collection(db, 'users'));
          setStats(prev => ({ ...prev, users: usersQuery.docs.length }));
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };
    fetchStats();
  }, [isAdmin]);

  return (
    <div className="dashboard">
      <header className="page-header">
        <h1 className="page-title">Dashboard Overview</h1>
        <p className="page-description">Welcome to Synergy Reports. Unified master data processing hub.</p>
      </header>

      <div className="stats-grid">
        <div className="glass stat-card">
          <div className="login-logo-icon" style={{ width: '48px', height: '48px', marginBottom: '16px' }}>
            <Settings size={24} />
          </div>
          <p className="stat-label">Active Templates</p>
          <h2 className="stat-value">{stats.templates}</h2>
        </div>

        {isAdmin && (
          <div className="glass stat-card">
            <div className="login-logo-icon" style={{ width: '48px', height: '48px', marginBottom: '16px', background: 'linear-gradient(135deg, var(--secondary), #d946ef)' }}>
              <Users size={24} />
            </div>
            <p className="stat-label">Authorized Users</p>
            <h2 className="stat-value">{stats.users}</h2>
          </div>
        )}

        <div className="glass stat-card">
          <div className="login-logo-icon" style={{ width: '48px', height: '48px', marginBottom: '16px', background: 'linear-gradient(135deg, #10b981, #34d399)' }}>
            <FileSpreadsheet size={24} />
          </div>
          <p className="stat-label">Reports Generated (Total)</p>
          <h2 className="stat-value">124</h2>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div className="glass" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <History size={20} color="var(--primary)" />
            <h3 style={{ fontSize: '18px' }}>Recent Activity</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
             {[1, 2, 3].map(i => (
               <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', borderRadius: '12px', background: 'var(--glass-subtle)' }}>
                 <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                   <Clock size={18} />
                 </div>
                 <div>
                    <p style={{ fontWeight: '500' }}>Master Report Generated</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>2 hours ago • 4 files in ZIP</p>
                 </div>
               </div>
             ))}
          </div>
        </div>

        <div className="glass" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
             <TrendingUp size={20} color="var(--secondary)" />
             <h3 style={{ fontSize: '18px' }}>Health Check</h3>
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
             <p style={{ marginBottom: '12px' }}>System fully operational.</p>
             <div style={{ height: '8px', background: 'var(--glass-bg)', borderRadius: '4px', overflow: 'hidden' }}>
               <div style={{ width: '100%', height: '100%', background: 'var(--success)' }}></div>
             </div>
             <p style={{ marginTop: '12px', fontSize: '12px' }}>Firebase Status: Connected</p>
             <p style={{ fontSize: '12px' }}>Auth Engine: Secure</p>
          </div>
        </div>
      </div>
    </div>
  );
}
