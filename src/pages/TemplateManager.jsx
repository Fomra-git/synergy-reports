import React, { useState, useEffect, useMemo } from 'react';
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
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart2,
  Table2,
  Grid,
  Award
} from 'lucide-react';
import ModernModal from '../components/ModernModal';

const SORT_OPTIONS = [
  { value: 'name',     label: 'Name' },
  { value: 'created',  label: 'Date Added' },
  { value: 'modified', label: 'Last Modified' },
  { value: 'type',     label: 'Designer Type' },
  { value: 'category', label: 'Category' },
];

const TYPE_META = {
  pivot:       { label: 'Pivot',         color: 'var(--secondary)', Icon: BarChart2 },
  multi_table: { label: 'Multi-Table',   color: '#a78bfa',          Icon: Table2 },
  scoreboard:  { label: 'Scoreboard',    color: 'var(--warning)',    Icon: Award },
  default:     { label: 'Visual Mapper', color: 'var(--primary)',    Icon: LayoutGrid },
};

function getTypeMeta(type) {
  return TYPE_META[type] || TYPE_META.default;
}

function getEditRoute(template) {
  if (template.type === 'pivot')       return `/pivot-designer?id=${template.id}`;
  if (template.type === 'multi_table') return `/multi-table-designer?id=${template.id}`;
  if (template.type === 'scoreboard')  return `/scoreboard-designer?id=${template.id}`;
  return `/visual-mapper?id=${template.id}`;
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TemplateManager() {
  const navigate = useNavigate();
  const [templates, setTemplates]       = useState([]);
  const [categoryMap, setCategoryMap]   = useState({}); // templateId → categoryName
  const [loading, setLoading]           = useState(true);
  const [searchTerm, setSearchTerm]     = useState('');
  const [sortBy, setSortBy]             = useState('created');
  const [sortDir, setSortDir]           = useState('desc');

  const [modal, setModal] = useState({
    isOpen: false, title: '', message: '', type: 'info',
    mode: 'alert', confirmText: 'Confirm', onConfirm: null, inputValue: ''
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tplSnap, catSnap] = await Promise.all([
        getDocs(query(collection(db, 'templates'))),
        getDocs(query(collection(db, 'categories'))),
      ]);
      setTemplates(tplSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const map = {};
      catSnap.docs.forEach(d => {
        const cat = { id: d.id, ...d.data() };
        (cat.templateIds || []).forEach(tid => { map[tid] = cat.name || 'Unnamed'; });
      });
      setCategoryMap(map);
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
      type: 'danger', mode: 'confirm', confirmText: 'Delete Forever',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'templates', id));
          fetchAll();
          setModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error('Delete error:', err);
          showError('Could not delete the template. Please try again.');
        }
      }
    });
  };

  const showError = (msg) => {
    setModal({ isOpen: true, title: 'System Error', message: msg, type: 'danger', mode: 'alert', confirmText: 'Dismiss' });
  };

  const handleDuplicate = (template) => {
    setModal({
      isOpen: true,
      title: 'Duplicate Template',
      message: 'Enter a name for the new template copy:',
      type: 'info', mode: 'prompt', confirmText: 'Clone Template',
      inputValue: `${template.name} (Copy)`,
      onConfirm: async (finalInputValue) => {
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
      fetchAll();
    } catch (err) {
      console.error('Duplicate error:', err);
      showError('Failed to duplicate the template.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSortDir = () => setSortDir(d => d === 'asc' ? 'desc' : 'asc');

  const sortedFilteredTemplates = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    const filtered = templates.filter(t =>
      t.name.toLowerCase().includes(lower) ||
      (t.description || '').toLowerCase().includes(lower)
    );

    filtered.sort((a, b) => {
      let av, bv;
      switch (sortBy) {
        case 'name':
          av = (a.name || '').toLowerCase();
          bv = (b.name || '').toLowerCase();
          break;
        case 'created':
          av = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bv = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        case 'modified':
          av = (a.updatedAt || a.createdAt) ? new Date(a.updatedAt || a.createdAt).getTime() : 0;
          bv = (b.updatedAt || b.createdAt) ? new Date(b.updatedAt || b.createdAt).getTime() : 0;
          break;
        case 'type':
          av = getTypeMeta(a.type).label.toLowerCase();
          bv = getTypeMeta(b.type).label.toLowerCase();
          break;
        case 'category':
          av = (categoryMap[a.id] || 'zzz').toLowerCase();
          bv = (categoryMap[b.id] || 'zzz').toLowerCase();
          break;
        default:
          return 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [templates, searchTerm, sortBy, sortDir, categoryMap]);

  const SortIcon = sortDir === 'asc' ? ArrowUp : ArrowDown;

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

      {/* SEARCH + SORT BAR */}
      <div className="glass" style={{ padding: '12px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {/* Search */}
        <Search size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search by name or description..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '15px', flex: 1, minWidth: '160px', outline: 'none' }}
        />

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }} />

        {/* Sort label */}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort</span>

        {/* Sort field dropdown */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-main)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', outline: 'none'
          }}
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Asc / Desc toggle */}
        <button
          onClick={toggleSortDir}
          title={sortDir === 'asc' ? 'Ascending — click to reverse' : 'Descending — click to reverse'}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
            background: 'var(--glass-bg)', border: '1px solid var(--border)', borderRadius: '8px',
            color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
          }}
        >
          <SortIcon size={14} />
          {sortDir === 'asc' ? 'Asc' : 'Desc'}
        </button>

        {/* Count badge */}
        <div style={{ padding: '4px 12px', background: 'var(--glass-bg)', borderRadius: '20px', fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
          {sortedFilteredTemplates.length} {sortedFilteredTemplates.length === 1 ? 'Template' : 'Templates'}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '16px', color: 'var(--text-muted)' }}>
          <Loader2 className="spinner" size={40} />
          <p>Syncing Library...</p>
        </div>
      ) : sortedFilteredTemplates.length === 0 ? (
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
          {sortedFilteredTemplates.map(template => {
            const meta     = getTypeMeta(template.type);
            const TypeIcon = meta.Icon;
            const catName  = categoryMap[template.id];
            const addedOn  = formatDate(template.createdAt);
            const modOn    = formatDate(template.updatedAt);

            return (
              <div key={template.id} className="glass stat-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', transition: 'transform 0.2s', cursor: 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  {/* Type icon */}
                  <div className="modern-icon-box" style={{ width: '48px', height: '48px', color: meta.color }}>
                    <TypeIcon size={24} />
                  </div>
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => navigate(getEditRoute(template))}
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
                  {/* Type badge */}
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                      background: `${meta.color}22`, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em'
                    }}>
                      <TypeIcon size={10} /> {meta.label}
                    </span>
                    {catName && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px',
                        padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                        background: 'var(--glass-bg)', color: 'var(--text-muted)'
                      }}>
                        {catName}
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-main)' }}>{template.name}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px', lineHeight: '1.5', minHeight: '40px' }}>
                    {template.description || 'No description provided.'}
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--primary)', fontWeight: '600' }}>
                    <List size={14} /> {(template.mappings || template.pivotColumns || []).length} Columns
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    {modOn && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        Modified {modOn}
                      </span>
                    )}
                    {addedOn && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        Added {addedOn}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
