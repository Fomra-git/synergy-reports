import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, query, getDocs, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import XLSX from 'xlsx-js-style';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Save, Trash2, Plus, ArrowLeft, Loader2, CheckCircle2,
  Trophy, Settings2, ArrowUp, ArrowDown, Upload, X, Target,
  ChevronDown, ChevronRight, Users, Calendar, Hash, Building2,
  Stethoscope, Eye, Filter, Database
} from 'lucide-react';
import ModernModal from '../components/ModernModal';
import SearchableDropdown from '../components/SearchableDropdown';
import MultiSelectCheckboxDropdown from '../components/MultiSelectCheckboxDropdown';

const DEFAULT_FORM = {
  name: '',
  reportTitle: '',
  reportSubtitle: 'SCORE BOARD',
  reportTitleSource: 'static',
  reportTitleCell: 'A1',
  reportSubtitleSource: 'static',
  reportSubtitleCell: 'A2',
  nameColumn: '',
  dateColumn: '',
  branchColumn: '',
  aptNoColumn: '',
  appNoColumn: '',
  monthStartDay: 26,
  groups: [],
  branches: [],
  globalFilters: [],
  isGlobalFilterEnabled: true,
};

export default function ScoreboardDesigner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateIdFromUrl = searchParams.get('id');

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templateIdFromUrl || '');
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [masterHeaders, setMasterHeaders] = useState([]);
  const [masterColumnValues, setMasterColumnValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [rightTab, setRightTab] = useState('groups');
  const [expandedGroups, setExpandedGroups] = useState({});
  const fileRef = useRef(null);

  const [modal, setModal] = useState({
    isOpen: false, title: '', message: '', type: 'info',
    mode: 'alert', confirmText: 'Confirm', onConfirm: null
  });

  useEffect(() => { fetchTemplates(); }, []);

  useEffect(() => {
    if (templates.length > 0 && templateIdFromUrl) {
      loadTemplate(templateIdFromUrl);
    }
  }, [templates, templateIdFromUrl]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'templates')));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTemplates(all.filter(t => t.type === 'scoreboard'));
    } catch (err) {
      console.error('Fetch templates error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = (id) => {
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setFormData({ ...DEFAULT_FORM, ...t });
    if (t.masterHeaders) setMasterHeaders(t.masterHeaders);
    if (t.masterColumnValues) setMasterColumnValues(t.masterColumnValues);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setModal({ isOpen: true, title: 'Validation Error', message: 'Template name is required.', type: 'error', mode: 'alert', onConfirm: null });
      return;
    }
    setIsSaving(true);
    try {
      const payload = { ...formData, type: 'scoreboard', masterHeaders, masterColumnValues, updatedAt: new Date().toISOString() };
      if (selectedTemplateId) {
        await setDoc(doc(db, 'templates', selectedTemplateId), payload);
      } else {
        const ref = await addDoc(collection(db, 'templates'), payload);
        setSelectedTemplateId(ref.id);
      }
      setSaveStatus('Saved!');
      await fetchTemplates();
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      setModal({ isOpen: true, title: 'Save Error', message: err.message, type: 'error', mode: 'alert', onConfirm: null });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = () => {
    if (!selectedTemplateId) return;
    setModal({
      isOpen: true, title: 'Delete Template', type: 'warning', mode: 'confirm',
      message: `Are you sure you want to delete "${formData.name}"? This cannot be undone.`,
      confirmText: 'Delete', onConfirm: async () => {
        await deleteDoc(doc(db, 'templates', selectedTemplateId));
        setSelectedTemplateId('');
        setFormData(DEFAULT_FORM);
        setMasterHeaders([]);
        setMasterColumnValues({});
        await fetchTemplates();
        setModal(p => ({ ...p, isOpen: false }));
      }
    });
  };

  const handleSampleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (json.length > 0) {
          const headers = json[0].filter(Boolean).map(String);
          setMasterHeaders(headers);
          // Build unique values map per column
          const colVals = {};
          headers.forEach((h, idx) => {
            const vals = new Set();
            for (let r = 1; r < json.length; r++) {
              const v = json[r][idx];
              if (v !== undefined && v !== null && v !== '') vals.add(String(v).trim());
            }
            colVals[h] = [...vals].sort();
          });
          setMasterColumnValues(colVals);
        }
      } catch (err) {
        console.error('File read error:', err);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // --- GROUP MANAGEMENT ---
  const addGroup = () => {
    const id = `g_${Date.now()}`;
    setFormData(p => ({ ...p, groups: [...p.groups, { id, name: 'New Group', filterColumn: '', filterValue: '', columns: [] }] }));
    setExpandedGroups(p => ({ ...p, [id]: true }));
  };
  const updateGroup = (id, updates) =>
    setFormData(p => ({ ...p, groups: p.groups.map(g => g.id === id ? { ...g, ...updates } : g) }));
  const removeGroup = (id) =>
    setFormData(p => ({ ...p, groups: p.groups.filter(g => g.id !== id) }));
  const moveGroup = (idx, dir) => {
    const arr = [...formData.groups];
    const ni = idx + (dir === 'up' ? -1 : 1);
    if (ni < 0 || ni >= arr.length) return;
    [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
    setFormData(p => ({ ...p, groups: arr }));
  };

  // --- COLUMN MANAGEMENT ---
  const addColumn = (groupId) => {
    const id = `c_${Date.now()}`;
    setFormData(p => ({
      ...p,
      groups: p.groups.map(g => g.id === groupId
        ? { ...g, columns: [...g.columns, { id, name: 'New Column', displayMode: 'cumulative', isConsultationColumn: false, filterColumn: '', filterValue: '' }] }
        : g)
    }));
  };
  const updateColumn = (groupId, colId, updates) =>
    setFormData(p => ({
      ...p, groups: p.groups.map(g => g.id === groupId
        ? { ...g, columns: g.columns.map(c => c.id === colId ? { ...c, ...updates } : c) }
        : g)
    }));
  const removeColumn = (groupId, colId) =>
    setFormData(p => ({ ...p, groups: p.groups.map(g => g.id === groupId ? { ...g, columns: g.columns.filter(c => c.id !== colId) } : g) }));
  const moveColumn = (groupId, idx, dir) => {
    setFormData(p => ({
      ...p, groups: p.groups.map(g => {
        if (g.id !== groupId) return g;
        const cols = [...g.columns];
        const ni = idx + (dir === 'up' ? -1 : 1);
        if (ni < 0 || ni >= cols.length) return g;
        [cols[idx], cols[ni]] = [cols[ni], cols[idx]];
        return { ...g, columns: cols };
      })
    }));
  };

  // --- BRANCH MANAGEMENT ---
  const addBranch = () =>
    setFormData(p => ({ ...p, branches: [...p.branches, { id: `b_${Date.now()}`, nameContains: '', target: 0 }] }));
  const updateBranch = (id, updates) =>
    setFormData(p => ({ ...p, branches: p.branches.map(b => b.id === id ? { ...b, ...updates } : b) }));
  const removeBranch = (id) =>
    setFormData(p => ({ ...p, branches: p.branches.filter(b => b.id !== id) }));

  // --- FILTER MANAGEMENT ---
  const addGlobalFilter = () =>
    setFormData(p => ({ ...p, globalFilters: [...(p.globalFilters || []), { conditionCol: '', operator: '==', conditionVals: [] }] }));
  const removeGlobalFilter = (idx) =>
    setFormData(p => ({ ...p, globalFilters: (p.globalFilters || []).filter((_, i) => i !== idx) }));
  const updateGlobalFilter = (idx, field, value) =>
    setFormData(p => {
      const arr = [...(p.globalFilters || [])];
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...p, globalFilters: arr };
    });

  const modePreview = (mode) => {
    if (mode === 'triple') return '(3)(12)(8)';
    if (mode === 'cumulative') return '3(12)';
    return '3';
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <Loader2 className="spinner" size={32} /> Loading Score Board Designer...
      </div>
    );
  }

  return (
    <div style={{ padding: '0 20px', minHeight: 'calc(100vh - 100px)', color: 'var(--text-main)' }}>
      {/* PAGE HEADER */}
      <header className="page-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button onClick={() => navigate('/templates')} className="btn-secondary"
                style={{ padding: '8px', borderRadius: '50%', background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
                <ArrowLeft size={18} />
              </button>
              <Trophy size={32} color="var(--primary)" /> Score Board Designer
            </h1>
            <p className="page-description">Build complex multi-group patient activity tracking reports (daily score board).</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {selectedTemplateId && (
              <button onClick={handleDeleteTemplate} className="btn-secondary"
                style={{ padding: '12px 20px', gap: '8px', color: 'var(--error)', border: '1px solid var(--error)' }}>
                <Trash2 size={18} /> Delete
              </button>
            )}
            <button onClick={handleSave} disabled={isSaving} className="btn-primary modern-icon-box"
              style={{ minWidth: '160px', padding: '12px 24px', gap: '8px', background: 'var(--primary)', color: 'white' }}>
              {isSaving ? <Loader2 className="spinner" size={18} /> : (saveStatus ? <CheckCircle2 size={18} /> : <Save size={18} />)}
              {saveStatus || (selectedTemplateId ? 'Update Template' : 'Save Template')}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px', height: 'calc(100vh - 220px)' }}>

        {/* LEFT PANEL */}
        <div className="glass" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings2 size={16} color="var(--primary)" />
            <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Configuration</span>
          </div>
          <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Load Template */}
            <div className="form-group">
              <label>Load Existing Template</label>
              <select value={selectedTemplateId} onChange={e => { setSelectedTemplateId(e.target.value); if (e.target.value) loadTemplate(e.target.value); else { setFormData(DEFAULT_FORM); setMasterHeaders([]); } }}>
                <option value="">+ Create New Score Board</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Template Name *</label>
              <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Daily Score Board" />
            </div>

            {/* Report Header */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '2px' }}>Report Header Text</p>

              {/* Title row */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '11px', margin: 0 }}>Title</label>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {['static', 'cell'].map(src => (
                      <button key={src} onClick={() => setFormData(p => ({ ...p, reportTitleSource: src }))}
                        style={{
                          padding: '2px 8px', fontSize: '10px', fontWeight: '600', borderRadius: '6px', cursor: 'pointer',
                          border: '1px solid var(--border)',
                          background: formData.reportTitleSource === src ? 'var(--primary)' : 'transparent',
                          color: formData.reportTitleSource === src ? '#fff' : 'var(--text-muted)',
                        }}>
                        {src === 'static' ? 'Static' : 'From Cell'}
                      </button>
                    ))}
                  </div>
                </div>
                {formData.reportTitleSource === 'cell' ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      value={formData.reportTitleCell}
                      onChange={e => setFormData(p => ({ ...p, reportTitleCell: e.target.value.toUpperCase() }))}
                      placeholder="e.g. A1"
                      style={{ fontSize: '12px', padding: '8px', flex: 1, fontFamily: 'monospace', letterSpacing: '0.05em' }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>cell ref</span>
                  </div>
                ) : (
                  <input value={formData.reportTitle} onChange={e => setFormData(p => ({ ...p, reportTitle: e.target.value }))} placeholder="e.g. SYNERGY HEALTHCARE AND WELLNESS" style={{ fontSize: '12px', padding: '8px' }} />
                )}
              </div>

              {/* Subtitle row */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '11px', margin: 0 }}>Subtitle</label>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {['static', 'cell'].map(src => (
                      <button key={src} onClick={() => setFormData(p => ({ ...p, reportSubtitleSource: src }))}
                        style={{
                          padding: '2px 8px', fontSize: '10px', fontWeight: '600', borderRadius: '6px', cursor: 'pointer',
                          border: '1px solid var(--border)',
                          background: formData.reportSubtitleSource === src ? 'var(--primary)' : 'transparent',
                          color: formData.reportSubtitleSource === src ? '#fff' : 'var(--text-muted)',
                        }}>
                        {src === 'static' ? 'Static' : 'From Cell'}
                      </button>
                    ))}
                  </div>
                </div>
                {formData.reportSubtitleSource === 'cell' ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      value={formData.reportSubtitleCell}
                      onChange={e => setFormData(p => ({ ...p, reportSubtitleCell: e.target.value.toUpperCase() }))}
                      placeholder="e.g. A2"
                      style={{ fontSize: '12px', padding: '8px', flex: 1, fontFamily: 'monospace', letterSpacing: '0.05em' }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>cell ref</span>
                  </div>
                ) : (
                  <input value={formData.reportSubtitle} onChange={e => setFormData(p => ({ ...p, reportSubtitle: e.target.value }))} placeholder="e.g. SCORE BOARD" style={{ fontSize: '12px', padding: '8px' }} />
                )}
              </div>

              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                💡 "From Cell" reads the exact cell value from the master Excel when generating (e.g., A1 = first cell).
              </p>
            </div>

            {/* Sample File Upload */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--secondary)', marginBottom: '8px' }}>Master Column Mapping</p>
              <button onClick={() => fileRef.current?.click()} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '11px', gap: '6px', width: '100%' }}>
                <Upload size={12} /> Load Sample Master File (to Auto-detect Columns)
              </button>
              <input type="file" ref={fileRef} style={{ display: 'none' }} accept=".xlsx,.xls,.csv" onChange={handleSampleFile} />
              {masterHeaders.length > 0 && (
                <p style={{ fontSize: '10px', color: 'var(--success)', marginTop: '6px' }}>✓ {masterHeaders.length} columns detected from sample file</p>
              )}
            </div>

            {/* Column Mapping */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={11} /> Doctor / Therapist Name Column</label>
                <SearchableDropdown options={masterHeaders} value={formData.nameColumn} onChange={val => setFormData(p => ({ ...p, nameColumn: val }))} placeholder="Select column..." />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={11} /> Date Column</label>
                <SearchableDropdown options={masterHeaders} value={formData.dateColumn} onChange={val => setFormData(p => ({ ...p, dateColumn: val }))} placeholder="Select column..." />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><Building2 size={11} /> Branch / Clinic Name Column</label>
                <SearchableDropdown options={masterHeaders} value={formData.branchColumn} onChange={val => setFormData(p => ({ ...p, branchColumn: val }))} placeholder="Select column..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px' }}><Hash size={10} /> Appt. No. Column</label>
                  <SearchableDropdown options={masterHeaders} value={formData.aptNoColumn} onChange={val => setFormData(p => ({ ...p, aptNoColumn: val }))} placeholder="Col..." />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px' }}><Hash size={10} /> App No. Column</label>
                  <SearchableDropdown options={masterHeaders} value={formData.appNoColumn} onChange={val => setFormData(p => ({ ...p, appNoColumn: val }))} placeholder="Col..." />
                </div>
              </div>
            </div>

            {/* Month Config */}
            <div style={{ padding: '12px', background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '10px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <Calendar size={12} /> Month Configuration
              </p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '11px' }}>Month Start Day</label>
                <input type="number" min={1} max={31} value={formData.monthStartDay}
                  onChange={e => setFormData(p => ({ ...p, monthStartDay: parseInt(e.target.value) || 26 }))}
                  style={{ padding: '8px', fontSize: '12px' }} />
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                E.g., "26" means: 26-March to 25-April = one month period for Actual calculation.
              </p>
            </div>

          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="glass" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              { key: 'groups', label: 'GROUPS & COLUMNS', icon: <Stethoscope size={15} /> },
              { key: 'branches', label: 'BRANCH TARGETS', icon: <Target size={15} /> },
              { key: 'filters', label: 'FILTERS', icon: <Filter size={15} />, badge: (formData.globalFilters?.length || 0) },
            ].map(tab => (
              <button key={tab.key} onClick={() => setRightTab(tab.key)} style={{
                flex: 1, padding: '14px', fontSize: '11px', fontWeight: '700', border: 'none', cursor: 'pointer',
                background: rightTab === tab.key ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: rightTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                borderBottom: rightTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent'
              }}>
                {tab.icon} {tab.label}
                {tab.badge > 0 && (
                  <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px', fontWeight: '700' }}>{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

            {/* ===================== GROUPS TAB ===================== */}
            {rightTab === 'groups' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Visit Type Groups</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Add major sections like "Out Patient", "House Visit", "Online". Each has sub-columns.
                    </p>
                  </div>
                  <button onClick={addGroup} className="btn-primary" style={{ padding: '10px 18px', fontSize: '12px', gap: '6px', flexShrink: 0 }}>
                    <Plus size={14} /> Add Group
                  </button>
                </div>

                {formData.groups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 32px', border: '2px dashed var(--border)', borderRadius: '16px', color: 'var(--text-muted)' }}>
                    <Trophy size={40} style={{ marginBottom: '16px', opacity: 0.3 }} />
                    <p style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>No groups yet</p>
                    <p style={{ fontSize: '13px' }}>Click "Add Group" to create sections like Out Patient, House Visit, Online.</p>
                  </div>
                ) : (
                  formData.groups.map((group, gIdx) => (
                    <div key={group.id} className="glass" style={{ border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                      {/* Group Header Row */}
                      <div style={{ padding: '14px 20px', background: 'rgba(99,102,241,0.07)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={() => setExpandedGroups(p => ({ ...p, [group.id]: !p[group.id] }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: '2px' }}>
                          {expandedGroups[group.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                        <input
                          value={group.name}
                          onChange={e => updateGroup(group.id, { name: e.target.value })}
                          style={{ fontWeight: '700', fontSize: '14px', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--border)', color: 'var(--text-main)', padding: '2px 4px', flex: 1 }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--glass-bg)', padding: '3px 10px', borderRadius: '20px', border: '1px solid var(--border)' }}>
                          {group.columns?.length || 0} cols
                        </span>
                        <div style={{ display: 'flex', gap: '2px' }}>
                          <button onClick={() => moveGroup(gIdx, 'up')} disabled={gIdx === 0} className="btn-link" style={{ padding: '4px 6px' }}><ArrowUp size={14} /></button>
                          <button onClick={() => moveGroup(gIdx, 'down')} disabled={gIdx === formData.groups.length - 1} className="btn-link" style={{ padding: '4px 6px' }}><ArrowDown size={14} /></button>
                          <button onClick={() => removeGroup(group.id)} className="btn-link" style={{ color: 'var(--error)', padding: '4px 6px', marginLeft: '4px' }}><X size={14} /></button>
                        </div>
                      </div>

                      {expandedGroups[group.id] && (
                        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {/* Group Filter Condition */}
                          <div style={{ padding: '12px 14px', background: 'var(--glass-subtle)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            <p style={{ fontSize: '10px', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Group Filter (rows that belong to this group)</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '10px' }}>Filter Column</label>
                                <SearchableDropdown options={masterHeaders} value={group.filterColumn} onChange={val => updateGroup(group.id, { filterColumn: val })} placeholder="e.g., Visit Mode" />
                              </div>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '10px' }}>Filter Value(s)</label>
                                {group.filterColumn && masterColumnValues[group.filterColumn]?.length > 0 ? (
                                  <MultiSelectCheckboxDropdown
                                    options={masterColumnValues[group.filterColumn]}
                                    values={group.filterValues || []}
                                    onChange={vals => updateGroup(group.id, { filterValues: vals })}
                                    placeholder="Select values..."
                                  />
                                ) : (
                                  <input
                                    value={group.filterValues?.[0] || ''}
                                    onChange={e => updateGroup(group.id, { filterValues: e.target.value ? [e.target.value] : [] })}
                                    placeholder="Type value..."
                                    style={{ padding: '8px', fontSize: '12px' }}
                                  />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Sub-columns */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <p style={{ fontSize: '12px', fontWeight: '600' }}>Sub-Columns</p>
                              <button onClick={() => addColumn(group.id)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', gap: '4px' }}>
                                <Plus size={12} /> Add Column
                              </button>
                            </div>

                            {(group.columns || []).length === 0 ? (
                              <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 16px', border: '1px dashed var(--border)', borderRadius: '10px' }}>
                                No sub-columns. Add columns like Consultation, Review, Treatment, etc.
                              </p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {(group.columns || []).map((col, cIdx) => (
                                  <div key={col.id} style={{ padding: '14px', background: 'var(--glass-bg)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                                    {/* Column Name Row */}
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                                      <input
                                        value={col.name}
                                        onChange={e => updateColumn(group.id, col.id, { name: e.target.value })}
                                        style={{ fontWeight: '600', fontSize: '13px', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--border)', color: 'var(--text-main)', padding: '2px 4px', flex: 1 }}
                                        placeholder="Column Name"
                                      />
                                      <button onClick={() => moveColumn(group.id, cIdx, 'up')} disabled={cIdx === 0} className="btn-link" style={{ padding: '3px 5px' }}><ArrowUp size={12} /></button>
                                      <button onClick={() => moveColumn(group.id, cIdx, 'down')} disabled={cIdx === (group.columns || []).length - 1} className="btn-link" style={{ padding: '3px 5px' }}><ArrowDown size={12} /></button>
                                      <button onClick={() => removeColumn(group.id, col.id)} className="btn-link" style={{ color: 'var(--error)', padding: '3px 5px' }}><X size={12} /></button>
                                    </div>

                                    {/* Column Config Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                      <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: '10px' }}>Filter Column</label>
                                        <SearchableDropdown options={masterHeaders} value={col.filterColumn} onChange={val => updateColumn(group.id, col.id, { filterColumn: val })} placeholder="Master column..." />
                                      </div>
                                      <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: '10px' }}>Filter Value(s)</label>
                                        {col.filterColumn && masterColumnValues[col.filterColumn]?.length > 0 ? (
                                          <MultiSelectCheckboxDropdown
                                            options={masterColumnValues[col.filterColumn]}
                                            values={col.filterValues || []}
                                            onChange={vals => updateColumn(group.id, col.id, { filterValues: vals })}
                                            placeholder="Select values..."
                                          />
                                        ) : (
                                          <input
                                            value={col.filterValues?.[0] || ''}
                                            onChange={e => updateColumn(group.id, col.id, { filterValues: e.target.value ? [e.target.value] : [] })}
                                            placeholder="Type value..."
                                            style={{ padding: '7px', fontSize: '11px' }}
                                          />
                                        )}
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                      <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                                        <label style={{ fontSize: '10px' }}>Display Mode</label>
                                        <select value={col.displayMode} onChange={e => updateColumn(group.id, col.id, { displayMode: e.target.value })}
                                          style={{ padding: '7px', fontSize: '11px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-main)', width: '100%' }}>
                                          <option value="triple">(Cur)(Total)(Con) — Triple Bracket</option>
                                          <option value="cumulative">Cur(Total) — Cumulative</option>
                                          <option value="single">Cur Only — Single Count</option>
                                        </select>
                                      </div>
                                      <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flexShrink: 0, marginTop: '14px' }}>
                                        <input type="checkbox" checked={col.isConsultationColumn || false}
                                          onChange={e => updateColumn(group.id, col.id, { isConsultationColumn: e.target.checked })} />
                                        Count in Branch
                                      </label>
                                    </div>

                                    {/* Preview */}
                                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'rgba(99,102,241,0.06)', borderRadius: '6px' }}>
                                      <Eye size={11} color="var(--primary)" />
                                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Cell preview: </span>
                                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'monospace' }}>{modePreview(col.displayMode)}</span>
                                      {col.isConsultationColumn && <span style={{ fontSize: '10px', color: 'var(--success)', marginLeft: 'auto' }}>✓ Counted in Branch Total</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ===================== BRANCHES TAB ===================== */}
            {rightTab === 'branches' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Branch / Clinic Targets</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Map each clinic's name pattern to its monthly target. Uses "contains" matching (case-insensitive).
                    </p>
                  </div>
                  <button onClick={addBranch} className="btn-primary" style={{ padding: '10px 18px', fontSize: '12px', gap: '6px' }}>
                    <Plus size={14} /> Add Branch
                  </button>
                </div>

                {formData.branches.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 32px', border: '2px dashed var(--border)', borderRadius: '16px', color: 'var(--text-muted)' }}>
                    <Target size={40} style={{ marginBottom: '16px', opacity: 0.3 }} />
                    <p style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>No branches configured</p>
                    <p style={{ fontSize: '13px' }}>Click "Add Branch" to set monthly targets for each clinic.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Table Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 44px', gap: '12px', padding: '8px 14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Clinic Name Contains</span>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Monthly Target</span>
                      <span />
                    </div>
                    {formData.branches.map(b => (
                      <div key={b.id} className="glass" style={{ display: 'grid', gridTemplateColumns: '1fr 160px 44px', gap: '12px', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', alignItems: 'center' }}>
                        <input
                          value={b.nameContains}
                          onChange={e => updateBranch(b.id, { nameContains: e.target.value })}
                          placeholder="e.g., Anna Nagar, Vepery..."
                          style={{ padding: '9px 12px', fontSize: '13px' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Target size={14} color="var(--primary)" style={{ flexShrink: 0 }} />
                          <input
                            type="number" min={0}
                            value={b.target}
                            onChange={e => updateBranch(b.id, { target: parseInt(e.target.value) || 0 })}
                            style={{ padding: '9px 12px', fontSize: '13px', textAlign: 'right', flex: 1 }}
                          />
                        </div>
                        <button onClick={() => removeBranch(b.id)} className="btn-link" style={{ color: 'var(--error)', padding: '6px', display: 'flex', justifyContent: 'center' }}>
                          <X size={16} />
                        </button>
                      </div>
                    ))}

                    {/* Info Panel */}
                    <div style={{ padding: '14px', background: 'rgba(99,102,241,0.05)', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.15)' }}>
                      <p style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--primary)' }}>How Branch Target Works</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                        <strong>Cur</strong> = Today's total consultations (all groups, columns marked "Count in Branch")<br />
                        <strong>Actual</strong> = Target × (Days Elapsed / Days in Month Period)<br />
                        <strong>Target</strong> = The value you set here, matched by clinic name.<br />
                        <em>E.g., "Anna Nagar" matches "ANNANAGAR Branch", "Anna Nagar Clinic", etc.</em>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===================== FILTERS TAB ===================== */}
            {rightTab === 'filters' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                    <Database size={17} /> Master Data Filters
                  </h4>
                  <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.isGlobalFilterEnabled !== false}
                      onChange={e => setFormData(p => ({ ...p, isGlobalFilterEnabled: e.target.checked }))} />
                    Enabled
                  </label>
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-16px' }}>
                  Applied <strong>before</strong> any score calculation — only matching rows are counted.
                </p>

                {formData.isGlobalFilterEnabled !== false && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(formData.globalFilters || []).map((f, i) => (
                      <div key={i} className="glass" style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                        <button onClick={() => removeGlobalFilter(i)}
                          style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '2px' }}>
                          <X size={14} />
                        </button>

                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '10px' }}>Filter Column</label>
                          <SearchableDropdown
                            options={masterHeaders}
                            value={f.conditionCol}
                            onChange={v => { updateGlobalFilter(i, 'conditionCol', v); updateGlobalFilter(i, 'conditionVals', []); }}
                            placeholder="Select column..."
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <div style={{ flex: '0 0 110px' }}>
                            <label style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>Operator</label>
                            <select value={f.operator}
                              onChange={e => { updateGlobalFilter(i, 'operator', e.target.value); updateGlobalFilter(i, 'conditionVals', []); }}
                              style={{ padding: '8px', fontSize: '12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', width: '100%' }}>
                              <option value="==">Equals</option>
                              <option value="!=">Not Equals</option>
                              <option value="contains">Contains</option>
                              <option value="between">Between</option>
                            </select>
                          </div>

                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>Value(s)</label>
                            {f.operator === 'between' ? (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <input placeholder="Min" value={f.conditionVals?.[0] || ''}
                                  onChange={e => updateGlobalFilter(i, 'conditionVals', [e.target.value, f.conditionVals?.[1] || ''])}
                                  style={{ flex: 1, padding: '8px', fontSize: '12px' }} />
                                <input placeholder="Max" value={f.conditionVals?.[1] || ''}
                                  onChange={e => updateGlobalFilter(i, 'conditionVals', [f.conditionVals?.[0] || '', e.target.value])}
                                  style={{ flex: 1, padding: '8px', fontSize: '12px' }} />
                              </div>
                            ) : (
                              f.conditionCol && masterColumnValues[f.conditionCol]?.length > 0 ? (
                                <MultiSelectCheckboxDropdown
                                  options={masterColumnValues[f.conditionCol]}
                                  values={f.conditionVals || []}
                                  onChange={vals => updateGlobalFilter(i, 'conditionVals', vals)}
                                  placeholder="Select values..."
                                />
                              ) : (
                                <input placeholder="Value..." value={f.conditionVals?.[0] || ''}
                                  onChange={e => updateGlobalFilter(i, 'conditionVals', e.target.value ? [e.target.value] : [])}
                                  style={{ width: '100%', padding: '8px', fontSize: '12px' }} />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    <button onClick={addGlobalFilter} className="btn-secondary"
                      style={{ width: '100%', padding: '12px', fontSize: '12px', borderStyle: 'dashed', gap: '6px' }}>
                      <Plus size={14} /> Add Filter Rule
                    </button>
                  </div>
                )}

                {(formData.globalFilters?.length === 0 || !formData.isGlobalFilterEnabled) && (
                  <div style={{ textAlign: 'center', padding: '40px 24px', border: '2px dashed var(--border)', borderRadius: '16px', color: 'var(--text-muted)' }}>
                    <Filter size={36} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <p style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>No filters active</p>
                    <p style={{ fontSize: '12px' }}>All master data rows will be included in the score board.</p>
                  </div>
                )}

                <div style={{ padding: '14px', background: 'rgba(99,102,241,0.05)', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--primary)' }}>How Global Filters Work</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.7' }}>
                    <strong>Equals / Not Equals</strong> — exact match (multi-select values)<br />
                    <strong>Contains</strong> — substring match<br />
                    <strong>Between</strong> — Min ≤ value ≤ Max<br />
                    <em>Multiple rules are combined with AND logic.</em>
                  </p>
                </div>

              </div>
            )}

          </div>
        </div>

      </div>

      <ModernModal modal={modal} setModal={setModal} />
    </div>
  );
}
