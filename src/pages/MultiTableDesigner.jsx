import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, query, getDocs, addDoc, updateDoc, doc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import {
  Plus, Trash2, Save, ArrowLeft, CheckCircle2, Loader2, Upload,
  Layers, Filter, Settings2, Database, Calculator, BarChart4,
  ArrowUp, ArrowDown, AlignJustify, Columns, Table as TableIcon, Calendar,
  X, Sparkles, List, Keyboard
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SearchableDropdown from '../components/SearchableDropdown';
import ModernModal from '../components/ModernModal';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import ChartConfigPanel from '../components/ChartConfigPanel';
import ConstantCheckPanel from '../components/ConstantCheckPanel';

const OPERATORS = ['==', '!=', 'contains', 'not_contains', '>', '<', '>=', '<=', 'between', 'unique'];

const emptySection = () => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  title: 'New Table',
  rowField: '',
  colField: '',
  rowFieldTransforms: { findText: '', replaceWith: '', simplifyDate: false, normalizeMonth: false, normalizeWeek: false },
  colFieldTransforms: { findText: '', replaceWith: '', simplifyDate: false, normalizeMonth: false, normalizeWeek: false },
  pivotColumns: [],
  globalFilters: [],
  outputFilters: [],
  isGlobalFilterEnabled: true,
  isOutputFilterEnabled: true,
  isPivotSummaryEnabled: false,
  isRowTotalEnabled: false,
  isFlatList: false,
});

const emptyForm = () => ({
  name: '',
  description: '',
  type: 'multi_table',
  layout: 'vertical',
  fileNameFormat: 'Multi_Report_{date}',
  isHeaderEnabled: false,
  headerConfig: { type: 'custom', text: '', sourceCol: '' },
  sections: [emptySection()],
  chartConfigs: [],
});

function normaliseSection(s) {
  return {
    ...emptySection(),
    ...s,
    id: s.id || Date.now().toString() + Math.random().toString(36).slice(2),
    pivotColumns: (s.pivotColumns || []).map(c => ({
      id: c.id || Date.now().toString(),
      type: c.type || 'aggregation',
      displayName: c.displayName || '',
      source: c.source || '',
      operation: c.operation || 'count',
      formula: c.formula || '',
      showTotal: c.showTotal !== false,
      hideInReport: !!c.hideInReport,
      rowFilters: c.rowFilters || [],
      valueFilters: c.valueFilters || [],
      isUniqueCount: !!c.isUniqueCount,
      dedupColumn: c.dedupColumn || '',
      roundOff: !!c.roundOff,
      roundDecimals: c.roundDecimals ?? 0,
      findText: c.findText || '',
      replaceWith: c.replaceWith || '',
      simplifyDate: !!c.simplifyDate,
      simplifyTime: !!c.simplifyTime,
      normalizeMonth: !!c.normalizeMonth,
      normalizeWeek: !!c.normalizeWeek,
      groupByCol: c.groupByCol || '',
    })),
    globalFilters: (s.globalFilters || []).map(f => ({ conditionCol: '', operator: '==', conditionVals: [], isManual: false, ...f })),
    outputFilters: (s.outputFilters || []).map(f => ({ conditionCol: '', operator: '==', conditionVals: [], isManual: false, ...f })),
  };
}

export default function MultiTableDesigner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateIdFromUrl = searchParams.get('id');

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [masterHeaders, setMasterHeaders] = useState([]);
  const [masterUniqueValues, setMasterUniqueValues] = useState({});
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [activeTab, setActiveTab] = useState('setup');
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [formData, setFormData] = useState(emptyForm());
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info', mode: 'alert', confirmText: 'OK', onConfirm: null });

  const fileInputRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [tplSnap, catSnap] = await Promise.all([
          getDocs(query(collection(db, 'templates'))),
          getDocs(collection(db, 'reportCategories')),
        ]);
        setTemplates(tplSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.type === 'multi_table'));
        setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) { console.error('Error loading data:', err); }
      finally { setLoading(false); }
    };
    init();
  }, []);

  const fetchCategories = async () => {
    try {
      const snap = await getDocs(collection(db, 'reportCategories'));
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error('Error fetching categories:', err); }
  };

  useEffect(() => {
    if (templates.length > 0 && templateIdFromUrl) {
      const t = templates.find(t => t.id === templateIdFromUrl);
      if (t) { setSelectedTemplateId(templateIdFromUrl); loadTemplate(templateIdFromUrl); }
    }
  }, [templates, templateIdFromUrl]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'templates')));
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.type === 'multi_table'));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const loadTemplate = (id) => {
    if (!id) { setFormData(emptyForm()); setActiveSectionIdx(0); setSelectedCategoryId(''); return; }
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setFormData({ ...emptyForm(), ...t, sections: (t.sections?.length ? t.sections : [emptySection()]).map(normaliseSection), chartConfigs: t.chartConfigs || [] });
    setActiveSectionIdx(0);
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
      setModal({ isOpen: true, title: 'Name Required', message: 'Please enter a template name.', type: 'warning', mode: 'alert', confirmText: 'OK' });
      return;
    }
    setIsSaving(true); setSaveStatus('Saving...');
    try {
      const payload = { ...formData, updatedAt: new Date().toISOString() };
      if (selectedTemplateId) {
        await updateDoc(doc(db, 'templates', selectedTemplateId), payload);
        await updateCategoryAssignment(selectedTemplateId);
      } else {
        const ref = await addDoc(collection(db, 'templates'), { ...payload, createdAt: new Date().toISOString() });
        setSelectedTemplateId(ref.id);
        await updateCategoryAssignment(ref.id);
      }
      setSaveStatus('Saved!'); fetchTemplates(); setTimeout(() => setSaveStatus(''), 3000);
    } catch (e) { console.error(e); setSaveStatus('Error'); } finally { setIsSaving(false); }
  };

  const handleDelete = () => {
    if (!selectedTemplateId) return;
    setModal({
      isOpen: true, title: 'Delete Template', type: 'danger', mode: 'confirm', confirmText: 'Delete',
      message: 'Delete this multi-table template? This cannot be undone.',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'templates', selectedTemplateId));
        setSelectedTemplateId(''); setFormData(emptyForm()); fetchTemplates();
      }
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const headerRow = rows.find(r => r.filter(c => c).length > 2) || rows[0] || [];
      const headers = headerRow.map(h => String(h || '').trim()).filter(Boolean);
      setMasterHeaders(headers);
      const json = XLSX.utils.sheet_to_json(ws);
      const uniques = {};
      headers.forEach(h => {
        uniques[h] = [...new Set(json.map(r => r[h]).filter(v => v !== undefined && v !== null && v !== ''))].slice(0, 100).map(String);
      });
      setMasterUniqueValues(uniques);
    } catch (e) { console.error(e); }
    e.target.value = '';
  };

  // ── Section helpers ─────────────────────────────────────────
  const activeSection = formData.sections[activeSectionIdx] || null;

  const updateSection = (field, value) => setFormData(prev => ({
    ...prev,
    sections: prev.sections.map((s, i) => i === activeSectionIdx ? { ...s, [field]: value } : s)
  }));

  const addSection = () => {
    const ns = emptySection();
    setFormData(prev => ({ ...prev, sections: [...prev.sections, ns] }));
    setActiveSectionIdx(formData.sections.length);
    setActiveTab('setup');
  };

  const removeSection = (idx) => {
    if (formData.sections.length <= 1) return;
    setFormData(prev => ({ ...prev, sections: prev.sections.filter((_, i) => i !== idx) }));
    setActiveSectionIdx(idx > 0 ? Math.min(idx - 1, formData.sections.length - 2) : 0);
  };

  const moveSection = (idx, dir) => {
    const secs = [...formData.sections];
    const ti = dir === 'up' ? idx - 1 : idx + 1;
    if (ti < 0 || ti >= secs.length) return;
    [secs[idx], secs[ti]] = [secs[ti], secs[idx]];
    setFormData(prev => ({ ...prev, sections: secs }));
    setActiveSectionIdx(ti);
  };

  // ── Pivot column helpers ─────────────────────────────────────
  const addPivotCol = (type) => {
    const nc = { id: Date.now().toString(), type, displayName: '', source: '', operation: 'count', formula: '', showTotal: true, hideInReport: false, rowFilters: [], valueFilters: [], isUniqueCount: false, dedupColumn: '', roundOff: false, roundDecimals: 0, findText: '', replaceWith: '', simplifyDate: false, simplifyTime: false, normalizeMonth: false, normalizeWeek: false, groupByCol: '' };
    updateSection('pivotColumns', [...(activeSection?.pivotColumns || []), nc]);
  };

  const addColRowFilter = (colId) => updateSection('pivotColumns', activeSection.pivotColumns.map(c => c.id === colId ? { ...c, rowFilters: [...(c.rowFilters || []), { conditionCol: '', operator: '==', conditionVals: [], isManual: false, type: 'simple' }] } : c));
  const removeColRowFilter = (colId, fi) => updateSection('pivotColumns', activeSection.pivotColumns.map(c => c.id === colId ? { ...c, rowFilters: c.rowFilters.filter((_, i) => i !== fi) } : c));
  const updateColRowFilter = (colId, fi, field, value) => updateSection('pivotColumns', activeSection.pivotColumns.map(c => { if (c.id !== colId) return c; const rf = [...(c.rowFilters || [])]; rf[fi] = { ...rf[fi], [field]: value }; return { ...c, rowFilters: rf }; }));

  const addColValueFilter = (colId) => updateSection('pivotColumns', activeSection.pivotColumns.map(c => c.id === colId ? { ...c, valueFilters: [...(c.valueFilters || []), { operator: '==', value: '', valueTo: '' }] } : c));
  const removeColValueFilter = (colId, vfi) => updateSection('pivotColumns', activeSection.pivotColumns.map(c => c.id === colId ? { ...c, valueFilters: c.valueFilters.filter((_, i) => i !== vfi) } : c));
  const updateColValueFilter = (colId, vfi, field, value) => updateSection('pivotColumns', activeSection.pivotColumns.map(c => { if (c.id !== colId) return c; const vf = [...(c.valueFilters || [])]; vf[vfi] = { ...vf[vfi], [field]: value }; return { ...c, valueFilters: vf }; }));

  const removePivotCol = (colId) => updateSection('pivotColumns', activeSection.pivotColumns.filter(c => c.id !== colId));

  const updatePivotCol = (colId, field, value) => updateSection('pivotColumns', activeSection.pivotColumns.map(c => c.id === colId ? { ...c, [field]: value } : c));

  const movePivotCol = (idx, dir) => {
    const cols = [...activeSection.pivotColumns];
    const ti = dir === 'up' ? idx - 1 : idx + 1;
    if (ti < 0 || ti >= cols.length) return;
    [cols[idx], cols[ti]] = [cols[ti], cols[idx]];
    updateSection('pivotColumns', cols);
  };

  // ── Filter helpers ───────────────────────────────────────────
  const addFilter = (lt) => updateSection(lt, [...(activeSection[lt] || []), { conditionCol: '', operator: '==', conditionVals: [], isManual: false }]);
  const removeFilter = (lt, idx) => updateSection(lt, activeSection[lt].filter((_, i) => i !== idx));
  const updateFilter = (lt, idx, field, value) => {
    const list = [...(activeSection[lt] || [])];
    list[idx] = { ...list[idx], [field]: value };
    updateSection(lt, list);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: 'var(--text-muted)', gap: '12px' }}>
      <Loader2 className="spinner" size={32} /> Loading Multi-Table Designer...
    </div>
  );

  const labelSty = { fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' };
  const cardSty = { background: 'var(--glass-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' };
  const tabSty = (active) => ({
    flex: 1, padding: '12px', fontSize: '12px', fontWeight: '700', border: 'none', cursor: 'pointer',
    background: active ? 'rgba(99,102,241,0.1)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
  });
  const toggleSty = (on) => ({ width: '36px', height: '20px', borderRadius: '10px', background: on ? 'var(--primary)' : 'var(--glass-border)', position: 'relative', cursor: 'pointer', transition: '0.3s', flexShrink: 0 });
  const thumbSty = (on) => ({ width: '14px', height: '14px', borderRadius: '50%', background: 'white', position: 'absolute', top: '3px', left: on ? '19px' : '3px', transition: '0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' });

  return (
    <div style={{ padding: '0 20px', minHeight: 'calc(100vh - 100px)', color: 'var(--text-main)' }}>
      <ModernModal modal={modal} onClose={() => setModal(m => ({ ...m, isOpen: false }))} />

      {/* Header */}
      <header className="page-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button onClick={() => navigate('/templates')} style={{ padding: '8px', borderRadius: '50%', background: 'var(--glass-bg)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex' }}>
                <ArrowLeft size={18} />
              </button>
              <Layers size={32} color="var(--primary)" /> Multi-Table Report Designer
            </h1>
            <p className="page-description">Multiple independent pivot tables in one Excel sheet — each with its own filters.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {selectedTemplateId && (
              <button onClick={handleDelete} style={{ padding: '12px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Trash2 size={18} />
              </button>
            )}
            <button onClick={handleSave} disabled={isSaving} className="btn-primary" style={{ minWidth: '160px', padding: '12px 24px', gap: '8px' }}>
              {isSaving ? <Loader2 className="spinner" size={18} /> : (saveStatus === 'Saved!' ? <CheckCircle2 size={18} /> : <Save size={18} />)}
              {saveStatus || (selectedTemplateId ? 'Update Template' : 'Save Template')}
            </button>
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', height: 'calc(100vh - 220px)' }}>

        {/* ── LEFT PANEL ── */}
        <div className="glass" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>

            <div className="form-group">
              <label style={labelSty}>Load Existing Template</label>
              <select value={selectedTemplateId} onChange={e => { setSelectedTemplateId(e.target.value); loadTemplate(e.target.value); }}>
                <option value="">+ Create New Multi-Table Report</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label style={labelSty}>Template Name *</label>
              <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Monthly Summary Report" />
            </div>

            <div className="form-group">
              <label style={labelSty}>Description (Optional)</label>
              <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="What does this report show?" rows={2}
                style={{ padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--input-text)', fontFamily: 'inherit', fontSize: '14px', width: '100%', resize: 'vertical' }} />
            </div>

            <div className="form-group">
              <label style={labelSty}>Report Category</label>
              <select value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)}>
                <option value="">— No Category —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Layout */}
            <div>
              <label style={labelSty}>Sheet Layout</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[{ val: 'vertical', icon: <AlignJustify size={15} />, label: 'Stacked' }, { val: 'horizontal', icon: <Columns size={15} />, label: 'Side by Side' }].map(opt => (
                  <button key={opt.val} onClick={() => setFormData(p => ({ ...p, layout: opt.val }))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', border: '1px solid', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                      borderColor: formData.layout === opt.val ? 'var(--primary)' : 'var(--border)',
                      background: formData.layout === opt.val ? 'rgba(99,102,241,0.1)' : 'var(--glass-bg)',
                      color: formData.layout === opt.val ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label style={labelSty}>File Name Format</label>
              <input value={formData.fileNameFormat} onChange={e => setFormData(p => ({ ...p, fileNameFormat: e.target.value }))} placeholder="Multi_Report_{date}" />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{'{name}'} = template name, {'{date}'} = today</p>
            </div>

            {/* Top report header toggle */}
            <div style={cardSty}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600' }}>Top Report Header</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Merged title row at the top of the sheet</p>
                </div>
                <div style={toggleSty(formData.isHeaderEnabled)} onClick={() => setFormData(p => ({ ...p, isHeaderEnabled: !p.isHeaderEnabled }))}>
                  <div style={thumbSty(formData.isHeaderEnabled)} />
                </div>
              </div>
              {formData.isHeaderEnabled && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {['custom', 'column'].map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, headerConfig: { ...p.headerConfig, type: mode } }))}
                        style={{
                          flex: 1, padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                          border: '1px solid var(--border)', cursor: 'pointer',
                          background: (formData.headerConfig?.type || 'custom') === mode ? 'var(--primary)' : 'var(--glass-bg)',
                          color: (formData.headerConfig?.type || 'custom') === mode ? 'white' : 'var(--text-main)',
                          textTransform: 'uppercase'
                        }}
                      >
                        {mode === 'custom' ? 'Custom Text' : 'From Master Column'}
                      </button>
                    ))}
                  </div>
                  {(formData.headerConfig?.type || 'custom') === 'custom' ? (
                    <input
                      value={formData.headerConfig?.text || ''}
                      onChange={e => setFormData(p => ({ ...p, headerConfig: { ...p.headerConfig, text: e.target.value } }))}
                      placeholder="e.g., Synergy Healthcare & Wellness"
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <div>
                      <SearchableDropdown
                        options={masterHeaders}
                        value={formData.headerConfig?.sourceCol || ''}
                        onChange={val => setFormData(p => ({ ...p, headerConfig: { ...p.headerConfig, sourceCol: val } }))}
                        placeholder="Select master column..."
                      />
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Uses the first value found in this column as the report header.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Master upload */}
            <div style={cardSty}>
              <p style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Load Master File (for column hints)</p>
              <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
              <button onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '10px', background: 'var(--glass-bg)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '600' }}>
                <Upload size={15} /> {masterHeaders.length > 0 ? `${masterHeaders.length} columns loaded` : 'Upload Master Excel'}
              </button>
            </div>

            {/* Section list */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <label style={{ ...labelSty, marginBottom: 0 }}>TABLE SECTIONS ({formData.sections.length})</label>
                <button onClick={addSection} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                  <Plus size={13} /> Add Table
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {formData.sections.map((sec, idx) => (
                  <div key={sec.id} onClick={() => { setActiveSectionIdx(idx); setActiveTab('setup'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 12px', border: '1px solid', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s',
                      borderColor: activeSectionIdx === idx ? 'var(--primary)' : 'var(--border)',
                      background: activeSectionIdx === idx ? 'rgba(99,102,241,0.08)' : 'var(--glass-subtle)' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: activeSectionIdx === idx ? 'var(--primary)' : 'var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: activeSectionIdx === idx ? 'white' : 'var(--text-muted)', flexShrink: 0 }}>{idx + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: activeSectionIdx === idx ? 'var(--primary)' : 'var(--text-main)' }}>{sec.title || `Table ${idx + 1}`}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{sec.rowField || 'No row field'} · {sec.pivotColumns.length} col{sec.pivotColumns.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); moveSection(idx, 'up'); }} disabled={idx === 0} style={{ padding: '3px', background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--glass-border)' : 'var(--text-muted)' }}><ArrowUp size={11} /></button>
                      <button onClick={e => { e.stopPropagation(); moveSection(idx, 'down'); }} disabled={idx === formData.sections.length - 1} style={{ padding: '3px', background: 'none', border: 'none', cursor: idx === formData.sections.length - 1 ? 'default' : 'pointer', color: idx === formData.sections.length - 1 ? 'var(--glass-border)' : 'var(--text-muted)' }}><ArrowDown size={11} /></button>
                      <button onClick={e => { e.stopPropagation(); removeSection(idx); }} disabled={formData.sections.length <= 1} style={{ padding: '3px', background: 'none', border: 'none', cursor: formData.sections.length <= 1 ? 'default' : 'pointer', color: formData.sections.length <= 1 ? 'var(--glass-border)' : '#ef4444' }}><Trash2 size={11} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CHARTS */}
            <ChartConfigPanel
              chartConfigs={formData.chartConfigs || []}
              onChange={configs => setFormData(p => ({ ...p, chartConfigs: configs }))}
              availableHeaders={masterHeaders}
              sectionNames={formData.sections.map((s, i) => s.title || `Table ${i + 1}`)}
              sectionHeaders={formData.sections.reduce((acc, sec, i) => {
                const rowLabel = sec.rowFieldDisplayName || sec.rowField || 'Group';
                const visCols = (sec.pivotColumns || []).filter(c =>
                  !c.hideInReport && c.type !== 'grouping' &&
                  !(sec.rowField && (c.type === 'property') && c.source === sec.rowField)
                );
                acc[i] = [rowLabel, ...visCols.map(p => p.displayName || p.source || 'Untitled')].filter(Boolean);
                return acc;
              }, {})}
            />

            {/* CONSTANT CHECKS */}
            <ConstantCheckPanel
              constantChecks={formData.constantChecks || []}
              onChange={checks => setFormData(p => ({ ...p, constantChecks: checks }))}
              masterHeaders={masterHeaders}
              showExpected={formData.constantShowExpected || false}
              onShowExpectedChange={v => setFormData(p => ({ ...p, constantShowExpected: v }))}
            />

          </div>
        </div>

        {/* ── RIGHT PANEL: Section Editor ── */}
        <div className="glass" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!activeSection ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', flexDirection: 'column', gap: '12px' }}>
              <Layers size={48} opacity={0.3} /><p>Select or add a table section to configure</p>
            </div>
          ) : (
            <>
              {/* Section header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                <TableIcon size={20} color="var(--primary)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input value={activeSection.title} onChange={e => updateSection('title', e.target.value)} placeholder={`Table ${activeSectionIdx + 1} title...`}
                    style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-main)', fontSize: '16px', fontWeight: '700', width: '100%' }} />
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Section {activeSectionIdx + 1} of {formData.sections.length} — this title appears as the table header in the report</p>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {[{ key: 'setup', icon: <Settings2 size={13} />, label: 'TABLE SETUP' }, { key: 'filters', icon: <Filter size={13} />, label: 'FILTERS' }].map(t => (
                  <button key={t.key} onClick={() => setActiveTab(t.key)} style={tabSty(activeTab === t.key)}>{t.icon} {t.label}</button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* ── SETUP TAB ── */}
                {activeTab === 'setup' && (
                  <>
                    {/* Table title */}
                    <div className="form-group">
                      <label style={labelSty}>Table Title (appears as header row above this table in the report)</label>
                      <input
                        value={activeSection.title}
                        onChange={e => updateSection('title', e.target.value)}
                        placeholder={`e.g., HV Sessions by Physio — Table ${activeSectionIdx + 1}`}
                      />
                    </div>

                    {/* Row/Col fields */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="form-group">
                        <label style={labelSty}>Row Field (Group By) *</label>
                        <SearchableDropdown options={masterHeaders} value={activeSection.rowField} onChange={v => updateSection('rowField', v)} placeholder="Select row field..." />
                      </div>
                      <div className="form-group">
                        <label style={labelSty}>Row Field Display Name</label>
                        <input
                          value={activeSection.rowFieldDisplayName || ''}
                          onChange={e => updateSection('rowFieldDisplayName', e.target.value)}
                          placeholder={activeSection.rowField || 'e.g., Doctor Name'}
                        />
                      </div>
                      <div className="form-group">
                        <label style={labelSty}>Column Field (Cross-Tab, optional)</label>
                        <SearchableDropdown options={['', ...masterHeaders]} value={activeSection.colField || ''} onChange={v => updateSection('colField', v)} placeholder="Pivot columns by..." />
                      </div>
                    </div>

                    {/* Pivot columns */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <label style={{ ...labelSty, marginBottom: 0 }}>PIVOT COLUMNS ({activeSection.pivotColumns.length})</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {[
                            { type: 'grouping', icon: <Database size={11} />, label: 'Property' },
                            { type: 'aggregation', icon: <Calculator size={11} />, label: 'Aggregation' },
                            { type: 'formula', icon: <BarChart4 size={11} />, label: 'Formula' },
                            { type: 'last_visit_date', icon: <Calendar size={11} />, label: 'Last Visit Date' },
                          ].map(bt => (
                            <button key={bt.type} onClick={() => addPivotCol(bt.type)}
                              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', background: 'var(--glass-bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                              {bt.icon} {bt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {activeSection.pivotColumns.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '12px', fontSize: '13px' }}>
                          Add columns using the buttons above
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {activeSection.pivotColumns.map((col, ci) => (
                            <div key={col.id} style={{ background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                              {/* ── Header row ── */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                                  background: col.type === 'grouping' ? 'rgba(16,185,129,0.15)' : col.type === 'formula' ? 'rgba(236,72,153,0.15)' : col.type === 'last_visit_date' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                                  color: col.type === 'grouping' ? 'var(--success)' : col.type === 'formula' ? '#ec4899' : col.type === 'last_visit_date' ? '#f59e0b' : 'var(--primary)' }}>
                                  {col.type.replace('_', ' ').toUpperCase()}
                                </span>
                                <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>{col.displayName || col.source || 'Untitled'}</span>
                                <button onClick={() => movePivotCol(ci, 'up')} disabled={ci === 0} style={{ padding: '3px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><ArrowUp size={12} /></button>
                                <button onClick={() => movePivotCol(ci, 'down')} disabled={ci === activeSection.pivotColumns.length - 1} style={{ padding: '3px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><ArrowDown size={12} /></button>
                                <button onClick={() => removePivotCol(col.id)} style={{ padding: '3px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={12} /></button>
                              </div>

                              {/* ── Display name + source ── */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div className="form-group">
                                  <label style={labelSty}>Display Name</label>
                                  <input value={col.displayName} onChange={e => updatePivotCol(col.id, 'displayName', e.target.value)} placeholder="Column header" style={{ padding: '8px', fontSize: '13px' }} />
                                </div>
                                {col.type !== 'formula' && (
                                  <div className="form-group">
                                    <label style={labelSty}>{col.type === 'last_visit_date' ? 'Date Column' : 'Source Field'}</label>
                                    <SearchableDropdown options={masterHeaders} value={col.source || ''} onChange={v => updatePivotCol(col.id, 'source', v)} placeholder="Select field..." />
                                  </div>
                                )}
                              </div>

                              {/* ── last_visit_date: group by ── */}
                              {col.type === 'last_visit_date' && (
                                <div className="form-group">
                                  <label style={labelSty}>Patient / Group By Column</label>
                                  <SearchableDropdown options={masterHeaders} value={col.groupByCol || ''} onChange={v => updatePivotCol(col.id, 'groupByCol', v)} placeholder="Patient ID column..." />
                                </div>
                              )}

                              {/* ── Aggregation operation ── */}
                              {col.type === 'aggregation' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <div className="form-group">
                                    <label style={labelSty}>Operation</label>
                                    <select value={col.operation} onChange={e => updatePivotCol(col.id, 'operation', e.target.value)} style={{ padding: '8px', fontSize: '13px' }}>
                                      <option value="sum">Summation</option>
                                      <option value="count">Count Rows</option>
                                      <option value="avg">Average</option>
                                      <option value="min">Minimum</option>
                                      <option value="max">Maximum</option>
                                      <optgroup label="── Unique Count ──">
                                        <option value="count_unique">Count Unique (by ID column)</option>
                                      </optgroup>
                                      <optgroup label="── Treatment Split ──">
                                        <option value="count_single">Count Single (no /)</option>
                                        <option value="count_multi">Count Multiple (has /)</option>
                                      </optgroup>
                                    </select>
                                  </div>
                                  {col.operation === 'count_unique' && (
                                    <div className="form-group">
                                      <label style={labelSty}>Unique By Field</label>
                                      <SearchableDropdown options={masterHeaders} value={col.dedupColumn || ''} onChange={v => updatePivotCol(col.id, 'dedupColumn', v)} placeholder="Dedup by..." />
                                    </div>
                                  )}
                                  {/* Unique patient count dedup */}
                                  <div style={{ padding: '10px 12px', background: 'rgba(99,102,241,0.05)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.12)' }}>
                                    <label style={{ fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--primary)' }}>
                                      <input type="checkbox" checked={!!col.isUniqueCount} onChange={e => updatePivotCol(col.id, 'isUniqueCount', e.target.checked)} />
                                      Unique Patient Count (Deduplicate)
                                    </label>
                                    {col.isUniqueCount && (
                                      <div style={{ marginTop: '8px' }}>
                                        <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Deduplicate By Column (e.g. Patient ID)</label>
                                        <SearchableDropdown options={masterHeaders} value={col.dedupColumn || ''} onChange={v => updatePivotCol(col.id, 'dedupColumn', v)} placeholder="Select ID column..." />
                                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>✦ Session rows for the same ID will be counted as <strong>1</strong> patient.</p>
                                      </div>
                                    )}
                                  </div>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={col.showTotal !== false} onChange={e => updatePivotCol(col.id, 'showTotal', e.target.checked)} /> Include in Grand Total
                                  </label>
                                </div>
                              )}

                              {/* ── Formula ── */}
                              {col.type === 'formula' && (
                                <div className="form-group">
                                  <label style={labelSty}>Formula — use {'{ColName}'} for cols, [MasterField] for master data</label>
                                  <input value={col.formula} onChange={e => updatePivotCol(col.id, 'formula', e.target.value)} placeholder="e.g. {Sessions} / {Patients} * 100" style={{ padding: '8px', fontSize: '13px', fontFamily: 'monospace' }} />
                                </div>
                              )}

                              {/* ── Rounding (aggregation + formula) ── */}
                              {(col.type === 'aggregation' || col.type === 'formula') && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', background: 'rgba(99,102,241,0.04)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.12)' }}>
                                  <div style={{ flex: 1 }}>
                                    <p style={{ fontSize: '12px', fontWeight: '600', marginBottom: '2px' }}>Round Numeric Values</p>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 0 }}>Round to nearest number (4.5 → 5, 4.4 → 4).</p>
                                    {col.roundOff && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Decimal places</label>
                                        <input type="number" min="0" max="10" value={col.roundDecimals ?? 0} onChange={e => updatePivotCol(col.id, 'roundDecimals', Math.max(0, parseInt(e.target.value) || 0))} style={{ width: '56px', padding: '4px 6px', fontSize: '11px', borderRadius: '6px' }} />
                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(0 = integer)</span>
                                      </div>
                                    )}
                                  </div>
                                  <div onClick={() => updatePivotCol(col.id, 'roundOff', !col.roundOff)} style={{ width: '40px', height: '22px', borderRadius: '11px', flexShrink: 0, background: col.roundOff ? 'var(--primary)' : 'var(--glass-border)', position: 'relative', cursor: 'pointer', transition: '0.3s', marginTop: '2px' }}>
                                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '3px', left: col.roundOff ? '21px' : '3px', transition: '0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                                  </div>
                                </div>
                              )}

                              {/* ── Data Cleaning & Transforms ── */}
                              {col.type !== 'formula' && (
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                                  <h5 style={{ fontSize: '10px', color: '#ec4899', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Sparkles size={10} /> Data Cleaning & Transforms
                                  </h5>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                    <div>
                                      <label style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Find Text</label>
                                      <input value={col.findText || ''} onChange={e => updatePivotCol(col.id, 'findText', e.target.value)} placeholder="Find..." style={{ padding: '6px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Replace With</label>
                                      <input value={col.replaceWith || ''} onChange={e => updatePivotCol(col.id, 'replaceWith', e.target.value)} placeholder="Replace..." style={{ padding: '6px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }} />
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                    {[['simplifyDate','Simplify Date'],['simplifyTime','Simplify Time']].map(([k,l]) => (
                                      <label key={k} style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={!!col[k]} onChange={e => updatePivotCol(col.id, k, e.target.checked)} /> {l}
                                      </label>
                                    ))}
                                    {[['normalizeMonth','Month'],['normalizeWeek','Week (Rel.)']].map(([k,l]) => (
                                      <label key={k} style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--primary)', borderLeft: k === 'normalizeMonth' ? '1px solid var(--border)' : undefined, paddingLeft: k === 'normalizeMonth' ? '10px' : undefined }}>
                                        <input type="checkbox" checked={!!col[k]} onChange={e => updatePivotCol(col.id, k, e.target.checked)} /> {l}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* ── Per-column Row Conditions ── */}
                              {(col.type === 'aggregation' || col.type === 'property' || col.type === 'grouping') && (
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <h5 style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '700', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <Filter size={10} /> Row Conditions
                                      {(col.rowFilters?.length > 0) && <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: '8px', padding: '1px 6px', fontSize: '9px', fontWeight: '800' }}>{col.rowFilters.length}</span>}
                                    </h5>
                                    <button onClick={() => addColRowFilter(col.id)} style={{ padding: '4px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--glass-bg)', border: '1px dashed var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                      <Plus size={10} /> Add Condition
                                    </button>
                                  </div>
                                  {(!col.rowFilters || col.rowFilters.length === 0) && (
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px', background: 'var(--glass-subtle)', borderRadius: '8px' }}>No conditions — all rows are included. Add conditions to filter which rows contribute.</p>
                                  )}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {(col.rowFilters || []).map((f, fi) => (
                                      <div key={fi} style={{ padding: '10px', background: 'rgba(245,158,11,0.05)', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', zIndex: (col.rowFilters?.length || 0) - fi }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <div style={{ display: 'flex', gap: '4px' }}>
                                            {[['simple','Simple'],['expr_compare','Expression'],['time_range','Time Range']].map(([t, lbl]) => {
                                              const active = t === 'expr_compare' ? f.type === 'expr_compare' : t === 'time_range' ? f.type === 'time_range' : (!f.type || f.type === 'simple');
                                              return <button key={t} onClick={() => updateColRowFilter(col.id, fi, 'type', t)} style={{ padding: '2px 8px', fontSize: '9px', borderRadius: '6px', border: `1px solid ${active ? '#f59e0b' : 'var(--border)'}`, background: active ? 'rgba(245,158,11,0.15)' : 'transparent', color: active ? '#f59e0b' : 'var(--text-muted)', cursor: 'pointer', fontWeight: '700' }}>{lbl}</button>;
                                            })}
                                          </div>
                                          <button onClick={() => removeColRowFilter(col.id, fi)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><X size={13} /></button>
                                        </div>
                                        {f.type === 'expr_compare' ? (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px 1fr', gap: '6px', alignItems: 'end' }}>
                                              <div><label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Column 1</label><SearchableDropdown options={masterHeaders} value={f.col1 || ''} onChange={v => updateColRowFilter(col.id, fi, 'col1', v)} placeholder="Column..." /></div>
                                              <div><label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Math</label><select value={f.mathOp || '-'} onChange={e => updateColRowFilter(col.id, fi, 'mathOp', e.target.value)} style={{ width: '100%', padding: '8px 2px', fontSize: '14px', textAlign: 'center' }}><option value="+">+</option><option value="-">−</option><option value="*">×</option><option value="/">/</option></select></div>
                                              <div><label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Column 2</label><SearchableDropdown options={masterHeaders} value={f.col2 || ''} onChange={v => updateColRowFilter(col.id, fi, 'col2', v)} placeholder="Column..." /></div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '6px' }}>
                                              <div><label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Comparison</label><select value={f.operator || '>='} onChange={e => updateColRowFilter(col.id, fi, 'operator', e.target.value)} style={{ width: '100%', padding: '8px 6px', fontSize: '11px' }}><option value=">=">≥ Greater or Equal</option><option value=">">{'>'} Greater Than</option><option value="<=">≤ Less or Equal</option><option value="<">{'<'} Less Than</option><option value="==">= Equals</option><option value="!=">≠ Not Equal</option></select></div>
                                              <div><label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Value</label><input type="number" value={(f.conditionVals || [])[0] || ''} onChange={e => updateColRowFilter(col.id, fi, 'conditionVals', [e.target.value])} placeholder="e.g. 6" style={{ width: '100%', padding: '8px', fontSize: '11px', boxSizing: 'border-box' }} /></div>
                                            </div>
                                          </div>
                                        ) : f.type === 'time_range' ? (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div><label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Column</label><SearchableDropdown options={masterHeaders} value={f.conditionCol || ''} onChange={v => updateColRowFilter(col.id, fi, 'conditionCol', v)} placeholder="Select time column..." /></div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                              <div><label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>From</label><input type="time" value={f.conditionVals?.[0] || ''} onChange={e => updateColRowFilter(col.id, fi, 'conditionVals', [e.target.value, f.conditionVals?.[1] || ''])} style={{ width: '100%', padding: '7px 6px', fontSize: '12px', boxSizing: 'border-box' }} /></div>
                                              <div><label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>To</label><input type="time" value={f.conditionVals?.[1] || ''} onChange={e => updateColRowFilter(col.id, fi, 'conditionVals', [f.conditionVals?.[0] || '', e.target.value])} style={{ width: '100%', padding: '7px 6px', fontSize: '12px', boxSizing: 'border-box' }} /></div>
                                            </div>
                                          </div>
                                        ) : (
                                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', gap: '6px', alignItems: 'end' }}>
                                            <div><label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Field</label><SearchableDropdown options={masterHeaders} value={f.conditionCol || ''} onChange={v => updateColRowFilter(col.id, fi, 'conditionCol', v)} placeholder="Select field..." /></div>
                                            <div><label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Operator</label><select value={f.operator || '=='} onChange={e => updateColRowFilter(col.id, fi, 'operator', e.target.value)} style={{ width: '100%', padding: '8px 4px', fontSize: '11px' }}><option value="==">= Equals</option><option value="!=">≠ Not Equal</option><option value=">">{'>'} Greater</option><option value="<">{'<'} Less</option><option value=">=">≥ ≥ Equal</option><option value="<=">≤ ≤ Equal</option><option value="between">↔ Between</option><option value="contains">⊂ Contains</option></select></div>
                                            <div>
                                              <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                                <span>{f.operator === 'between' ? 'From / To' : 'Value(s)'}</span>
                                                {f.operator !== 'between' && <button onClick={() => updateColRowFilter(col.id, fi, 'isManual', !f.isManual)} style={{ background: 'none', border: 'none', color: f.isManual ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '8px', display: 'flex', alignItems: 'center', gap: '2px' }}>{f.isManual ? <List size={9} /> : <Keyboard size={9} />} {f.isManual ? 'List' : 'Manual'}</button>}
                                              </label>
                                              {f.operator === 'between' ? (
                                                <div style={{ display: 'flex', gap: '4px' }}><input placeholder="From" value={f.conditionVals?.[0] || ''} onChange={e => updateColRowFilter(col.id, fi, 'conditionVals', [e.target.value, f.conditionVals?.[1] || ''])} style={{ padding: '8px', fontSize: '11px', width: '50%' }} /><input placeholder="To" value={f.conditionVals?.[1] || ''} onChange={e => updateColRowFilter(col.id, fi, 'conditionVals', [f.conditionVals?.[0] || '', e.target.value])} style={{ padding: '8px', fontSize: '11px', width: '50%' }} /></div>
                                              ) : f.isManual ? (
                                                <input placeholder="Value(s)..." value={Array.isArray(f.conditionVals) ? f.conditionVals.join(', ') : f.conditionVals || ''} onChange={e => updateColRowFilter(col.id, fi, 'conditionVals', e.target.value.split(',').map(s => s.trim()))} style={{ width: '100%', padding: '8px', fontSize: '11px', boxSizing: 'border-box' }} />
                                              ) : (
                                                <MultiSelectDropdown options={masterUniqueValues[f.conditionCol] || []} selectedValues={f.conditionVals || []} onChange={vals => updateColRowFilter(col.id, fi, 'conditionVals', vals)} placeholder={f.conditionCol ? 'Pick values...' : 'Select field...'} />
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>

                                  {/* ── Per-column Value Filters ── */}
                                  {col.source && (
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '10px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h5 style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: '700', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <Calculator size={10} /> Value Filters (on {col.source})
                                          {(col.valueFilters?.length > 0) && <span style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--primary)', borderRadius: '8px', padding: '1px 6px', fontSize: '9px', fontWeight: '800' }}>{col.valueFilters.length}</span>}
                                        </h5>
                                        <button onClick={() => addColValueFilter(col.id)} style={{ padding: '4px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--glass-bg)', border: '1px dashed var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                          <Plus size={10} /> Add Value Filter
                                        </button>
                                      </div>
                                      {(!col.valueFilters || col.valueFilters.length === 0) && (
                                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '8px', background: 'var(--glass-subtle)', borderRadius: '8px' }}>No value filters — all "{col.source}" values are included.</p>
                                      )}
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {(col.valueFilters || []).map((vf, vfi) => (
                                          <div key={vfi} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: '6px', alignItems: 'end', padding: '10px', background: 'rgba(99,102,241,0.05)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.2)' }}>
                                            <div><select value={vf.operator || '=='} onChange={e => updateColValueFilter(col.id, vfi, 'operator', e.target.value)} style={{ width: '100%', padding: '8px 4px', fontSize: '11px' }}><option value="==">= Equals</option><option value="!=">≠ Not Equal</option><option value=">">{'>'} Greater</option><option value="<">{'<'} Less</option><option value=">=">≥ ≥ Equal</option><option value="<=">≤ ≤ Equal</option><option value="between">↔ Between</option><option value="contains">⊂ Contains</option></select></div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                              {vf.operator === 'between' ? (
                                                <><input placeholder="Min" value={vf.value || ''} onChange={e => updateColValueFilter(col.id, vfi, 'value', e.target.value)} style={{ flex: 1, padding: '8px 6px', fontSize: '11px' }} /><input placeholder="Max" value={vf.valueTo || ''} onChange={e => updateColValueFilter(col.id, vfi, 'valueTo', e.target.value)} style={{ flex: 1, padding: '8px 6px', fontSize: '11px' }} /></>
                                              ) : (
                                                <input placeholder="Criteria..." value={vf.value || ''} onChange={e => updateColValueFilter(col.id, vfi, 'value', e.target.value)} style={{ width: '100%', padding: '8px 6px', fontSize: '11px' }} />
                                              )}
                                            </div>
                                            <button onClick={() => removeColValueFilter(col.id, vfi)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px' }}><X size={13} /></button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* ── Hide in Report ── */}
                              <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#ef4444', cursor: 'pointer', fontWeight: '600' }}>
                                  <input type="checkbox" checked={!!col.hideInReport} onChange={e => updatePivotCol(col.id, 'hideInReport', e.target.checked)} />
                                  Hide in Report — excluded from output but available to formulas
                                </label>
                              </div>

                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Options */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {[
                        { key: 'isPivotSummaryEnabled', label: 'Grand Total Row', desc: 'Sum totals at bottom' },
                        { key: 'isRowTotalEnabled', label: 'Row Totals', desc: 'Cross-tab column sums' },
                        { key: 'isFlatList', label: 'Flat List Mode', desc: 'One row per record, group column merged' },
                      ].map(opt => (
                        <div key={opt.key} style={cardSty}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                              <p style={{ fontSize: '13px', fontWeight: '600' }}>{opt.label}</p>
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{opt.desc}</p>
                            </div>
                            <div style={toggleSty(!!activeSection[opt.key])} onClick={() => updateSection(opt.key, !activeSection[opt.key])}>
                              <div style={thumbSty(!!activeSection[opt.key])} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* ── FILTERS TAB ── */}
                {activeTab === 'filters' && (
                  <>
                    <FilterBlock label="GLOBAL FILTERS (Pre-processing)" desc="Filter master data before aggregation" enabledKey="isGlobalFilterEnabled" listKey="globalFilters"
                      activeSection={activeSection} updateSection={updateSection} addFilter={addFilter} removeFilter={removeFilter} updateFilter={updateFilter}
                      masterHeaders={masterHeaders} masterUniqueValues={masterUniqueValues} emptyMsg="No filters — all master rows included" />
                    <FilterBlock label="OUTPUT FILTERS (Post-processing)" desc="Filter rows after aggregation" enabledKey="isOutputFilterEnabled" listKey="outputFilters"
                      activeSection={activeSection} updateSection={updateSection} addFilter={addFilter} removeFilter={removeFilter} updateFilter={updateFilter}
                      masterHeaders={masterHeaders} masterUniqueValues={masterUniqueValues} emptyMsg="No filters — all computed rows shown" />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterBlock({ label, desc, enabledKey, listKey, activeSection, updateSection, addFilter, removeFilter, updateFilter, masterHeaders, masterUniqueValues, emptyMsg }) {
  const toggleSty = (on) => ({ width: '32px', height: '18px', borderRadius: '9px', background: on ? 'var(--primary)' : 'var(--glass-border)', position: 'relative', cursor: 'pointer', transition: '0.3s', flexShrink: 0 });
  const thumbSty = (on) => ({ width: '12px', height: '12px', borderRadius: '50%', background: 'white', position: 'absolute', top: '3px', left: on ? '17px' : '3px', transition: '0.3s' });
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>{label}</p>
          <div style={toggleSty(activeSection[enabledKey])} onClick={() => updateSection(enabledKey, !activeSection[enabledKey])}>
            <div style={thumbSty(activeSection[enabledKey])} />
          </div>
        </div>
        <button onClick={() => addFilter(listKey)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
          <Plus size={12} /> Add Filter
        </button>
      </div>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>{desc}</p>
      {(activeSection[listKey] || []).length === 0 ? (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '14px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '10px' }}>{emptyMsg}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(activeSection[listKey] || []).map((f, fi) => (
            <FilterRow key={fi} f={f} masterHeaders={masterHeaders} masterUniqueValues={masterUniqueValues}
              onChange={(field, val) => updateFilter(listKey, fi, field, val)} onRemove={() => removeFilter(listKey, fi)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({ f, masterHeaders, masterUniqueValues, onChange, onRemove }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--glass-subtle)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[['simple', 'Simple'], ['time_range', 'Time Range']].map(([t, lbl]) => {
            const active = t === 'time_range' ? f.type === 'time_range' : (!f.type || f.type === 'simple');
            return <button key={t} type="button" onClick={() => onChange('type', t)} style={{ padding: '2px 8px', fontSize: '9px', borderRadius: '6px', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'rgba(99,102,241,0.12)' : 'transparent', color: active ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: '700' }}>{lbl}</button>;
          })}
        </div>
        <button onClick={onRemove} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
      </div>
      {f.type === 'time_range' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <SearchableDropdown options={masterHeaders} value={f.conditionCol || ''} onChange={v => onChange('conditionCol', v)} placeholder="Select time column..." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>From</label>
              <input type="time" value={f.conditionVals?.[0] || ''} onChange={e => onChange('conditionVals', [e.target.value, f.conditionVals?.[1] || ''])} style={{ padding: '7px 8px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>To</label>
              <input type="time" value={f.conditionVals?.[1] || ''} onChange={e => onChange('conditionVals', [f.conditionVals?.[0] || '', e.target.value])} style={{ padding: '7px 8px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr', gap: '8px', alignItems: 'start' }}>
          <SearchableDropdown options={masterHeaders} value={f.conditionCol || ''} onChange={v => onChange('conditionCol', v)} placeholder="Field..." />
          <select value={f.operator || '=='} onChange={e => onChange('operator', e.target.value)} style={{ padding: '8px', fontSize: '12px' }}>
            {['==', '!=', 'contains', 'not_contains', '>', '<', '>=', '<=', 'between', 'unique'].map(op => <option key={op} value={op}>{op}</option>)}
            <option disabled style={{ color: 'var(--text-muted)', fontSize: '10px' }}>── Date ──</option>
            <option value="this_month">This Month</option>
            <option value="prev_month">Previous Month</option>
            <option value="not_seen_within_days">Not Seen Within Days</option>
          </select>
          {(f.operator === 'this_month' || f.operator === 'prev_month') ? (
            <div style={{ fontSize: '11px', color: 'var(--primary)', padding: '4px 6px', background: 'rgba(99,102,241,0.08)', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.2)' }}>
              Auto-detects from data
            </div>
          ) : f.operator === 'not_seen_within_days' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input type="number" min="1" placeholder="Days (e.g. 3)" value={(f.conditionVals || [])[0] || ''} onChange={e => onChange('conditionVals', [e.target.value])} style={{ padding: '8px', fontSize: '12px' }} />
              <SearchableDropdown options={masterHeaders} value={f.groupByCol || ''} onChange={v => onChange('groupByCol', v)} placeholder="Patient / Group By Column..." />
            </div>
          ) : f.operator === 'between' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <input value={(f.conditionVals || [])[0] || ''} onChange={e => { const v = [...(f.conditionVals || [])]; v[0] = e.target.value; onChange('conditionVals', v); }} placeholder="Min" style={{ padding: '8px', fontSize: '12px' }} />
              <input value={(f.conditionVals || [])[1] || ''} onChange={e => { const v = [...(f.conditionVals || [])]; v[1] = e.target.value; onChange('conditionVals', v); }} placeholder="Max" style={{ padding: '8px', fontSize: '12px' }} />
            </div>
          ) : f.operator === 'unique' ? (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px' }}>Deduplicate by this field</span>
          ) : f.isManual ? (
            <input value={(f.conditionVals || []).join(', ')} onChange={e => onChange('conditionVals', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="Enter values, comma-separated" style={{ padding: '8px', fontSize: '12px' }}
              onBlur={() => onChange('isManual', false)} />
          ) : (
            <MultiSelectDropdown options={masterUniqueValues[f.conditionCol] || []} selectedValues={f.conditionVals || []}
              onChange={vals => onChange('conditionVals', vals)} placeholder="Select values..." />
          )}
        </div>
      )}
    </div>
  );
}
