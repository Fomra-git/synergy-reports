import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, getDocs, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { UserPlus, UserMinus, Shield, Mail, Search, AlertCircle, Settings, BarChart4 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminSettings from '../components/AdminSettings';
import ModernModal from '../components/ModernModal';

export default function AdminPanel() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newUser, setNewUser] = useState({ email: '', role: 'user' });
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('users');

  // Modal State
  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    mode: 'alert',
    confirmText: 'Confirm',
    onConfirm: null
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'));
      const querySnapshot = await getDocs(q);
      const userList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(userList);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Could not load users list.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!newUser.email) {
      setError('Email is required');
      return;
    }

    try {
      // NOTE: In a real app, you would use Firebase Cloud Functions to create the actual user in Auth.
      // Here we are just creating the user record in Firestore for the demo.
      // The user would still need to be created in Firebase Authentication.
      await setDoc(doc(db, 'users', newUser.email.replace(/\./g, '_')), {
        email: newUser.email,
        role: newUser.role,
        createdAt: new Date().toISOString()
      });
      
      setSuccess(`User ${newUser.email} added successfully to user database.`);
      setNewUser({ email: '', role: 'user' });
      fetchUsers();
    } catch (err) {
      console.error('Error adding user:', err);
      setError('Error adding user record.');
    }
  };

  const handleDeleteUser = (id) => {
    setModal({
      isOpen: true,
      title: 'Revoke Access?',
      message: `Are you sure you want to remove ${id.replace(/_/g, '.')} from the authorized users record? They will lose access to the reporting engine immediately.`,
      type: 'danger',
      mode: 'confirm',
      confirmText: 'Revoke Access',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', id));
          fetchUsers();
          setModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error('Error deleting user:', err);
          setError('Could not delete user.');
        }
      }
    });
  };

  return (
    <div className="admin-panel">
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
           <h1 className="page-title">Admin Management</h1>
           <p className="page-description">Authorize users and configure global app settings.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', background: 'var(--glass-subtle)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <button 
               onClick={() => setActiveTab('users')}
               style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'users' ? 'var(--primary)' : 'transparent', color: activeTab === 'users' ? 'white' : 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}
            >
               User Management
            </button>
            <button 
               onClick={() => setActiveTab('settings')}
               style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'settings' ? 'var(--primary)' : 'transparent', color: activeTab === 'settings' ? 'white' : 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}
            >
               App Settings
            </button>
            <button 
               onClick={() => navigate('/pivot-designer')}
               style={{ marginLeft: '8px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--glass-bg)', color: 'var(--secondary)', cursor: 'pointer', fontWeight: '600', border: '1px solid var(--border)' }}
            >
               <BarChart4 size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Pivot Designer
            </button>
        </div>
      </header>

      {activeTab === 'users' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px' }}>
        <div className="glass" style={{ padding: '32px', height: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <UserPlus size={20} color="var(--primary)" />
            <h3 style={{ fontSize: '18px' }}>Add New User</h3>
          </div>

          <form onSubmit={handleAddUser}>
             <div className="form-group">
                <label>Email Address</label>
                <div className="input-wrapper">
                   <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                   <input 
                     type="email" 
                     placeholder="colleague@domain.com"
                     style={{ paddingLeft: '40px' }}
                     value={newUser.email}
                     onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                   />
                </div>
             </div>
             <div className="form-group">
                <label>System Role</label>
                <select 
                  style={{ 
                    width: '100%', 
                    background: 'var(--input-bg)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '12px', 
                    padding: '12px 16px', 
                    color: 'var(--text-main)',
                    fontFamily: 'inherit'
                  }}
                  value={newUser.role}
                  onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="user">Standard User</option>
                  <option value="admin">Administrator</option>
                </select>
             </div>
             
             {error && <div className="alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
             {success && <div style={{ color: 'var(--success)', fontSize: '14px', marginBottom: '16px' }}>{success}</div>}

             <button type="submit" className="btn-primary btn-full">
               Authorize Access
             </button>
             <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '16px', lineHeight: '1.4' }}>
               <AlertCircle size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
               Authorized users can login after being added to Firebase Authentication.
             </p>
          </form>
        </div>

        <div className="glass" style={{ padding: '32px' }}>
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Shield size={20} color="var(--secondary)" />
                <h3 style={{ fontSize: '18px' }}>Authorized Users</h3>
              </div>
              <div className="input-wrapper" style={{ width: '240px' }}>
                 <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                 <input type="text" placeholder="Search users..." style={{ paddingLeft: '40px', paddingY: '8px' }} />
              </div>
           </div>

           <div style={{ overflowX: 'auto' }}>
             <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                   <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '16px 8px', color: 'var(--text-muted)', fontWeight: '500', fontSize: '14px' }}>Member</th>
                      <th style={{ padding: '16px 8px', color: 'var(--text-muted)', fontWeight: '500', fontSize: '14px' }}>Role</th>
                      <th style={{ padding: '16px 8px', color: 'var(--text-muted)', fontWeight: '500', fontSize: '14px' }}>Status</th>
                      <th style={{ padding: '16px 8px', color: 'var(--text-muted)', fontWeight: '500', fontSize: '14px', textAlign: 'right' }}>Actions</th>
                   </tr>
                </thead>
                <tbody>
                   {loading ? (
                     <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px' }}>Fetching records...</td></tr>
                   ) : users.length === 0 ? (
                     <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No users found.</td></tr>
                   ) : users.map(user => (
                     <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '16px 8px' }}>
                           <p style={{ fontWeight: '500' }}>{user.email}</p>
                        </td>
                        <td style={{ padding: '16px 8px' }}>
                           <span style={{ 
                             padding: '4px 8px', 
                             borderRadius: '6px', 
                             fontSize: '11px', 
                             background: user.role === 'admin' ? 'rgba(99, 102, 241, 0.1)' : 'var(--glass-bg)',
                             color: user.role === 'admin' ? 'var(--primary)' : 'var(--text-muted)',
                             fontWeight: '600',
                             textTransform: 'uppercase'
                           }}>
                             {user.role}
                           </span>
                        </td>
                        <td style={{ padding: '16px 8px' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></div>
                              Active
                           </div>
                        </td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                            <button 
                              onClick={() => handleDeleteUser(user.id)}
                              className="modern-icon-box"
                              style={{ border: 'none', color: 'var(--error)', padding: '8px', display: 'inline-flex' }}
                              title="Revoke Access"
                            >
                               <UserMinus size={18} />
                            </button>
                         </td>
                     </tr>
                   ))}
                </tbody>
             </table>
           </div>
        </div>
      </div>
      ) : (
        <AdminSettings />
      )}

      <ModernModal 
        {...modal} 
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
