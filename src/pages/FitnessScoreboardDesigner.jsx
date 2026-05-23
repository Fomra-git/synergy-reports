import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, addDoc, doc, setDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import XLSX from 'xlsx-js-style';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Save, Trash2, Plus, ArrowLeft, Loader2, CheckCircle2,
  Settings2, Upload, X, Activity, Clock, Calendar,
  Building2, Users, Hash, Eye, Filter
} from 'lucide-react';
import ModernModal from '../components/ModernModal';
import SearchableDropdown from '../components/SearchableDropdown';
import MultiSelectCheckboxDropdown from '../components/MultiSelectCheckboxDropdown';

const DEFAULT_TIME_SLOTS = [
  { id: 'ts_1', label: '6am - 7am',  from: '06:00', to: '07:00' },
  { id: 'ts_2', label: '7am - 8am',  from: '07:00', to: '08:00' },
  { id: 'ts_3', label: '8am - 9am',  from: '08:00', to: '09:00' },
  { id: 'ts_4', label: '9am - 10am', from: '09:00', to: '10:00' },
  { id: 'ts_5', label: '4pm - 5pm',  from: '16:00', to: '17:00' },
  { id: 'ts_6', label: '5pm - 6pm',  from: '17:00', to: '18:00' },
  { id: 'ts_7', label: '6pm - 7pm',  from: '18:00', to: '19:00' },
  { id: 'ts_8', label: '7pm - 8pm',  from: '19:00', to: '20:00' },
];

const DEFAULT_PERIODS = [
  { id: 'p_1', label: '1 Month',   keyword: '1 month'   },
  { id: 'p_2', label: '3 Months',  keyword: '3 months'  },
  { id: 'p_3', label: '6 Months',  keyword: '6 months'  },
  { id: 'p_4', label: '12 Months', keyword: '12 months' },
];

const DEFAULT_FORM = {
  name: '',
  reportTitle: 'Fitness report',
  branchCol: '',
  clientCol: '',
  timeCol: '',
  categoryCol: '',
  dateCol: '',
  alternateDayPrefix: '3/',
  dailyDayPrefix: '5/',
  timeSlots: DEFAULT_TIME_SLOTS,
  periods: DEFAULT_PERIODS,
  preFilters: [],
  postFilters: [],
  hideEmptyBranches: false,
  hideEmptyRows: false,
};

export default function FitnessScoreboardDesigner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateIdFromUrl = searchParams.get('id');

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templateIdFromUrl || '');
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [masterHeaders, setMasterHeaders] = useState([]);
  const [masterColumnValues, setMasterColumnValues] = useState({});
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [rightTab, setRightTab] = useState('columns');
  const fileRef = useRef(null);

  const [modal, setModal] = useState({
    isOpen: false, title: '', message: '', type: 'info',
    mode: 'alert', confirmText: 'Confirm', onConfirm: null
  });

  useEffect(() => { fetchTemplates(); fetchCategories(); }, []);

  useEffect(() => {
    if (templates.length > 0 && templateIdFromUrl) loadTemplate(templateIdFromUrl);
  }, [templates, templateIdFromUrl]);

  const fetchCategories = async () => {
    try {
      const snap = await getDocs(collection(db, 'reportCategories'));
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'templates'));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTemplates(all.filter(t => t.type === 'fitness_scoreboard'));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadTemplate = (id) => {
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setFormData({ ...DEFAULT_FORM, ...t });
    setMasterHeaders(t.masterHeaders || []);
    setMasterColumnValues(t.masterColumnValues || {});
    setSelectedCategoryId(categories.find(c => (c.templateIds || []).includes(id))?.id || '');
  };

  const updateCategoryAssignment = async (templateId) => {
    const oldCat = categories.find(c => (c.templateIds || []).includes(templateId));
    if (oldCat?.id === selectedCategoryId) return;
    if (oldCat) await updateDoc(doc(db, 'reportCategories', oldCat.id), { templateIds: arrayRemove(templateId) });
    if (selectedCategoryId) await updateDoc(doc(db, 'reportCategories', selectedCategoryId), { templateIds: arrayUnion(templateId) });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setModal({ isOpen: true, title: 'Validation Error', message: 'Template name is required.', type: 'error', mode: 'alert', onConfirm: null });
      return;
    }
    setIsSaving(true);
    try {
      const payload = { ...formData, type: 'fitness_scoreboard', masterHeaders, masterColumnValues, updatedAt: new Date().toISOString() };
      if (selectedTemplateId) {
        await setDoc(doc(db, 'templates', selectedTemplateId), payload);
        await updateCategoryAssignment(selectedTemplateId);
      } else {
        const ref = await addDoc(collection(db, 'templates'), payload);
        setSelectedTemplateId(ref.id);
        await updateCategoryAssignment(ref.id);
      }
      setSaveStatus('Saved!');
      await fetchTemplates();
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      setModal({ isOpen: true, title: 'Save Error', message: err.message, type: 'error', mode: 'alert', onConfirm: null });
    } finally { setIsSaving(false); }
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
      } catch (err) { console.error(err); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Time slot management
  const addTimeSlot = () => {
    const id = `ts_${Date.now()}`;
    setFormData(p => ({ ...p, timeSlots: [...p.timeSlots, { id, label: 'New Slot', from: '00:00', to: '01:00' }] }));
  };
  const updateTimeSlot = (id, updates) =>
    setFormData(p => ({ ...p, timeSlots: p.timeSlots.map(ts => ts.id === id ? { ...ts, ...updates } : ts) }));
  const removeTimeSlot = (id) =>
    setFormData(p => ({ ...p, timeSlots: p.timeSlots.filter(ts => ts.id !== id) }));

  // Period management
  const addPeriod = () => {
    const id = `p_${Date.now()}`;
    setFormData(p => ({ ...p, periods: [...p.periods, { id, label: 'New Period', keyword: '' }] }));
  };
  const updatePeriod = (id, updates) =>
    setFormData(p => ({ ...p, periods: p.periods.map(per => per.id === id ? { ...per, ...updates } : per) }));
  const removePeriod = (id) =>
    setFormData(p => ({ ...p, periods: p.periods.filter(per => per.id !== id) }));

  // Pre-filter management
  const addPreFilter = () => {
    const id = `prf_${Date.now()}`;
    setFormData(p => ({ ...p, preFilters: [...(p.preFilters || []), { id, conditionCol: '', operator: '==', conditionVals: [] }] }));
  };
  const updatePreFilter = (id, updates) =>
    setFormData(p => ({ ...p, preFilters: (p.preFilters || []).map(f => f.id === id ? { ...f, ...updates } : f) }));
  const removePreFilter = (id) =>
    setFormData(p => ({ ...p, preFilters: (p.preFilters || []).filter(f => f.id !== id) }));

  // Post-filter (branch name) management
  const addPostFilter = () => {
    const id = `psf_${Date.now()}`;
    setFormData(p => ({ ...p, postFilters: [...(p.postFilters || []), { id, operator: 'contains', conditionVals: [] }] }));
  };
  const updatePostFilter = (id, updates) =>
    setFormData(p => ({ ...p, postFilters: (p.postFilters || []).map(f => f.id === id ? { ...f, ...updates } : f) }));
  const removePostFilter = (id) =>
    setFormData(p => ({ ...p, postFilters: (p.postFilters || []).filter(f => f.id !== id) }));

  if (loading) {
    return (
      <div className="loading-screen">
        <Loader2 className="spinner" size={32} /> Loading Fitness Scoreboard Designer...
      </div>
    );
  }

  const TOTAL_COLS = 2 + (formData.timeSlots || []).length * 2;
  const totalFilterBadge = (formData.preFilters || []).length + (formData.postFilters || []).length
    + (formData.hideEmptyBranches ? 1 : 0) + (formData.hideEmptyRows ? 1 : 0);

  return (
    <div style={{ padding: '0 20px', minHeight: 'calc(100vh - 100px)', color: 'var(--text-main)' }}>

      <header className="page-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button onClick={() => navigate('/templates')} className="btn-secondary"
                style={{ padding: '8px', borderRadius: '50%', background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
                <ArrowLeft size={18} />
              </button>
              <Activity size={32} color="var(--primary)" /> Fitness Scoreboard Designer
            </h1>
            <p className="page-description">Build fitness time-slot scoreboard with Alternate / Daily day breakdowns.</p>
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

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px', height: 'calc(100vh - 220px)' }}>

        {/* LEFT PANEL */}
        <div className="glass" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings2 size={16} color="var(--primary)" />
            <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Configuration</span>
          </div>
          <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <div className="form-group">
              <label>Load Existing Template</label>
              <select value={selectedTemplateId} onChange={e => {
                setSelectedTemplateId(e.target.value);
                if (e.target.value) loadTemplate(e.target.value);
                else { setFormData(DEFAULT_FORM); setMasterHeaders([]); setMasterColumnValues({}); setSelectedCategoryId(''); setRightTab('columns'); }
              }}>
                <option value="">+ Create New Fitness Scoreboard</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Template Name *</label>
              <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Fitness Score Board" />
            </div>

            <div className="form-group">
              <label>Report Category</label>
              <select value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)}>
                <option value="">— No Category —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Report Title</label>
              <input value={formData.reportTitle} onChange={e => setFormData(p => ({ ...p, reportTitle: e.target.value }))} placeholder="e.g. Fitness report" />
            </div>

            <div>
              <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--secondary)', marginBottom: '8px' }}>Column Detection</p>
              <button onClick={() => fileRef.current?.click()} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '11px', gap: '6px', width: '100%' }}>
                <Upload size={12} /> Load Sample File (Auto-detect Columns)
              </button>
              <input type="file" ref={fileRef} style={{ display: 'none' }} accept=".xlsx,.xls,.csv" onChange={handleSampleFile} />
              {masterHeaders.length > 0 && (
                <p style={{ fontSize: '10px', color: 'var(--success)', marginTop: '6px' }}>✓ {masterHeaders.length} columns detected</p>
              )}
            </div>

            <div style={{ padding: '14px', background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--secondary)' }}>Category Prefixes</p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ background: 'var(--primary)', color: '#fff', padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }}>A</span>
                  Alternate Days Prefix
                </label>
                <input value={formData.alternateDayPrefix} onChange={e => setFormData(p => ({ ...p, alternateDayPrefix: e.target.value }))}
                  placeholder="e.g. 3/" style={{ fontFamily: 'monospace', fontSize: '13px' }} />
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Categories containing this prefix (3/12, 3/36, …) → A column.</p>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ background: 'var(--secondary)', color: '#fff', padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }}>D</span>
                  Daily Days Prefix
                </label>
                <input value={formData.dailyDayPrefix} onChange={e => setFormData(p => ({ ...p, dailyDayPrefix: e.target.value }))}
                  placeholder="e.g. 5/" style={{ fontFamily: 'monospace', fontSize: '13px' }} />
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Categories containing this prefix (5/12, 5/36, …) → D column.</p>
              </div>
            </div>

            <div style={{ padding: '12px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Eye size={13} /> Output Preview
              </p>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.8', fontFamily: 'monospace', overflowX: 'auto' }}>
                <div>Branch | Period | {(formData.timeSlots || []).slice(0, 2).map(ts => `${ts.label} A|D`).join(' | ')}{(formData.timeSlots || []).length > 2 ? ' | ...' : ''}</div>
                <div style={{ color: 'var(--text-main)' }}>BranchA&nbsp;| 1 Month&nbsp;&nbsp;| 1(4)| 0(2) | ...</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;| 3 Months | 5(10)| 3(7) | ...</div>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>
                {TOTAL_COLS} total columns · {(formData.periods || []).length} period rows per branch
              </p>
            </div>

          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="glass" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
            {[
              { key: 'columns',   label: 'COLUMNS',    icon: <Hash size={13} /> },
              { key: 'timeslots', label: 'TIME SLOTS',  icon: <Clock size={13} />,    badge: (formData.timeSlots || []).length },
              { key: 'periods',   label: 'PERIODS',     icon: <Calendar size={13} />, badge: (formData.periods || []).length },
              { key: 'filters',   label: 'FILTERS',     icon: <Filter size={13} />,   badge: totalFilterBadge },
            ].map(tab => (
              <button key={tab.key} onClick={() => setRightTab(tab.key)} style={{
                flex: '1 1 0', padding: '13px 10px', fontSize: '10px', fontWeight: '700', border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: rightTab === tab.key ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: rightTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                borderBottom: rightTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              }}>
                {tab.icon} {tab.label}
                {tab.badge > 0 && (
                  <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '9px', fontWeight: '700' }}>{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

            {/* COLUMN MAPPING */}
            {rightTab === 'columns' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Excel Column Mappings</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Map each role to the corresponding column in your master Excel file.
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><Building2 size={11} /> Branch / Clinic Column</label>
                    <SearchableDropdown options={masterHeaders} value={formData.branchCol} onChange={val => setFormData(p => ({ ...p, branchCol: val }))} placeholder="Select column..." />
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Groups rows by branch (first column in output).</p>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={11} /> Client / Patient ID Column</label>
                    <SearchableDropdown options={masterHeaders} value={formData.clientCol} onChange={val => setFormData(p => ({ ...p, clientCol: val }))} placeholder="Select column..." />
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Unique patient identifier for counting.</p>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> Check-in Time Column</label>
                    <SearchableDropdown options={masterHeaders} value={formData.timeCol} onChange={val => setFormData(p => ({ ...p, timeCol: val }))} placeholder="Select column..." />
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Used to match rows to time slots.</p>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={11} /> Category Column</label>
                    <SearchableDropdown options={masterHeaders} value={formData.categoryCol} onChange={val => setFormData(p => ({ ...p, categoryCol: val }))} placeholder="Select column..." />
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Contains period keywords AND A/D prefixes (3/, 5/, …).</p>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={11} /> Date Column</label>
                    <SearchableDropdown options={masterHeaders} value={formData.dateCol} onChange={val => setFormData(p => ({ ...p, dateCol: val }))} placeholder="Select column..." />
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Latest date determines the "current" count.</p>
                  </div>
                </div>
                <div style={{ padding: '16px', background: 'rgba(99,102,241,0.05)', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--primary)' }}>How Cell Values Are Calculated</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.8' }}>
                    Each cell shows <strong>current(total)</strong> format (e.g. <strong>1(4)</strong>).<br />
                    <strong>Total</strong> = unique client IDs matching: branch + period keyword + A or D prefix + time slot.<br />
                    <strong>Current</strong> = unique client IDs on the <em>most recent date</em> in that matching set.
                  </p>
                </div>
              </div>
            )}

            {/* TIME SLOTS */}
            {rightTab === 'timeslots' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Time Slots</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Each slot produces an A and D sub-column pair. Times use 24-hour format.
                    </p>
                  </div>
                  <button onClick={addTimeSlot} className="btn-primary" style={{ padding: '10px 18px', fontSize: '12px', gap: '6px', flexShrink: 0 }}>
                    <Plus size={14} /> Add Slot
                  </button>
                </div>
                {(formData.timeSlots || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', border: '2px dashed var(--border)', borderRadius: '16px', color: 'var(--text-muted)' }}>
                    <Clock size={40} style={{ marginBottom: '16px', opacity: 0.3 }} />
                    <p style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>No time slots</p>
                    <p style={{ fontSize: '13px' }}>Click "Add Slot" to define check-in time ranges.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 40px', gap: '10px', padding: '4px 14px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Label (shown in header)</span>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>From</span>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>To (exclusive)</span>
                      <span />
                    </div>
                    {(formData.timeSlots || []).map(ts => (
                      <div key={ts.id} className="glass" style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 40px', gap: '10px', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '12px', alignItems: 'center' }}>
                        <input value={ts.label} onChange={e => updateTimeSlot(ts.id, { label: e.target.value })} placeholder="e.g. 6am - 7am" style={{ padding: '8px', fontSize: '12px' }} />
                        <input value={ts.from}  onChange={e => updateTimeSlot(ts.id, { from: e.target.value })}  placeholder="06:00" style={{ padding: '8px', fontSize: '12px', fontFamily: 'monospace', textAlign: 'center' }} />
                        <input value={ts.to}    onChange={e => updateTimeSlot(ts.id, { to: e.target.value })}    placeholder="07:00" style={{ padding: '8px', fontSize: '12px', fontFamily: 'monospace', textAlign: 'center' }} />
                        <button onClick={() => removeTimeSlot(ts.id)} className="btn-link" style={{ color: 'var(--error)', padding: '6px', display: 'flex', justifyContent: 'center' }}><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ padding: '12px 16px', background: 'rgba(99,102,241,0.05)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    A row's check-in time must be <strong>≥ From</strong> and <strong>&lt; To</strong> to be counted in that slot.
                  </p>
                </div>
              </div>
            )}

            {/* PERIODS */}
            {rightTab === 'periods' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Period Rows</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Each period becomes a row under each branch. The keyword is matched case-insensitively against the category column.
                    </p>
                  </div>
                  <button onClick={addPeriod} className="btn-primary" style={{ padding: '10px 18px', fontSize: '12px', gap: '6px', flexShrink: 0 }}>
                    <Plus size={14} /> Add Period
                  </button>
                </div>
                {(formData.periods || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', border: '2px dashed var(--border)', borderRadius: '16px', color: 'var(--text-muted)' }}>
                    <Calendar size={40} style={{ marginBottom: '16px', opacity: 0.3 }} />
                    <p style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>No periods</p>
                    <p style={{ fontSize: '13px' }}>Click "Add Period" to define period rows like "1 Month", "3 Months".</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 40px', gap: '10px', padding: '4px 14px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Row Label</span>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Category Keyword (contains match)</span>
                      <span />
                    </div>
                    {(formData.periods || []).map(per => (
                      <div key={per.id} className="glass" style={{ display: 'grid', gridTemplateColumns: '150px 1fr 40px', gap: '10px', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '12px', alignItems: 'center' }}>
                        <input value={per.label}   onChange={e => updatePeriod(per.id, { label: e.target.value })}   placeholder="e.g. 1 Month"  style={{ padding: '8px', fontSize: '12px' }} />
                        <input value={per.keyword} onChange={e => updatePeriod(per.id, { keyword: e.target.value })} placeholder="e.g. 1 month" style={{ padding: '8px', fontSize: '12px', fontFamily: 'monospace' }} />
                        <button onClick={() => removePeriod(per.id)} className="btn-link" style={{ color: 'var(--error)', padding: '6px', display: 'flex', justifyContent: 'center' }}><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ padding: '12px 16px', background: 'rgba(99,102,241,0.05)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    Keyword matching is case-insensitive. Example: <code>3 months</code> matches "3 Months Fitness", "Calesthenics 3 months 36", etc.
                  </p>
                </div>
              </div>
            )}

            {/* FILTERS */}
            {rightTab === 'filters' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

                {/* PRE-FILTERS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '10px', fontWeight: '700' }}>PRE</span>
                        Pre-Filters
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Applied to source data rows <strong>before</strong> counting — only matching rows are counted.
                      </p>
                    </div>
                    <button onClick={addPreFilter} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '11px', gap: '6px', flexShrink: 0 }}>
                      <Plus size={13} /> Add Rule
                    </button>
                  </div>

                  {masterHeaders.length === 0 && (
                    <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Load a sample file in the left panel first — this enables column selection and auto-populates value dropdowns.
                    </div>
                  )}
                  {(formData.preFilters || []).length === 0 ? (
                    <div style={{ padding: '20px', border: '1px dashed var(--border)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      No pre-filters — all source rows are included in counting.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(formData.preFilters || []).map(f => (
                        <div key={f.id} className="glass" style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                          <button onClick={() => removePreFilter(f.id)}
                            style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}>
                            <X size={14} />
                          </button>
                          <div className="form-group" style={{ marginBottom: '10px' }}>
                            <label style={{ fontSize: '10px' }}>Filter Column</label>
                            <SearchableDropdown
                              options={masterHeaders}
                              value={f.conditionCol}
                              onChange={v => updatePreFilter(f.id, { conditionCol: v, conditionVals: [] })}
                              placeholder="Select column..."
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <div style={{ flex: '0 0 120px' }}>
                              <label style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>Operator</label>
                              <select value={f.operator}
                                onChange={e => updatePreFilter(f.id, { operator: e.target.value, conditionVals: [] })}
                                style={{ padding: '8px', fontSize: '11px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', width: '100%' }}>
                                <option value="==">Equals</option>
                                <option value="!=">Not Equals</option>
                                <option value="contains">Contains</option>
                                <option value="not_contains">Not Contains</option>
                                <option value="between">Between</option>
                              </select>
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>Value(s)</label>
                              {f.operator === 'between' ? (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <input placeholder="Min" value={f.conditionVals?.[0] || ''}
                                    onChange={e => updatePreFilter(f.id, { conditionVals: [e.target.value, f.conditionVals?.[1] || ''] })}
                                    style={{ flex: 1, padding: '8px', fontSize: '11px' }} />
                                  <input placeholder="Max" value={f.conditionVals?.[1] || ''}
                                    onChange={e => updatePreFilter(f.id, { conditionVals: [f.conditionVals?.[0] || '', e.target.value] })}
                                    style={{ flex: 1, padding: '8px', fontSize: '11px' }} />
                                </div>
                              ) : f.conditionCol && masterColumnValues[f.conditionCol]?.length > 0 ? (
                                <MultiSelectCheckboxDropdown
                                  options={masterColumnValues[f.conditionCol]}
                                  values={f.conditionVals || []}
                                  onChange={vals => updatePreFilter(f.id, { conditionVals: vals })}
                                  placeholder="Select values..."
                                />
                              ) : (
                                <input placeholder="Value..." value={f.conditionVals?.[0] || ''}
                                  onChange={e => updatePreFilter(f.id, { conditionVals: e.target.value ? [e.target.value] : [] })}
                                  style={{ width: '100%', padding: '8px', fontSize: '11px' }} />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border)' }} />

                {/* POST-FILTERS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: 'var(--secondary)', color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '10px', fontWeight: '700' }}>POST</span>
                        Post-Filters
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Applied <strong>after</strong> counting — control which branches / rows appear in the output.
                      </p>
                    </div>
                    <button onClick={addPostFilter} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '11px', gap: '6px', flexShrink: 0 }}>
                      <Plus size={13} /> Add Branch Filter
                    </button>
                  </div>

                  {/* Toggle options */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                    <p style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--secondary)', marginBottom: '2px' }}>Output Visibility Toggles</p>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!formData.hideEmptyBranches}
                        onChange={e => setFormData(p => ({ ...p, hideEmptyBranches: e.target.checked }))} />
                      <span>Hide branches where <strong>all cells are 0(0)</strong> (no data for any time slot)</span>
                    </label>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!formData.hideEmptyRows}
                        onChange={e => setFormData(p => ({ ...p, hideEmptyRows: e.target.checked }))} />
                      <span>Hide period rows where <strong>all cells in that row are 0(0)</strong></span>
                    </label>
                  </div>

                  {/* Branch name filters */}
                  {(formData.postFilters || []).length === 0 ? (
                    <div style={{ padding: '20px', border: '1px dashed var(--border)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      No branch name filters — all branches are included in output.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Filter which branches appear by matching their name:</p>
                      {(formData.postFilters || []).map(f => (
                        <div key={f.id} className="glass" style={{ display: 'grid', gridTemplateColumns: '130px 1fr 36px', gap: '8px', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '12px', alignItems: 'center' }}>
                          <select value={f.operator}
                            onChange={e => updatePostFilter(f.id, { operator: e.target.value, conditionVals: [] })}
                            style={{ padding: '8px', fontSize: '11px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)' }}>
                            <option value="contains">Name contains</option>
                            <option value="not_contains">Name not contains</option>
                            <option value="==">Name equals</option>
                            <option value="!=">Name not equals</option>
                          </select>
                          <input
                            placeholder="e.g. Anna Nagar"
                            value={f.conditionVals?.[0] || ''}
                            onChange={e => updatePostFilter(f.id, { conditionVals: e.target.value ? [e.target.value] : [] })}
                            style={{ padding: '8px', fontSize: '12px' }}
                          />
                          <button onClick={() => removePostFilter(f.id)} className="btn-link" style={{ color: 'var(--error)', padding: '6px', display: 'flex', justifyContent: 'center' }}>
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.05)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.15)' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.7' }}>
                      <strong>Pre-filters</strong> narrow the data rows before counting begins (e.g. only include Fitness visit type).<br />
                      <strong>Post-filters</strong> control the output table: remove branches by name or hide rows/branches with zero activity.
                    </p>
                  </div>
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
