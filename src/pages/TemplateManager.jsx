import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, getDocs, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { 
  Settings, 
  Plus, 
  Trash2, 
  Edit2, 
  FileSpreadsheet, 
  List, 
  AlertCircle, 
  Loader2, 
  LayoutGrid,
  Copy,
  Search
} from 'lucide-react';
import ModernModal from '../components/ModernModal';

/**
 * TemplateManager (Simplified)
 * Now serves as a central hub for browsing report templates.
 * Creation and Editing are now handled exclusively by the Visual Mapper.
 */
export default function TemplateManager() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    mode: 'alert',
    confirmText: 'Confirm',
    onConfirm: null,
    inputValue: ''
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'templates'));
      const snapshot = await getDocs(q);
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id) => {
    setModal({
      isOpen: true,
      title: 'Delete Template?',
      message: 'This action cannot be undone. All column mappings and configurations for this report will be permanently removed.',
      type: 'danger',
      mode: 'confirm',
      confirmText: 'Delete Forever',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'templates', id));
          fetchTemplates();
          setModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error('Delete error:', err);
          showError('Could not delete the template. Please try again.');
        }
      }
    });
  };

  const showError = (msg) => {
    setModal({
      isOpen: true,
      title: 'System Error',
      message: msg,
      type: 'danger',
      mode: 'alert',
      confirmText: 'Dismiss'
    });
  };

  const handleDuplicate = (template) => {
    setModal({
      isOpen: true,
      title: 'Duplicate Template',
      message: 'Enter a name for the new template copy:',
      type: 'info',
      mode: 'prompt',
      confirmText: 'Clone Template',
      inputValue: `${template.name} (Copy)`,
      onConfirm: async (finalInputValue) => {
        // Validation will be handled inside actual performDuplicate to keep this clean
        const nameToUse = finalInputValue || `${template.name} (Copy)`;
        performDuplicate(template, nameToUse);
      }
    });
  };

  const performDuplicate = async (template, newName) => {
    setModal(prev => ({ ...prev, isOpen: false }));
    setLoading(true);
    try {
      const newTemplateData = {
        ...template,
        name: newName,
        fileNameFormat: `${newName}_{date}`,
        createdAt: new Date().toISOString()
      };
      delete newTemplateData.id;

      await addDoc(collection(db, 'templates'), newTemplateData);
      fetchTemplates();
    } catch (err) {
      console.error('Duplicate error:', err);
      showError('Failed to duplicate the template.');
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (t.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="template-manager" style={{ paddingBottom: '40px' }}>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h1 className="page-title">Report Templates</h1>
          <p className="page-description">Manage and design your custom reporting structures.</p>
        </div>
        <button 
          onClick={() => navigate('/visual-mapper')} 
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px' }}
        >
          <Plus size={20} /> Create New Template
        </button>
      </header>

      {/* SEARCH BAR */}
      <div className="glass" style={{ padding: '16px 24px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Search size={20} color="var(--text-muted)" />
        <input 
          type="text" 
          placeholder="Search by template name or description..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '15px', flex: 1, outline: 'none' }}
        />
        <div style={{ padding: '4px 12px', background: 'var(--glass-bg)', borderRadius: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {filteredTemplates.length} {filteredTemplates.length === 1 ? 'Template' : 'Templates'}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '16px', color: 'var(--text-muted)' }}>
          <Loader2 className="spinner" size={40} />
          <p>Syncing Library...</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="glass" style={{ padding: '80px', textAlign: 'center' }}>
          <div className="login-logo-icon" style={{ width: '64px', height: '64px', margin: '0 auto 24px' }}>
            <Settings size={32} />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: '600' }}>No templates found</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px', maxWidth: '400px', margin: '8px auto 0' }}>
            {searchTerm ? `No results match "${searchTerm}". Try a different search.` : 'You haven\'t created any templates yet. Start by designing one in the Visual Mapper.'}
          </p>
          {!searchTerm && (
             <button onClick={() => navigate('/visual-mapper')} className="btn-primary" style={{ marginTop: '32px' }}>
               Open Visual Mapper
             </button>
          )}
        </div>
      ) : (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
           {filteredTemplates.map(template => (
             <div key={template.id} className="glass stat-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', transition: 'transform 0.2s', cursor: 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                   <div className="modern-icon-box" style={{ width: '48px', height: '48px', color: 'var(--primary)' }}>
                      <LayoutGrid size={24} />
                    </div>
                   <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => navigate(template.type === 'pivot' ? `/pivot-designer?id=${template.id}` : `/visual-mapper?id=${template.id}`)} 
                        className="modern-icon-box" 
                        style={{ padding: '8px', color: 'var(--primary)' }}
                        title="Edit Template"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDuplicate(template)} 
                        className="modern-icon-box" 
                        style={{ padding: '8px', color: 'var(--secondary)' }}
                        title="Duplicate Template"
                      >
                        <Copy size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(template.id)} 
                        className="modern-icon-box" 
                        style={{ padding: '8px', color: 'var(--error)' }}
                        title="Delete Template"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                </div>
                
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-main)' }}>{template.name}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px', lineHeight: '1.5', minHeight: '40px' }}>
                    {template.description || 'No description provided.'}
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--primary)', fontWeight: '600' }}>
                      <List size={14} /> {(template.mappings || []).length} Columns
                   </div>
                   <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ID: {template.id.slice(0, 8)}...
                   </span>
                </div>
             </div>
           ))}
        </div>
      )}

      <ModernModal 
        {...modal} 
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
        onInputChange={val => setModal(prev => ({ ...prev, inputValue: val }))}
      />
    </div>
  );
}
