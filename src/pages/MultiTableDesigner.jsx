import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, query, getDocs, addDoc, updateDoc, doc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import {
  Plus, Trash2, Save, ArrowLeft, CheckCircle2, Loader2, Upload,
  Layers, Filter, Settings2, Database, Calculator, BarChart4,
  ArrowUp, ArrowDown, AlignJustify, Columns, Table as TableIcon, Calendar
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SearchableDropdown from '../components/SearchableDropdown';
import ModernModal from '../components/ModernModal';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import ChartConfigPanel from '../components/ChartConfigPanel';

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
      rowFilters: c.rowFilters || [],
      valueFilters: c.valueFilters || [],
      isUniqueCount: !!c.isUniqueCount,
      dedupColumn: c.dedupColumn || '',
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

  useEffect(() => { fetchTemplates(); fetchCategories(); }, []);

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
    const nc = { id: Date.now().toString(), type, displayName: '', source: '', operation: 'count', formula: '', showTotal: true, rowFilters: [], valueFilters: [], dedupColumn: '' };
    updateSection('pivotColumns', [...(activeSection?.pivotColumns || []), nc]);
  };

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
                            <div key={col.id} style={{ background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                                  background: col.type === 'grouping' ? 'rgba(16,185,129,0.15)' : col.type === 'formula' ? 'rgba(236,72,153,0.15)' : 'rgba(99,102,241,0.15)',
                                  color: col.type === 'grouping' ? 'var(--success)' : col.type === 'formula' ? 'var(--secondary)' : 'var(--primary)' }}>
                                  {col.type.toUpperCase()}
                                </span>
                                <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>{col.displayName || col.source || 'Untitled'}</span>
                                <button onClick={() => movePivotCol(ci, 'up')} disabled={ci === 0} style={{ padding: '3px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><ArrowUp size={12} /></button>
                                <button onClick={() => movePivotCol(ci, 'down')} disabled={ci === activeSection.pivotColumns.length - 1} style={{ padding: '3px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><ArrowDown size={12} /></button>
                                <button onClick={() => removePivotCol(col.id)} style={{ padding: '3px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={12} /></button>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div className="form-group">
                                  <label style={labelSty}>Display Name</label>
                                  <input value={col.displayName} onChange={e => updatePivotCol(col.id, 'displayName', e.target.value)} placeholder="Column header" style={{ padding: '8px', fontSize: '13px' }} />
                                </div>
                                {col.type !== 'formula' && (
                                  <div className="form-group">
                                    <label style={labelSty}>{col.type === 'last_visit_date' ? 'Date Column (Visit Date)' : 'Source Field'}</label>
                                    <SearchableDropdown options={masterHeaders} value={col.source || ''} onChange={v => updatePivotCol(col.id, 'source', v)} placeholder="Select field..." />
                                  </div>
                                )}
                              </div>

                              {col.type === 'last_visit_date' && (
                                <div className="form-group" style={{ marginTop: '8px' }}>
                                  <label style={labelSty}>Patient / Group By Column</label>
                                  <SearchableDropdown options={masterHeaders} value={col.groupByCol || ''} onChange={v => updatePivotCol(col.id, 'groupByCol', v)} placeholder="Patient ID column..." />
                                </div>
                              )}

                              {col.type === 'aggregation' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                                  <div className="form-group">
                                    <label style={labelSty}>Operation</label>
                                    <select value={col.operation} onChange={e => updatePivotCol(col.id, 'operation', e.target.value)} style={{ padding: '8px', fontSize: '13px' }}>
                                      <option value="count">Count (all rows)</option>
                                      <option value="count_unique">Count Unique</option>
                                      <option value="count_single">Count Single</option>
                                      <option value="count_multi">Count Multi (/)</option>
                                      <option value="sum">Sum</option>
                                      <option value="avg">Average</option>
                                      <option value="min">Min</option>
                                      <option value="max">Max</option>
                                    </select>
                                  </div>
                                  {col.operation === 'count_unique' && (
                                    <div className="form-group">
                                      <label style={labelSty}>Unique By Field</label>
                                      <SearchableDropdown options={masterHeaders} value={col.dedupColumn || ''} onChange={v => updatePivotCol(col.id, 'dedupColumn', v)} placeholder="Dedup by..." />
                                    </div>
                                  )}
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', gridColumn: col.operation === 'count_unique' ? '1 / -1' : undefined }}>
                                    <input type="checkbox" checked={col.showTotal !== false} onChange={e => updatePivotCol(col.id, 'showTotal', e.target.checked)} />
                                    Include in Grand Total
                                  </label>
                                </div>
                              )}

                              {col.type === 'formula' && (
                                <div style={{ marginTop: '8px' }}>
                                  <label style={labelSty}>Formula — use {'{'+'ColName}'} for pivot cols, [MasterField] for master data</label>
                                  <input value={col.formula} onChange={e => updatePivotCol(col.id, 'formula', e.target.value)} placeholder="e.g. {Sessions} / {Patients} * 100" style={{ padding: '8px', fontSize: '13px', fontFamily: 'monospace' }} />
                                </div>
                              )}

                              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#ef4444', cursor: 'pointer', fontWeight: '600' }}>
                                  <input type="checkbox" checked={!!col.hideInReport} onChange={e => updatePivotCol(col.id, 'hideInReport', e.target.checked)} />
                                  Hide in Report — column is excluded from output but still available to formulas
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
