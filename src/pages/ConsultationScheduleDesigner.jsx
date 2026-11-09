import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, addDoc, doc, setDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import XLSX from 'xlsx-js-style';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Save, Trash2, Plus, ArrowLeft, Loader2, CheckCircle2, Upload, X, Stethoscope } from 'lucide-react';
import ModernModal from '../components/ModernModal';
import MultiSelectCheckboxDropdown from '../components/MultiSelectCheckboxDropdown';
import { DEFAULT_ACTIVITY_TYPES } from '../utils/consultationSchedule';

const DEFAULT_FORM = {
  name: '',
  reportTitle: 'Daily Doctor Schedule',
  doctorCol: '',
  dateCol: '',
  timeCol: '',
  typeCol: '',
  slotStart: '06:00',
  slotEnd: '21:00',
  slotMinutes: 30,
  freeLabel: 'Free',
  activityTypes: DEFAULT_ACTIVITY_TYPES,
  globalFilters: [], // [{ id, conditionCol, operator, conditionVals[] }] applied to every row before the report is built
};

const FILTER_OPERATORS = [
  { value: '==', label: 'Equals any of' },
  { value: '!=', label: 'Not equal to any of' },
  { value: 'contains', label: 'Contains any of' },
  { value: 'not_contains', label: 'Does not contain' },
];

const COLUMN_FIELDS = [
  { key: 'doctorCol',  label: 'Doctor column *',            hint: 'Values of this column fill the doctor dropdown at report time.' },
  { key: 'typeCol',    label: 'Appointment type column *',  hint: 'Column that says Consultation / Review / Treatment / House Visit / Fitness.' },
  { key: 'timeCol',    label: 'Check-in time column *',     hint: 'Each appointment is counted once, in the time slot containing this check-in time. Check-out times are not used. Also used for the date if no date column is set.' },
  { key: 'dateCol',    label: 'Date column (optional)',     hint: 'Leave empty if the date is part of the check-in column.' },
];

export default function ConsultationScheduleDesigner() {
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
  const fileRef = useRef(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info', mode: 'alert', confirmText: 'Confirm', onConfirm: null });

  useEffect(() => { fetchTemplates(); fetchCategories(); }, []);
  useEffect(() => {
    if (templates.length > 0 && templateIdFromUrl) loadTemplate(templateIdFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, templateIdFromUrl, categories]);

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
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.type === 'consultation_schedule'));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadTemplate = (id) => {
    const t = templates.find(x => x.id === id);
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
    fetchCategories();
  };

  const handleSave = async () => {
    const err = (message) => setModal({ isOpen: true, title: 'Validation Error', message, type: 'error', mode: 'alert', onConfirm: null });
    if (!formData.name.trim()) return err('Template name is required.');
    if (!formData.doctorCol || !formData.typeCol || !formData.timeCol) return err('Doctor, Appointment type and Check-in time columns are required.');
    if ((formData.activityTypes || []).some(a => !a.code.trim())) return err('Every activity type needs a code.');
    setIsSaving(true);
    try {
      const payload = { ...formData, slotMinutes: Math.max(5, parseInt(formData.slotMinutes, 10) || 30), type: 'consultation_schedule', masterHeaders, masterColumnValues, updatedAt: new Date().toISOString() };
      delete payload.endTimeCol; // check-out / end time is no longer used
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
    } catch (e) {
      setModal({ isOpen: true, title: 'Save Error', message: e.message, type: 'error', mode: 'alert', onConfirm: null });
    } finally { setIsSaving(false); }
  };

  const handleDelete = () => {
    if (!selectedTemplateId) return;
    setModal({
      isOpen: true, title: 'Delete Template', type: 'warning', mode: 'confirm', confirmText: 'Delete',
      message: `Are you sure you want to delete "${formData.name}"? This cannot be undone.`,
      onConfirm: async () => {
        await deleteDoc(doc(db, 'templates', selectedTemplateId));
        setSelectedTemplateId('');
        setFormData(DEFAULT_FORM);
        setMasterHeaders([]);
        setMasterColumnValues({});
        await fetchTemplates();
        setModal(p => ({ ...p, isOpen: false }));
      },
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
            colVals[h] = [...vals].sort((a, b) => a.localeCompare(b));
          });
          setMasterColumnValues(colVals);
        }
      } catch (err) { console.error(err); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const setField = (k, v) => setFormData(p => ({ ...p, [k]: v }));
  const addFilter = () => setFormData(p => ({ ...p, globalFilters: [...(p.globalFilters || []), { id: `gf_${Date.now()}`, conditionCol: '', operator: '==', conditionVals: [] }] }));
  const updateFilter = (id, u) => setFormData(p => ({ ...p, globalFilters: (p.globalFilters || []).map(f => f.id === id ? { ...f, ...u } : f) }));
  const removeFilter = (id) => setFormData(p => ({ ...p, globalFilters: (p.globalFilters || []).filter(f => f.id !== id) }));
  const updateType = (id, u) => setFormData(p => ({ ...p, activityTypes: p.activityTypes.map(a => a.id === id ? { ...a, ...u } : a) }));
  const removeType = (id) => setFormData(p => ({ ...p, activityTypes: p.activityTypes.filter(a => a.id !== id) }));
  const addType = () => setFormData(p => ({ ...p, activityTypes: [...p.activityTypes, { id: `at_${Date.now()}`, code: '', label: '', values: [], color: 'FFFFF9C4' }] }));
  const typeValueOptions = masterColumnValues[formData.typeCol] || [];

  if (loading) return <div className="loading-screen"><Loader2 className="spinner" size={32} /> Loading Consultation Schedule Designer...</div>;

  const colOptions = masterHeaders.length ? masterHeaders : null;
  const toMin = (s, d) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : d; };
  const slotCount = Math.max(0, Math.ceil((toMin(formData.slotEnd, 1260) - toMin(formData.slotStart, 360)) / Math.max(5, parseInt(formData.slotMinutes, 10) || 30)));

  return (
    <div style={{ padding: '0 20px', minHeight: 'calc(100vh - 100px)', color: 'var(--text-main)' }}>
      <header className="page-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button onClick={() => navigate('/templates')} className="btn-secondary" style={{ padding: '8px', borderRadius: '50%', background: 'var(--glass-bg)', border: '1px solid var(--border)' }}><ArrowLeft size={18} /></button>
              <Stethoscope size={32} color="var(--primary)" /> Consultation Schedule Designer
            </h1>
            <p className="page-description">Monthly doctor schedule: dates down the side, time slots across the top, counts like C-1, R-2 in each cell. Doctor and month are chosen from the uploaded Excel at report time.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {selectedTemplateId && (
              <button onClick={handleDelete} className="btn-secondary" style={{ padding: '12px 20px', gap: '8px', color: 'var(--error)', border: '1px solid var(--error)' }}><Trash2 size={18} /> Delete</button>
            )}
            <button onClick={handleSave} disabled={isSaving} className="btn-primary modern-icon-box" style={{ minWidth: '160px', padding: '12px 24px', gap: '8px', background: 'var(--primary)', color: 'white' }}>
              {isSaving ? <Loader2 className="spinner" size={18} /> : (saveStatus ? <CheckCircle2 size={18} /> : <Save size={18} />)}
              {saveStatus || (selectedTemplateId ? 'Update Template' : 'Save Template')}
            </button>
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* LEFT: general + columns */}
        <div className="glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label>Load Existing Template</label>
            <select value={selectedTemplateId} onChange={e => {
              setSelectedTemplateId(e.target.value);
              if (e.target.value) loadTemplate(e.target.value);
              else { setFormData(DEFAULT_FORM); setMasterHeaders([]); setMasterColumnValues({}); setSelectedCategoryId(''); }
            }}>
              <option value="">+ Create New Consultation Schedule</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Template Name *</label>
            <input value={formData.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Daily Doctor Schedule" />
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
            <input value={formData.reportTitle} onChange={e => setField('reportTitle', e.target.value)} />
          </div>

          <div>
            <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--secondary)', marginBottom: '8px' }}>Column Detection</p>
            <button onClick={() => fileRef.current?.click()} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '11px', gap: '6px', width: '100%' }}>
              <Upload size={12} /> Load Sample File (Auto-detect Columns)
            </button>
            <input type="file" ref={fileRef} style={{ display: 'none' }} accept=".xlsx,.xls,.csv" onChange={handleSampleFile} />
            {masterHeaders.length > 0 && <p style={{ fontSize: '10px', color: 'var(--success)', marginTop: '6px' }}>✓ {masterHeaders.length} columns detected</p>}
          </div>

          <div style={{ padding: '14px', background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--secondary)' }}>Excel Columns</p>
            {COLUMN_FIELDS.map(f => (
              <div className="form-group" key={f.key}>
                <label style={{ fontSize: '12px' }}>{f.label}</label>
                {colOptions ? (
                  <select value={formData[f.key]} onChange={e => setField(f.key, e.target.value)}>
                    <option value="">— None —</option>
                    {formData[f.key] && !colOptions.includes(formData[f.key]) && <option value={formData[f.key]}>{formData[f.key]}</option>}
                    {colOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                ) : (
                  <input value={formData[f.key]} onChange={e => setField(f.key, e.target.value)} placeholder="Column header (or load a sample file)" />
                )}
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{f.hint}</p>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: slots + activity types */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>Global Filters {(formData.globalFilters || []).length > 0 && `(${formData.globalFilters.length})`}</p>
              <button onClick={addFilter} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', gap: '6px' }}><Plus size={12} /> Add Filter</button>
            </div>
            {(formData.globalFilters || []).length === 0 && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No filters. Every row of the uploaded file is used. Filters apply to the doctor list, the month list and the report.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(formData.globalFilters || []).map(f => (
                <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 180px 2fr 32px', gap: '12px', alignItems: 'start', padding: '12px', background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                  <div className="form-group"><label style={{ fontSize: '11px' }}>Column</label>
                    {colOptions ? (
                      <select value={f.conditionCol} onChange={e => updateFilter(f.id, { conditionCol: e.target.value, conditionVals: [] })}>
                        <option value="">— Select column —</option>
                        {f.conditionCol && !colOptions.includes(f.conditionCol) && <option value={f.conditionCol}>{f.conditionCol}</option>}
                        {colOptions.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    ) : (
                      <input value={f.conditionCol} onChange={e => updateFilter(f.id, { conditionCol: e.target.value })} placeholder="Column header" />
                    )}
                  </div>
                  <div className="form-group"><label style={{ fontSize: '11px' }}>Condition</label>
                    <select value={f.operator} onChange={e => updateFilter(f.id, { operator: e.target.value })}>
                      {FILTER_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', display: 'block', marginBottom: '6px' }}>Values</label>
                    {f.conditionCol && (masterColumnValues[f.conditionCol] || []).length > 0 ? (
                      <MultiSelectCheckboxDropdown
                        options={masterColumnValues[f.conditionCol]}
                        values={f.conditionVals || []}
                        onChange={vals => updateFilter(f.id, { conditionVals: vals })}
                        placeholder="Select values..."
                      />
                    ) : (
                      <input value={(f.conditionVals || []).join(', ')} onChange={e => updateFilter(f.id, { conditionVals: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder={f.conditionCol ? 'Type values, comma separated (or load a sample file)' : 'Choose a column first'} disabled={!f.conditionCol} />
                    )}
                  </div>
                  <button onClick={() => removeFilter(f.id)} className="btn-secondary" title="Remove filter" style={{ padding: '6px', marginTop: '22px', color: 'var(--error)' }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="glass" style={{ padding: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '14px' }}>Time Grid</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
              <div className="form-group"><label>Day starts</label><input type="time" value={formData.slotStart} onChange={e => setField('slotStart', e.target.value)} /></div>
              <div className="form-group"><label>Day ends</label><input type="time" value={formData.slotEnd} onChange={e => setField('slotEnd', e.target.value)} /></div>
              <div className="form-group"><label>Slot length (minutes)</label><input type="number" min="5" step="5" value={formData.slotMinutes} onChange={e => setField('slotMinutes', e.target.value)} /></div>
              <div className="form-group"><label>Label when no work</label><input value={formData.freeLabel} onChange={e => setField('freeLabel', e.target.value)} /></div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>≈ {slotCount} rows per report. Each appointment is counted once, in the slot that contains its check-in time.</p>
          </div>

          <div className="glass" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>Activity Types (code ← values of the appointment type column)</p>
              <button onClick={addType} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', gap: '6px' }}><Plus size={12} /> Add Type</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {formData.activityTypes.map(a => (
                <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 2fr 40px 32px', gap: '12px', alignItems: 'start', padding: '12px', background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                  <div className="form-group"><label style={{ fontSize: '11px' }}>Code</label><input value={a.code} onChange={e => updateType(a.id, { code: e.target.value })} style={{ fontWeight: '700' }} /></div>
                  <div className="form-group"><label style={{ fontSize: '11px' }}>Name</label><input value={a.label} onChange={e => updateType(a.id, { label: e.target.value })} /></div>
                  <div>
                    <label style={{ fontSize: '11px', display: 'block', marginBottom: '6px' }}>Appointment type values</label>
                    {typeValueOptions.length > 0 ? (
                      <MultiSelectCheckboxDropdown
                        options={typeValueOptions}
                        values={a.values || []}
                        onChange={vals => updateType(a.id, { values: vals })}
                        placeholder="Select values from the column..."
                      />
                    ) : (
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formData.typeCol ? 'Load a sample file to list the values of this column.' : 'Choose the Appointment type column first.'}</p>
                    )}
                    {(a.keywords || []).length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', color: 'var(--warning)' }}>Legacy keywords still active: {a.keywords.join(', ')}</span>
                        <button onClick={() => updateType(a.id, { keywords: [] })} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '10px', gap: '4px', color: 'var(--error)', border: '1px solid var(--error)' }}>
                          <Trash2 size={10} /> Delete legacy keywords
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="form-group"><label style={{ fontSize: '11px' }}>Color</label>
                    <input type="color" value={`#${(a.color || 'FFFFFFFF').slice(2)}`} onChange={e => updateType(a.id, { color: `FF${e.target.value.slice(1).toUpperCase()}` })} style={{ padding: 0, height: '36px', width: '40px' }} />
                  </div>
                  <button onClick={() => removeType(a.id)} className="btn-secondary" title="Remove" style={{ padding: '6px', marginTop: '22px', color: 'var(--error)' }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>Rows whose appointment type is not assigned to any activity type are ignored.</p>
          </div>

          <div className="glass" style={{ padding: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '10px' }}>Output Preview</p>
            <div style={{ fontSize: '12px', fontFamily: 'monospace', lineHeight: 1.8, color: 'var(--text-muted)' }}>
              <div>{formData.reportTitle} - &lt;Doctor&gt; - &lt;Month&gt;</div>
              <div>Day | Date | {formData.slotStart}-… | next slot | … | Total</div>
              <div style={{ color: 'var(--text-main)' }}>Mon | 01/04/2026 | C-1, R-2 | {formData.freeLabel || 'Free'} | T-1 | …</div>
            </div>
          </div>
        </div>
      </div>

      <ModernModal modal={modal} setModal={setModal} />
    </div>
  );
}
