import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, query, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { 
  FileSpreadsheet, 
  Search, 
  Plus, 
  Trash2, 
  Save, 
  X, 
  ArrowLeft,
  GripVertical,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Upload, 
  BarChart4, 
  Settings2, 
  Table as TableIcon,
  Calculator,
  ArrowUp,
  ArrowDown,
  Layers,
  Filter,
  ListFilter,
  ChevronRight,
  Database,
  Layout,
  Sparkles,
  Check,
  PieChart,
  BarChart2,
  TrendingUp
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SearchableDropdown from '../components/SearchableDropdown';
import ModernModal from '../components/ModernModal';
import FormulaBuilder from '../components/FormulaBuilder';
import MultiSelectDropdown from '../components/MultiSelectDropdown';

export default function PivotTemplateManager() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateIdFromUrl = searchParams.get('id');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [masterHeaders, setMasterHeaders] = useState([]);
  const [masterUniqueValues, setMasterUniqueValues] = useState({});
  const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'filters'
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'pivot',
    rowField: '',
    colField: '',
    rowFieldTransforms: { findText: '', replaceWith: '', simplifyDate: false, simplifyTime: false, normalizeMonth: false, normalizeWeek: false },
    colFieldTransforms: { findText: '', replaceWith: '', simplifyDate: false, simplifyTime: false, normalizeMonth: false, normalizeWeek: false },
    pivotColumns: [], // { id, type: 'property'|'aggregation'|'formula', source, operation, displayName, formula, findText, replaceWith, simplifyDate, simplifyTime, normalizeMonth, normalizeWeek }
    globalFilters: [], // { conditionCol, operator, conditionVals }
    outputFilters: [], // { conditionCol, operator, conditionVals }
    isGlobalFilterEnabled: true,
    isOutputFilterEnabled: true,
    fileNameFormat: 'Pivot_Report_{date}',
    isHeaderEnabled: false,
    headerConfig: { type: 'custom', text: '', sourceCol: '' },
    isPivotSummaryEnabled: false,
    isChartEnabled: false,
    chartConfig: { type: 'bar', xAxis: '', yAxes: [] }
  });

  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    mode: 'alert',
    confirmText: 'Confirm',
    onConfirm: null
  });

  const [showRowTransforms, setShowRowTransforms] = useState(false);
  const [showColTransforms, setShowColTransforms] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Handle deep-linking / direct template load
  useEffect(() => {
    if (templates.length > 0 && templateIdFromUrl) {
      const template = templates.find(t => t.id === templateIdFromUrl);
      if (template && template.type !== 'pivot') {
        navigate(`/visual-mapper?id=${templateIdFromUrl}`, { replace: true });
        return;
      }
      setSelectedTemplateId(templateIdFromUrl);
      loadTemplate(templateIdFromUrl);
    }
  }, [templates, templateIdFromUrl, navigate]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'templates'));
      const snapshot = await getDocs(q);
      // Filter only pivot templates or all? 
      // User says "save as template to generate reports", so they might want to see them in the same list.
      // We filter for type: 'pivot' to edit them here.
      const allTemplates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTemplates(allTemplates.filter(t => t.type === 'pivot'));
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = (id) => {
    if (!id) {
      setFormData({
        name: '',
        description: '',
        type: 'pivot',
        rowField: '',
        colField: '',
        pivotColumns: [],
        rowFieldTransforms: { findText: '', replaceWith: '', simplifyDate: false, simplifyTime: false, normalizeMonth: false, normalizeWeek: false },
        colFieldTransforms: { findText: '', replaceWith: '', simplifyDate: false, simplifyTime: false, normalizeMonth: false, normalizeWeek: false },
        isChartEnabled: false,
        chartConfig: { type: 'bar', xAxis: '', yAxes: [] }
      });
      return;
    }
    const t = templates.find(temp => temp.id === id);
    if (t) {
      // Migration 1: old valueFields to pivotColumns
      let cols = t.pivotColumns || [];
      if (cols.length === 0 && t.valueFields && t.valueFields.length > 0) {
        cols = t.valueFields.map((vf, i) => ({
          id: `legacy-${i}`,
          type: 'aggregation',
          ...vf
        }));
      }

      // Migration 2: Inject grouping column if not in list
      if (t.rowField && !cols.some(c => c.type === 'grouping')) {
        cols = [{
          id: 'grp-legacy',
          type: 'grouping',
          source: t.rowField,
          displayName: t.rowField
        }, ...cols];
      }

      setFormData({
        ...t,
        pivotColumns: cols,
        globalFilters: t.globalFilters || [],
        outputFilters: t.outputFilters || [],
        isGlobalFilterEnabled: t.isGlobalFilterEnabled !== false,
        isOutputFilterEnabled: t.isOutputFilterEnabled !== false,
        rowFieldTransforms: t.rowFieldTransforms || { findText: '', replaceWith: '', simplifyDate: false, simplifyTime: false, normalizeMonth: false, normalizeWeek: false },
        colFieldTransforms: t.colFieldTransforms || { findText: '', replaceWith: '', simplifyDate: false, simplifyTime: false, normalizeMonth: false, normalizeWeek: false },
        isChartEnabled: t.isChartEnabled || false,
        chartConfig: t.chartConfig || { type: 'bar', xAxis: '', yAxes: [] },
        fileNameFormat: t.fileNameFormat || 'Pivot_Report_{date}',
        isHeaderEnabled: !!t.isHeaderEnabled,
        headerConfig: t.headerConfig || { type: 'custom', text: '', sourceCol: '' },
        isPivotSummaryEnabled: !!t.isPivotSummaryEnabled
      });
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (rows.length === 0) return;
      
      // Auto-detect header row (first row with significant data)
      const headerRow = rows.find(r => r.filter(c => c !== null && c !== '').length > 2) || rows[0];
      const headers = headerRow.map(h => String(h || "").trim());
      setMasterHeaders(headers.filter(h => h));

      // Extract unique values for filters
      const json = XLSX.utils.sheet_to_json(worksheet);
      const uniques = {};
      headers.forEach(h => {
        if (!h) return;
        const vals = [...new Set(json.map(r => r[h]).filter(v => v !== undefined && v !== null && v !== ''))];
        uniques[h] = vals.slice(0, 100).map(String); // capped for performance
      });
      setMasterUniqueValues(uniques);

    } catch (err) {
      console.error('File read error:', err);
      setModal({
        isOpen: true,
        title: 'Upload Error',
        message: 'Could not read the Excel file. Please ensure it is a valid .xlsx or .csv file.',
        type: 'danger',
        mode: 'alert',
        confirmText: 'OK'
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      setModal({
        isOpen: true,
        title: 'Missing Name',
        message: 'Please provide a name for this pivot template.',
        type: 'warning',
        mode: 'alert',
        confirmText: 'Got it'
      });
      return;
    }
    if (!formData.rowField) {
      setModal({
        isOpen: true,
        title: 'Requirements',
        message: 'A pivot report needs at least one Row Field to group data.',
        type: 'warning',
        mode: 'alert',
        confirmText: 'OK'
      });
      return;
    }

    setIsSaving(true);
    setSaveStatus('Saving...');
    try {
      if (selectedTemplateId) {
        await updateDoc(doc(db, 'templates', selectedTemplateId), {
          ...formData,
          updatedAt: new Date().toISOString()
        });
      } else {
        const docRef = await addDoc(collection(db, 'templates'), {
          ...formData,
          createdAt: new Date().toISOString()
        });
        setSelectedTemplateId(docRef.id);
      }
      setSaveStatus('Success!');
      fetchTemplates();
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('Error');
    } finally {
      setIsSaving(false);
    }
  };

  const addPivotColumn = (type) => {
    const newCol = {
      id: Date.now().toString(),
      type,
      displayName: '',
      source: '', 
      operation: type === 'aggregation' ? 'sum' : '', 
      formula: '',
      showTotal: true,
      findText: '',
      replaceWith: '',
      simplifyDate: false,
      simplifyTime: false,
      normalizeMonth: false,
      normalizeWeek: false
    };
    
    // Maintain rowField sync for backend compat
    let nextRowField = formData.rowField;
    if (type === 'grouping') {
       // Only allow one grouping column ideally, but we'll just track the latest
    }

    setFormData(prev => ({
      ...prev,
      pivotColumns: [...prev.pivotColumns, newCol]
    }));
  };

  const removePivotColumn = (id) => {
    setFormData(prev => ({
      ...prev,
      pivotColumns: prev.pivotColumns.filter(c => c.id !== id)
    }));
  };

  const updatePivotColumn = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      pivotColumns: prev.pivotColumns.map(c => c.id === id ? { ...c, [field]: value } : c),
      rowField: field === 'source' && prev.pivotColumns.find(c => c.id === id)?.type === 'grouping' ? value : prev.rowField
    }));
  };

  const moveColumn = (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === formData.pivotColumns.length - 1) return;
    
    const newCols = [...formData.pivotColumns];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newCols[index], newCols[targetIndex]] = [newCols[targetIndex], newCols[index]];
    
    setFormData(prev => ({ ...prev, pivotColumns: newCols }));
  };

  // --- FILTER HANDLERS ---
  const addFilter = (listType) => {
    setFormData(prev => ({
      ...prev,
      [listType]: [...(prev[listType] || []), { conditionCol: '', operator: '==', conditionVals: [] }]
    }));
  };

  const removeFilter = (listType, index) => {
    setFormData(prev => ({
      ...prev,
      [listType]: prev[listType].filter((_, i) => i !== index)
    }));
  };

  const updateFilter = (listType, index, field, value) => {
    const newList = [...(formData[listType] || [])];
    newList[index] = { ...newList[index], [field]: value };
    setFormData(prev => ({ ...prev, [listType]: newList }));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: 'var(--text-muted)' }}>
        <Loader2 className="spinner" size={32} /> Initializing Pivot Designer...
      </div>
    );
  }

  return (
    <div className="pivot-designer" style={{ padding: '0 20px', minHeight: 'calc(100vh - 100px)', color: 'var(--text-main)' }}>
      <header className="page-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button 
                onClick={() => navigate('/templates')}
                className="btn-secondary" 
                style={{ padding: '8px', borderRadius: '50%', background: 'var(--glass-bg)', border: '1px solid var(--border)' }}
                title="Back to Library"
              >
                <ArrowLeft size={18} />
              </button>
              <BarChart4 size={32} color="var(--primary)" /> Pivot Report Designer
            </h1>
            <p className="page-description">Create multi-aggregation grouped reports from your master data.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
             <button 
               onClick={handleSave} 
               disabled={isSaving}
               className="btn-primary modern-icon-box"
               style={{ minWidth: '160px', padding: '12px 24px', gap: '8px', background: 'var(--primary)', color: 'white' }}
             >
               {isSaving ? <Loader2 className="spinner" size={18} /> : (saveStatus === 'Success!' ? <CheckCircle2 size={18} /> : <Save size={18} />)}
               {saveStatus || (selectedTemplateId ? 'Update Pivot' : 'Save Pivot')}
             </button>
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', height: 'calc(100vh - 220px)' }}>
        
        {/* LEFT PANEL: CONFIG */}
        <div className="glass" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Tabs Header */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            <button 
              onClick={() => setActiveTab('settings')}
              style={{ 
                flex: 1, padding: '16px', fontSize: '12px', fontWeight: '700', border: 'none', cursor: 'pointer',
                background: activeTab === 'settings' ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: activeTab === 'settings' ? 'var(--primary)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                borderBottom: activeTab === 'settings' ? '2px solid var(--primary)' : 'none'
              }}
            >
              <Settings2 size={16} /> SETUP
            </button>
            <button 
              onClick={() => setActiveTab('filters')}
              style={{ 
                flex: 1, padding: '16px', fontSize: '12px', fontWeight: '700', border: 'none', cursor: 'pointer',
                background: activeTab === 'filters' ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: activeTab === 'filters' ? 'var(--primary)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                borderBottom: activeTab === 'filters' ? '2px solid var(--primary)' : 'none'
              }}
            >
              <Filter size={16} /> FILTERS
            </button>
          </div>

          <div style={{ padding: '24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {activeTab === 'settings' ? (
              <>
                <div className="form-group">
                  <label>Load Existing Pivot</label>
                  <select 
                    value={selectedTemplateId} 
                    onChange={(e) => { setSelectedTemplateId(e.target.value); loadTemplate(e.target.value); }}
                  >
                    <option value="">+ Create New Pivot</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Pivot Template Name</label>
                  <input 
                    value={formData.name} 
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Monthly Sales Summary"
                  />
                </div>

                <div className="form-group">
                  <label>Description (Optional)</label>
                  <textarea 
                    value={formData.description} 
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="What does this report show?"
                    style={{ minHeight: '80px', padding: '12px' }}
                  />
                </div>

                {/* FILENAME FORMAT */}
                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileSpreadsheet size={16} color="var(--primary)" /> Filename Format
                  </label>
                  <input 
                    value={formData.fileNameFormat || ''} 
                    onChange={e => setFormData(prev => ({ ...prev, fileNameFormat: e.target.value }))}
                    placeholder="Pivot_Report_{date}.xlsx"
                    style={{ fontSize: '14px' }}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Tip: Use &#123;date&#125; for automatic timestamp.</p>
                </div>

                {/* REPORT TITLE HEADER */}
                <div style={{ marginTop: '8px', padding: '20px', background: 'var(--glass-subtle)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                         <Settings2 size={16} color="var(--secondary)" />
                         <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Report Title Header</h4>
                      </div>
                      <label className="switch-label" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                         <input 
                           type="checkbox" 
                           checked={formData.isHeaderEnabled} 
                           onChange={e => setFormData(prev => ({ ...prev, isHeaderEnabled: e.target.checked }))} 
                         /> Enabled
                      </label>
                   </div>

                   {formData.isHeaderEnabled && (
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div className="form-group">
                           <label style={{ fontSize: '11px' }}>Title Type</label>
                           <div style={{ display: 'flex', gap: '4px' }}>
                              {['custom', 'mapped'].map(type => (
                                <button
                                  key={type}
                                  onClick={() => setFormData(prev => ({ ...prev, headerConfig: { ...prev.headerConfig, type } }))}
                                  style={{
                                    flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid var(--border)',
                                    background: formData.headerConfig.type === type ? 'var(--primary)' : 'var(--glass-bg)',
                                    color: formData.headerConfig.type === type ? 'white' : 'var(--text-main)',
                                    fontSize: '11px', fontWeight: '600'
                                  }}
                                >
                                  {type}
                                </button>
                              ))}
                           </div>
                        </div>

                        {formData.headerConfig.type === 'custom' ? (
                          <div className="form-group">
                             <input 
                                value={formData.headerConfig.text}
                                onChange={e => setFormData(prev => ({ ...prev, headerConfig: { ...prev.headerConfig, text: e.target.value } }))}
                                placeholder="Header Text"
                                style={{ fontSize: '13px' }}
                             />
                          </div>
                        ) : (
                          <div className="form-group">
                             <SearchableDropdown 
                                options={masterHeaders} 
                                value={formData.headerConfig.sourceCol} 
                                onChange={val => setFormData(prev => ({ ...prev, headerConfig: { ...prev.headerConfig, sourceCol: val } }))}
                                placeholder="Map from First Row..."
                             />
                          </div>
                        )}
                     </div>
                   )}
                </div>

                <div style={{ marginTop: 'auto', padding: '16px', background: 'var(--glass-subtle)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '600' }}>Master Columns</h4>
                    <button onClick={() => fileInputRef.current.click()} className="btn-link" style={{ fontSize: '11px' }}>
                      <Upload size={12} /> Load Headers
                    </button>
                    <input ref={fileInputRef} type="file" hidden accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Upload a sample file to populate the column dropdowns below.
                  </p>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                
                {/* ─── GLOBAL FILTERS (RAW DATA) ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={16} /> Master Data Filter
                    </h4>
                    <label className="switch-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="checkbox" checked={formData.isGlobalFilterEnabled} onChange={e => setFormData(p => ({...p, isGlobalFilterEnabled: e.target.checked}))} /> Enabled
                    </label>
                  </div>

                  {formData.isGlobalFilterEnabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {formData.globalFilters.map((f, i) => (
                        <div key={i} className="glass" style={{ padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                          <button onClick={() => removeFilter('globalFilters', i)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}><X size={14} /></button>
                          
                          <div className="form-group" style={{ marginBottom: '8px' }}>
                            <SearchableDropdown options={masterHeaders} value={f.conditionCol} onChange={v => updateFilter('globalFilters', i, 'conditionCol', v)} placeholder="Select Field..." />
                          </div>
                          
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select value={f.operator} onChange={e => updateFilter('globalFilters', i, 'operator', e.target.value)} style={{ padding: '6px', fontSize: '11px', flex: 1 }}>
                              <option value="==">Equals</option>
                              <option value="!=">Not Equals</option>
                              <option value="contains">Contains</option>
                              <option value="unique">Unique Only</option>
                              <option value="between">Between</option>
                            </select>
                            
                            <div style={{ flex: 1.5 }}>
                              {f.operator === 'between' ? (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <input placeholder="Min" value={f.conditionVals[0] || ''} onChange={e => updateFilter('globalFilters', i, 'conditionVals', [e.target.value, f.conditionVals[1]])} style={{ padding: '6px', fontSize: '11px', width: '50%' }} />
                                  <input placeholder="Max" value={f.conditionVals[1] || ''} onChange={e => updateFilter('globalFilters', i, 'conditionVals', [f.conditionVals[0], e.target.value])} style={{ padding: '6px', fontSize: '11px', width: '50%' }} />
                                </div>
                              ) : f.operator !== 'unique' && (
                                <MultiSelectDropdown 
                                  options={masterUniqueValues[f.conditionCol] || []} 
                                  selectedValues={f.conditionVals} 
                                  onChange={vals => updateFilter('globalFilters', i, 'conditionVals', vals)}
                                  placeholder="Values..."
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => addFilter('globalFilters')} className="btn-secondary" style={{ width: '100%', padding: '10px', fontSize: '11px', borderStyle: 'dashed' }}>
                        <Plus size={14} /> Add Pre-Filter Rule
                      </button>
                    </div>
                  )}
                </div>

                {/* ─── OUTPUT FILTERS (AGGREGATED DATA) ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ListFilter size={16} /> Report Output Filter
                    </h4>
                    <label className="switch-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="checkbox" checked={formData.isOutputFilterEnabled} onChange={e => setFormData(p => ({...p, isOutputFilterEnabled: e.target.checked}))} /> Enabled
                    </label>
                  </div>

                  {formData.isOutputFilterEnabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {formData.outputFilters.map((f, i) => (
                        <div key={i} className="glass" style={{ padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                          <button onClick={() => removeFilter('outputFilters', i)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}><X size={14} /></button>
                          
                          <div className="form-group" style={{ marginBottom: '8px' }}>
                            <select 
                              value={f.conditionCol} 
                              onChange={e => updateFilter('outputFilters', i, 'conditionCol', e.target.value)}
                              style={{ padding: '8px', fontSize: '12px' }}
                            >
                              <option value="">Select Result Column...</option>
                              {formData.pivotColumns.map(c => (
                                <option key={c.id} value={c.displayName || (c.type === 'aggregation' ? `${c.operation.toUpperCase()}(${c.source})` : c.source || 'Untitled')}>
                                  {c.displayName || (c.type === 'aggregation' ? `${c.operation.toUpperCase()}(${c.source})` : c.source || 'Untitled')}
                                </option>
                              ))}
                            </select>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select value={f.operator} onChange={e => updateFilter('outputFilters', i, 'operator', e.target.value)} style={{ padding: '6px', fontSize: '11px', flex: 1 }}>
                              <option value="==">In</option>
                              <option value="!=">Not In</option>
                              <option value=">">Greater Than</option>
                              <option value="<">Less Than</option>
                              <option value="between">Between</option>
                            </select>
                            
                            <div style={{ flex: 1.5 }}>
                              {f.operator === 'between' ? (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <input placeholder="Min" value={f.conditionVals[0] || ''} onChange={e => updateFilter('outputFilters', i, 'conditionVals', [e.target.value, f.conditionVals[1]])} style={{ padding: '6px', fontSize: '11px', width: '50%' }} />
                                  <input placeholder="Max" value={f.conditionVals[1] || ''} onChange={e => updateFilter('outputFilters', i, 'conditionVals', [f.conditionVals[0], e.target.value])} style={{ padding: '6px', fontSize: '11px', width: '50%' }} />
                                </div>
                              ) : (
                                <input placeholder="Value..." value={f.conditionVals[0] || ''} onChange={e => updateFilter('outputFilters', i, 'conditionVals', [e.target.value])} style={{ padding: '6px', fontSize: '11px', width: '100%' }} />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => addFilter('outputFilters')} className="btn-secondary" style={{ width: '100%', padding: '10px', fontSize: '11px', borderStyle: 'dashed' }}>
                        <Plus size={14} /> Add Result Filter
                      </button>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: DESIGNER AREA */}
        <div className="glass" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--glass-subtle)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                   <TableIcon size={20} color="var(--secondary)" />
                   <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Pivot Structure</h3>
                </div>
                <label className="switch-label" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: '700' }}>
                   Show Grand Totals:
                   <input 
                     type="checkbox" 
                     checked={formData.isPivotSummaryEnabled} 
                     onChange={e => setFormData(prev => ({ ...prev, isPivotSummaryEnabled: e.target.checked }))} 
                   />
                </label>
             </div>
             
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                   <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Database size={12} /> Row Field (Grouping)
                   </label>
                   <SearchableDropdown 
                      options={masterHeaders} 
                      value={formData.rowField} 
                      onChange={(val) => setFormData(prev => ({ ...prev, rowField: val }))}
                      placeholder="Rows..."
                   />
                   {formData.rowField && (
                      <div style={{ marginTop: '8px' }}>
                         <button 
                            onClick={() => setShowRowTransforms(!showRowTransforms)}
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '10px', background: 'transparent', border: 'none', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}
                         >
                            <Sparkles size={12} /> {showRowTransforms ? 'Hide' : 'Clean Data'}
                         </button>
                         {showRowTransforms && (
                            <div className="glass" style={{ marginTop: '4px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                  <input 
                                     placeholder="Find..." 
                                     value={formData.rowFieldTransforms?.findText} 
                                     onChange={e => setFormData(p => ({...p, rowFieldTransforms: {...p.rowFieldTransforms, findText: e.target.value}}))}
                                     style={{ padding: '6px', fontSize: '11px' }}
                                  />
                                  <input 
                                     placeholder="Replace..." 
                                     value={formData.rowFieldTransforms?.replaceWith} 
                                     onChange={e => setFormData(p => ({...p, rowFieldTransforms: {...p.rowFieldTransforms, replaceWith: e.target.value}}))}
                                     style={{ padding: '6px', fontSize: '11px' }}
                                  />
                               </div>
                               <div style={{ display: 'flex', gap: '10px' }}>
                                  <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                     <input type="checkbox" checked={formData.rowFieldTransforms?.simplifyDate} onChange={e => setFormData(p => ({...p, rowFieldTransforms: {...p.rowFieldTransforms, simplifyDate: e.target.checked}}))} /> Simplify Date
                                  </label>
                                  <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                     <input type="checkbox" checked={formData.rowFieldTransforms?.simplifyTime} onChange={e => setFormData(p => ({...p, rowFieldTransforms: {...p.rowFieldTransforms, simplifyTime: e.target.checked}}))} /> Simplify Time
                                  </label>
                                  <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--primary)', borderLeft: '1px solid var(--border)', paddingLeft: '8px' }}>
                                     <input type="checkbox" checked={formData.rowFieldTransforms?.normalizeMonth} onChange={e => setFormData(p => ({...p, rowFieldTransforms: {...p.rowFieldTransforms, normalizeMonth: e.target.checked}}))} /> Month
                                  </label>
                                  <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--primary)' }}>
                                     <input type="checkbox" checked={formData.rowFieldTransforms?.normalizeWeek} onChange={e => setFormData(p => ({...p, rowFieldTransforms: {...p.rowFieldTransforms, normalizeWeek: e.target.checked}}))} /> Week (Rel.)
                                  </label>
                               </div>
                            </div>
                         )}
                      </div>
                   )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                   <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Layout size={12} /> Column Field (Optional)
                   </label>
                   <SearchableDropdown 
                      options={masterHeaders} 
                      value={formData.colField} 
                      onChange={(val) => setFormData(prev => ({ ...prev, colField: val }))}
                      placeholder="Columns..."
                   />
                   {formData.colField && (
                      <div style={{ marginTop: '8px' }}>
                         <button 
                            onClick={() => setShowColTransforms(!showColTransforms)}
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '10px', background: 'transparent', border: 'none', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}
                         >
                            <Sparkles size={12} /> {showColTransforms ? 'Hide' : 'Clean Data'}
                         </button>
                         {showColTransforms && (
                            <div className="glass" style={{ marginTop: '4px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                  <input 
                                     placeholder="Find..." 
                                     value={formData.colFieldTransforms?.findText} 
                                     onChange={e => setFormData(p => ({...p, colFieldTransforms: {...p.colFieldTransforms, findText: e.target.value}}))}
                                     style={{ padding: '6px', fontSize: '11px' }}
                                  />
                                  <input 
                                     placeholder="Replace..." 
                                     value={formData.colFieldTransforms?.replaceWith} 
                                     onChange={e => setFormData(p => ({...p, colFieldTransforms: {...p.colFieldTransforms, replaceWith: e.target.value}}))}
                                     style={{ padding: '6px', fontSize: '11px' }}
                                  />
                               </div>
                               <div style={{ display: 'flex', gap: '10px' }}>
                                  <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                     <input type="checkbox" checked={formData.colFieldTransforms?.simplifyDate} onChange={e => setFormData(p => ({...p, colFieldTransforms: {...p.colFieldTransforms, simplifyDate: e.target.checked}}))} /> Simplify Date
                                  </label>
                                  <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                     <input type="checkbox" checked={formData.colFieldTransforms?.simplifyTime} onChange={e => setFormData(p => ({...p, colFieldTransforms: {...p.colFieldTransforms, simplifyTime: e.target.checked}}))} /> Simplify Time
                                  </label>
                                  <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--primary)', borderLeft: '1px solid var(--border)', paddingLeft: '8px' }}>
                                     <input type="checkbox" checked={formData.colFieldTransforms?.normalizeMonth} onChange={e => setFormData(p => ({...p, colFieldTransforms: {...p.colFieldTransforms, normalizeMonth: e.target.checked}}))} /> Month
                                  </label>
                                  <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--primary)' }}>
                                     <input type="checkbox" checked={formData.colFieldTransforms?.normalizeWeek} onChange={e => setFormData(p => ({...p, colFieldTransforms: {...p.colFieldTransforms, normalizeWeek: e.target.checked}}))} /> Week (Rel.)
                                  </label>
                               </div>
                            </div>
                         )}
                      </div>
                   )}
                </div>
             </div>
          </div>

          <div style={{ flex: 1, padding: '32px 32px 250px 32px', overflowY: 'auto' }}>
            
            {/* INTEGRATED COLUMNS SECTION */}
            <div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }}></div>
                    Pivot Output Columns
                  </h4>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!formData.pivotColumns.some(c => c.type === 'grouping') && (
                      <button onClick={() => addPivotColumn('grouping')} className="btn-primary" style={{ padding: '8px 12px', fontSize: '11px', gap: '6px' }}>
                        <TableIcon size={14} /> Add Grouping
                      </button>
                    )}
                    <button onClick={() => addPivotColumn('property')} className="btn-secondary" style={{ padding: '8px 12px', fontSize: '11px', gap: '6px' }}>
                      <Layers size={14} /> Add Property
                    </button>
                    <button onClick={() => addPivotColumn('aggregation')} className="btn-secondary" style={{ padding: '8px 12px', fontSize: '11px', gap: '6px' }}>
                      <Plus size={14} /> Add Aggregation
                    </button>
                    <button onClick={() => addPivotColumn('formula')} className="btn-secondary" style={{ padding: '8px 12px', fontSize: '11px', gap: '6px' }}>
                      <Calculator size={14} /> Add Formula
                    </button>
                  </div>
               </div>

               {/* CHARTS CONFIGURATION SECTION */}
               <div className="glass" style={{ marginBottom: '24px', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <BarChart2 size={20} />
                        </div>
                        <div>
                           <h4 style={{ fontSize: '15px', fontWeight: '700' }}>Charts & Visualization</h4>
                           <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Embed a visual summary at the bottom of the report</p>
                        </div>
                     </div>
                     <label className="switch-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input 
                           type="checkbox" 
                           checked={formData.isChartEnabled} 
                           onChange={e => setFormData(prev => ({ ...prev, isChartEnabled: e.target.checked }))} 
                        />
                        <span style={{ fontSize: '12px', fontWeight: '600' }}>{formData.isChartEnabled ? 'Enabled' : 'Disabled'}</span>
                     </label>
                  </div>

                  {formData.isChartEnabled && formData.chartConfig && (
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '20px' }}>
                        <div className="form-group">
                           <label style={{ fontSize: '11px' }}>Chart Type</label>
                           <select 
                              value={formData.chartConfig.type || 'bar'} 
                              onChange={e => setFormData(p => ({...p, chartConfig: {...(p.chartConfig || {}), type: e.target.value}}))}
                              style={{ padding: '10px' }}
                           >
                              <option value="bar">Bar Chart</option>
                              <option value="line">Line Chart</option>
                              <option value="pie">Pie Chart (Single Metric Only)</option>
                           </select>
                        </div>
                        <div className="form-group">
                           <label style={{ fontSize: '11px' }}>Label Column (X-Axis)</label>
                           <select 
                              value={formData.chartConfig?.xAxis || ''} 
                              onChange={e => setFormData(p => ({...p, chartConfig: {...(p.chartConfig || {}), xAxis: e.target.value}}))}
                              style={{ padding: '10px' }}
                           >
                              <option value="">Select Column...</option>
                              {formData.pivotColumns.filter(c => c.type === 'grouping' || c.type === 'property').map(c => (
                                 <option key={c.id} value={c.displayName || c.source}>{c.displayName || c.source}</option>
                               ))}
                           </select>
                        </div>
                        <div className="form-group">
                           <label style={{ fontSize: '11px' }}>Metric Columns (Y-Axis)</label>
                           <div className="glass" style={{ maxHeight: '120px', overflowY: 'auto', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              {formData.pivotColumns.filter(c => (c.type === 'aggregation' || c.type === 'formula') && (c.displayName || c.source)).map(c => {
                                 const val = c.displayName || (c.type === 'aggregation' ? `${c.operation.toUpperCase()}(${c.source})` : c.source || 'Untitled');
                                 return (
                                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', marginBottom: '6px', cursor: 'pointer' }}>
                                       <input 
                                          type="checkbox" 
                                          checked={(formData.chartConfig?.yAxes || []).includes(val)}
                                          onChange={e => {
                                             const current = formData.chartConfig?.yAxes || [];
                                             const next = e.target.checked ? [...current, val] : current.filter(v => v !== val);
                                             setFormData(p => ({...p, chartConfig: {...(p.chartConfig || {}), yAxes: next}}));
                                          }}
                                       />
                                       {val}
                                    </label>
                                 );
                              })}
                           </div>
                        </div>
                     </div>
                  )}
               </div>

               <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {formData.pivotColumns.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px', border: '1px dashed var(--border)', borderRadius: '16px', color: 'var(--text-muted)' }}>
                       <BarChart4 size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                       <p>No columns added yet. Choose a column type above to start.</p>
                    </div>
                  ) : (
                    formData.pivotColumns.map((col, idx) => (
                      <div 
                        key={col.id} 
                        className="glass" 
                        style={{ 
                          padding: '20px', 
                          border: '1px solid var(--border)', 
                          borderRadius: '16px', 
                          background: 'rgba(255,255,255,0.02)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ 
                                padding: '8px', 
                                borderRadius: '8px', 
                                background: col.type === 'aggregation' ? 'rgba(99,102,241,0.1)' : col.type === 'property' ? 'rgba(16,185,129,0.1)' : col.type === 'grouping' ? 'rgba(245,158,11,0.15)' : 'rgba(236,72,153,0.1)',
                                color: col.type === 'aggregation' ? 'var(--primary)' : col.type === 'property' ? 'var(--success)' : col.type === 'grouping' ? '#f59e0b' : '#ec4899'
                              }}>
                                {col.type === 'aggregation' ? <BarChart4 size={16} /> : col.type === 'property' ? <Layers size={16} /> : col.type === 'grouping' ? <TableIcon size={16} /> : <Calculator size={16} />}
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {col.type === 'grouping' ? 'Grouping (Row) Field' : `${col.type} Column`}
                              </span>
                           </div>
                           <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => moveColumn(idx, 'up')} disabled={idx === 0} className="btn-link" style={{ padding: '4px' }}><ArrowUp size={16} /></button>
                              <button onClick={() => moveColumn(idx, 'down')} disabled={idx === formData.pivotColumns.length - 1} className="btn-link" style={{ padding: '4px' }}><ArrowDown size={16} /></button>
                              <button onClick={() => removePivotColumn(col.id)} className="btn-link" style={{ color: 'var(--error)', padding: '4px', marginLeft: '8px' }}><Trash2 size={16} /></button>
                           </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: (col.type === 'formula') ? '1fr' : '1fr 1fr', gap: '16px' }}>
                           {col.type !== 'formula' && (
                             <div className="form-group">
                                <label style={{ fontSize: '11px' }}>{col.type === 'grouping' ? 'Master Column to Group By' : 'Source Master Column'}</label>
                                <SearchableDropdown 
                                  options={masterHeaders} 
                                  value={col.source} 
                                  onChange={val => updatePivotColumn(col.id, 'source', val)}
                                  placeholder="Select column..."
                                />
                             </div>
                           )}
                           
                           {col.type === 'aggregation' && (
                             <div className="form-group">
                                <label style={{ fontSize: '11px' }}>Operation</label>
                                <select 
                                  value={col.operation} 
                                  onChange={e => updatePivotColumn(col.id, 'operation', e.target.value)}
                                  style={{ padding: '10px' }}
                                >
                                  <option value="sum">Summation</option>
                                  <option value="count">Count Rows</option>
                                  <option value="avg">Average</option>
                                  <option value="min">Minimum</option>
                                  <option value="max">Maximum</option>
                                  <optgroup label="── Treatment Split ──">
                                    <option value="count_single">Count Single Treatment (no /)</option>
                                    <option value="count_multi">Count Multiple Treatments (has /)</option>
                                  </optgroup>
                                </select>
                                {(col.operation === 'count_single' || col.operation === 'count_multi') && (
                                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    {col.operation === 'count_single'
                                      ? '✦ Counts rows where the selected column has NO "/" — e.g., "Neck pain"'
                                      : '✦ Counts rows where the selected column has "/" — e.g., "Neck pain / Shoulder pain"'}
                                  </p>
                                )}
                             </div>
                           )}

                           {(col.type === 'aggregation' || col.type === 'formula') && (
                             <div className="form-group" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: '20px' }}>
                                <label className="switch-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={col.showTotal !== false} 
                                    onChange={e => updatePivotColumn(col.id, 'showTotal', e.target.checked)} 
                                  /> Show Total
                                </label>
                             </div>
                           )}

                           {col.type === 'formula' && (
                             <div className="form-group">
                                <label style={{ fontSize: '11px', marginBottom: '8px', display: 'block' }}>Mathematical Expression</label>
                                <FormulaBuilder 
                                  formula={col.formula}
                                  masterHeaders={masterHeaders}
                                  templateColumns={formData.pivotColumns.slice(0, idx).map(c => c.displayName || (c.type === 'aggregation' ? `${c.operation.toUpperCase()}(${c.source})` : c.source || 'Untitled'))}
                                  onChange={val => updatePivotColumn(col.id, 'formula', val)}
                                />
                             </div>
                           )}
                        </div>

                        <div className="form-group">
                           <label style={{ fontSize: '11px' }}>Display Header Name</label>
                           <input 
                              value={col.displayName} 
                              onChange={e => updatePivotColumn(col.id, 'displayName', e.target.value)}
                              placeholder={
                                col.type === 'aggregation' ? (col.source ? `${col.operation.toUpperCase()} of ${col.source}` : "Header Name") :
                                col.type === 'property' || col.type === 'grouping' ? (col.source || "Header Name") : "Calculation Name"
                              }
                           />
                        </div>

                        {col.type !== 'formula' && (
                           <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                              <h5 style={{ fontSize: '10px', color: 'var(--secondary)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                 <Sparkles size={10} /> Data Cleaning & Transforms
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                                 <div>
                                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Find Text</label>
                                    <input 
                                       value={col.findText || ''} 
                                       onChange={e => updatePivotColumn(col.id, 'findText', e.target.value)}
                                       placeholder="Find..."
                                       style={{ padding: '6px', fontSize: '11px' }}
                                    />
                                 </div>
                                 <div>
                                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Replace With</label>
                                    <input 
                                       value={col.replaceWith || ''} 
                                       onChange={e => updatePivotColumn(col.id, 'replaceWith', e.target.value)}
                                       placeholder="Replace..."
                                       style={{ padding: '6px', fontSize: '11px' }}
                                    />
                                 </div>
                              </div>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                 <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={!!col.simplifyDate} onChange={e => updatePivotColumn(col.id, 'simplifyDate', e.target.checked)} /> Simplify Date
                                 </label>
                                 <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={!!col.simplifyTime} onChange={e => updatePivotColumn(col.id, 'simplifyTime', e.target.checked)} /> Simplify Time
                                 </label>
                                 <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--primary)', borderLeft: '1px solid var(--border)', paddingLeft: '8px' }}>
                                    <input type="checkbox" checked={!!col.normalizeMonth} onChange={e => updatePivotColumn(col.id, 'normalizeMonth', e.target.checked)} /> Month
                                 </label>
                                 <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--primary)' }}>
                                    <input type="checkbox" checked={!!col.normalizeWeek} onChange={e => updatePivotColumn(col.id, 'normalizeWeek', e.target.checked)} /> Week (Rel.)
                                 </label>
                              </div>
                           </div>
                        )}
                      </div>
                    ))
                  )}
               </div>
            </div>

          </div>
        </div>
      </div>

      <ModernModal 
        {...modal} 
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
