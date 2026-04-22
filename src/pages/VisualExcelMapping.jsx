import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, query, getDocs, addDoc, updateDoc, doc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { 
  FileSpreadsheet, 
  Search, 
  Plus, 
  Trash2, 
  Settings, 
  Save, 
  X, 
  ArrowRight,
  GripVertical,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Filter,
  LayoutGrid,
  Upload,
  Calculator,
  BarChart,
  Keyboard,
  List
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useSearchParams, useNavigate } from 'react-router-dom';
import SearchableDropdown from '../components/SearchableDropdown';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import FormulaBuilder from '../components/FormulaBuilder';
import { ArrowLeft } from 'lucide-react';
import ModernModal from '../components/ModernModal';

export default function VisualExcelMapping() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateIdFromUrl = searchParams.get('id');

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [masterHeaders, setMasterHeaders] = useState([]);
  const [masterUniqueValues, setMasterUniqueValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSidebarTab, setActiveSidebarTab] = useState('columns'); // columns, general, filters, report

  // Modal State
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

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
  
  // Mapping Modal State
  const [showModal, setShowModal] = useState(false);
  const [activeCell, setActiveCell] = useState(null); // { colIndex, colLetter }
  const [modalData, setModalData] = useState({
    type: 'direct',
    source: '',
    target: '',
    formula: '',
    conditionCol: '',
    operator: '==',
    conditionVals: [],
    trueOut: '',
    falseOut: ''
  });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isGlobalFilterEnabled: true,
    globalFilters: [], // Pre-mapping (Master Data)
    isOutputFilterEnabled: true,
    outputFilters: [], // Post-mapping (Template Columns)
    isPivotEnabled: false,
    pivotConfig: { rowField: '', colField: '', valField: '', aggType: 'count' },
    isHeaderEnabled: false,
    headerConfig: { type: 'custom', text: '', sourceCol: '' },
    isSummaryMode: false,
    isHighlightEmptyEnabled: false,
    mappings: [],
    sortConfig: { enabled: false, column: '', direction: 'asc', type: 'auto' }
  });

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchTemplates();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const snap = await getDocs(collection(db, 'reportCategories'));
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error('Error fetching categories:', err); }
  };

  // Handle deep-linking / direct template load when templates are ready
  useEffect(() => {
    if (templates.length > 0 && templateIdFromUrl) {
      const template = templates.find(t => t.id === templateIdFromUrl);
      if (template && template.type === 'pivot') {
        navigate(`/pivot-designer?id=${templateIdFromUrl}`, { replace: true });
        return;
      }
      setSelectedTemplateId(templateIdFromUrl);
      loadTemplate(templateIdFromUrl, templates);
    }
  }, [templates, templateIdFromUrl, navigate]);

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

  const loadTemplate = (id, templatesSource = templates) => {
    if (!id) {
       setFormData({
         name: '',
         description: '',
         fileNameFormat: 'Visual_Report_{date}',
         isGlobalFilterEnabled: true,
         globalFilters: [],
         isPivotEnabled: false,
         pivotConfig: { rowField: '', colField: '', valField: '', aggType: 'count' },
         isHeaderEnabled: false,
         headerConfig: { type: 'custom', text: '', sourceCol: '' },
         isSummaryMode: false,
         isHighlightEmptyEnabled: false,
         mappings: []
       });
       setSelectedCategoryId('');
       return;
    }
    const t = templatesSource.find(temp => temp.id === id);
    if (t) {
      // Auto-migrate legacy mappings (missing tags) to grid positions
      const migratedMappings = (t.mappings || []).map((m, idx) => {
        if (!m.tag) {
          // Assign sequential tags A, B, C...
          return { ...m, tag: String.fromCharCode(65 + idx) };
        }
        return m;
      });

      setFormData({
        ...t,
        mappings: migratedMappings,
        globalFilters: (t.globalFilters || []).map(f => ({ ...f, isManual: f.isManual || false })),
        outputFilters: (t.outputFilters || []).map(f => ({ ...f, isManual: f.isManual || false })),
        isOutputFilterEnabled: t.isOutputFilterEnabled !== false,
        pivotConfig: t.pivotConfig || { rowField: '', colField: '', valField: '', aggType: 'count' },
        headerConfig: t.headerConfig || { type: 'custom', text: '', sourceCol: '' },
        sortConfig: t.sortConfig || { enabled: false, column: '', direction: 'asc', type: 'auto' }
      });
      setSelectedCategoryId(categories.find(c => (c.templateIds || []).includes(id))?.id || '');
    }
  };

  const updateCategoryAssignment = async (templateId) => {
    const oldCat = categories.find(c => (c.templateIds || []).includes(templateId));
    if (oldCat?.id === selectedCategoryId) return;
    if (oldCat) await updateDoc(doc(db, 'reportCategories', oldCat.id), { templateIds: arrayRemove(templateId) });
    if (selectedCategoryId) await updateDoc(doc(db, 'reportCategories', selectedCategoryId), { templateIds: arrayUnion(templateId) });
  };

  const handleAddOutputFilter = () => {
    setFormData(prev => ({
      ...prev,
      outputFilters: [...(prev.outputFilters || []), { conditionCol: '', operator: '==', conditionVals: [], isManual: false }]
    }));
  };

  const handleRemoveOutputFilter = (index) => {
    setFormData(prev => ({
      ...prev,
      outputFilters: (prev.outputFilters || []).filter((_, i) => i !== index)
    }));
  };

  const handleOutputFilterChange = (index, field, value) => {
    const newFilters = [...(formData.outputFilters || [])];
    newFilters[index] = { ...newFilters[index], [field]: value };
    setFormData(prev => ({ ...prev, outputFilters: newFilters }));
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
      const headers = rows[0] || [];
      setMasterHeaders(headers.filter(h => h)); // Remove empty headers
      
      // Pre-compute unique values for summary counts
      const uniqueMap = {};
      headers.forEach((header, index) => {
        if (!header) return;
        const values = new Set();
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][index] !== undefined && rows[i][index] !== null) {
            values.add(String(rows[i][index]));
          }
        }
        uniqueMap[header] = Array.from(values).sort();
      });
      setMasterUniqueValues(uniqueMap);
    } catch (err) {
      console.error('File read error:', err);
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      setModal({
        isOpen: true,
        title: 'Missing Information',
        message: 'Please provide a name for your template before saving.',
        type: 'warning',
        mode: 'alert',
        confirmText: 'Got it'
      });
      return;
    }
    setIsSaving(true);
    setSaveStatus('Saving...');
    try {
      if (selectedTemplateId) {
        await updateDoc(doc(db, 'templates', selectedTemplateId), formData);
        await updateCategoryAssignment(selectedTemplateId);
      } else {
        const docRef = await addDoc(collection(db, 'templates'), {
          ...formData,
          createdAt: new Date().toISOString()
        });
        setSelectedTemplateId(docRef.id);
        await updateCategoryAssignment(docRef.id);
        fetchTemplates();
      }
      setSaveStatus('Success!');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setModal({
        isOpen: true,
        title: 'Save Error',
        message: 'There was an issue saving your template to the cloud.',
        type: 'danger',
        mode: 'alert',
        confirmText: 'Retry'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Drag from sidebar (master header → column slot)
  const onDragStart = (e, header) => {
    e.dataTransfer.setData('sourceHeader', header);
    e.dataTransfer.setData('dragType', 'masterHeader');
  };

  const onDragOver = (e) => {
    e.preventDefault();
  };

  // Drag-to-reorder mapped columns
  const [dragReorderIdx, setDragReorderIdx] = useState(null);
  const [dragOverReorderIdx, setDragOverReorderIdx] = useState(null);

  const onColDragStart = (e, idx) => {
    e.stopPropagation();
    e.dataTransfer.setData('dragType', 'reorderCol');
    e.dataTransfer.setData('reorderIdx', String(idx));
    setDragReorderIdx(idx);
  };

  const onColDragOver = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverReorderIdx(idx);
  };

  const onColDrop = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    const dragType = e.dataTransfer.getData('dragType');
    if (dragType === 'reorderCol') {
      const fromIdx = parseInt(e.dataTransfer.getData('reorderIdx'), 10);
      if (fromIdx === idx) { setDragReorderIdx(null); setDragOverReorderIdx(null); return; }
      const newMappings = [...(formData.mappings || [])];
      const [moved] = newMappings.splice(fromIdx, 1);
      newMappings.splice(idx, 0, moved);
      // Re-assign tags A, B, C... in new order
      const retagged = newMappings.map((m, i) => ({ ...m, tag: String.fromCharCode(65 + i) }));
      setFormData(prev => ({ ...prev, mappings: retagged }));
    } else if (dragType === 'masterHeader') {
      // Drop master header onto existing column slot to open configure modal
      const sourceHeader = e.dataTransfer.getData('sourceHeader');
      const mapping = formData.mappings[idx];
      setActiveCell({ colIndex: idx, colLetter: mapping?.tag || String.fromCharCode(65 + idx) });
      setModalData({
        type: 'direct',
        source: sourceHeader || '',
        target: sourceHeader || mapping?.target || '',
        formula: '',
        conditionCol: '',
        operator: '==',
        conditionVals: [],
        trueOut: '',
        falseOut: '',
        columnFilters: []
      });
      setShowModal(true);
    }
    setDragReorderIdx(null);
    setDragOverReorderIdx(null);
  };

  const onDrop = (e, colIndex) => {
    e.preventDefault();
    // Only handle master-header drops on the empty "Add Column" slot
    const dragType = e.dataTransfer.getData('dragType');
    if (dragType !== 'masterHeader') return;
    const sourceHeader = e.dataTransfer.getData('sourceHeader');
    const colLetter = String.fromCharCode(65 + colIndex);
    setActiveCell({ colIndex, colLetter });
    setModalData({
      type: 'direct',
      source: sourceHeader || '',
      target: sourceHeader ? sourceHeader : `Column ${colLetter}`,
      formula: '',
      conditionCol: '',
      operator: '==',
      conditionVals: [],
      trueOut: '',
      falseOut: '',
      columnFilters: []
    });
    setShowModal(true);
  };

  const confirmMapping = () => {
    const newMappings = [...(formData.mappings || [])];
    const colLetter = activeCell?.colLetter;
    if (!colLetter) return;

    // Check if mapping for this column already exists
    const existingIdx = newMappings.findIndex(m => m.tag === colLetter);
    
    const mappingObj = {
      ...modalData,
      tag: colLetter // Hidden tag to identify the visual column
    };

    if (existingIdx >= 0) {
      newMappings[existingIdx] = mappingObj;
    } else {
      newMappings.push(mappingObj);
    }

    setFormData(prev => ({ ...prev, mappings: newMappings }));
    setShowModal(false);
  };

  const removeMapping = (colLetter) => {
    setFormData(prev => ({
      ...prev,
      mappings: (prev.mappings || []).filter(m => m.tag !== colLetter)
    }));
  };

  const filteredHeaders = masterHeaders.filter(h => 
    String(h).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddGlobalFilter = () => {
    setFormData(prev => ({
      ...prev,
      globalFilters: [...(prev.globalFilters || []), { conditionCol: '', operator: '==', conditionVals: [], isManual: false, mode: 'filter' }]
    }));
  };

  const handleRemoveGlobalFilter = (index) => {
    setFormData(prev => ({
      ...prev,
      globalFilters: (prev.globalFilters || []).filter((_, i) => i !== index)
    }));
  };

  const handleGlobalFilterChange = (index, field, value) => {
    const newFilters = [...(formData.globalFilters || [])];
    newFilters[index] = { ...newFilters[index], [field]: value };
    setFormData(prev => ({ ...prev, globalFilters: newFilters }));
  };

  const getMappingForCell = (colLetter) => {
    return (formData.mappings || []).find(m => m.tag === colLetter);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: 'var(--text-muted)' }}>
        <Loader2 className="spinner" size={32} /> Loading Engine...
      </div>
    );
  }

  return (
    <div className="visual-mapper" style={{ padding: '0 20px', minHeight: 'calc(100vh - 100px)', color: 'var(--text-main)' }}>
      <header className="page-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button 
                onClick={() => navigate('/templates')}
                className="btn-secondary" 
                style={{ padding: '8px', borderRadius: '50%', background: 'var(--glass-bg)', border: '1px solid var(--border)' }}
                title="Back to Templates"
              >
                <ArrowLeft size={18} />
              </button>
              <LayoutGrid size={32} color="var(--primary)" /> Visual Excel Mapper
            </h1>
            <p className="page-description">Design your report structure visually. Drag columns into the grid to map them.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
             <button 
               onClick={handleSave} 
               disabled={isSaving}
               className="btn-primary modern-icon-box"
               style={{ minWidth: '160px', padding: '12px 24px', gap: '8px', background: 'var(--primary)', color: 'white' }}
             >
               {isSaving ? <Loader2 className="spinner" size={18} /> : (saveStatus === 'Success!' ? <CheckCircle2 size={18} /> : <Save size={18} />)}
               {saveStatus || (selectedTemplateId ? 'Update Library' : 'Save Library')}
             </button>
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px', height: 'calc(100vh - 220px)' }}>
        
        {/* SIDEBAR */}
        <div className="sidebar-config" style={{ overflow: 'hidden' }}>
          <div className="glass" style={{ padding: '0', height: '100%', display: 'flex', flexDirection: 'column' }}>
            
            {/* TABS HEADER */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--glass-subtle)' }}>
              {['columns', 'general', 'filters', 'report'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveSidebarTab(tab)}
                  style={{
                    flex: 1,
                    padding: '12px 4px',
                    fontSize: '11px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    background: activeSidebarTab === tab ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                    color: activeSidebarTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                    border: 'none',
                    borderBottom: activeSidebarTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: '0.2s'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* TAB 1: COLUMNS */}
              {activeSidebarTab === 'columns' && (
                <>
                  <div className="form-group">
                    <label style={{ fontSize: '12px' }}>Active Template</label>
                    <select 
                      value={selectedTemplateId} 
                      onChange={(e) => { setSelectedTemplateId(e.target.value); loadTemplate(e.target.value); }}
                      style={{ fontSize: '13px' }}
                    >
                      <option value="">+ New Template</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: '600' }}>Master Library</h4>
                      <button onClick={() => fileInputRef.current.click()} className="btn-link" style={{ fontSize: '11px' }}>
                        <Upload size={12} /> Upload
                      </button>
                      <input ref={fileInputRef} type="file" hidden accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
                    </div>

                    <div className="search-box" style={{ marginBottom: '12px' }}>
                      <Search size={12} />
                      <input 
                        placeholder="Filter headers..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ fontSize: '12px', padding: '6px 30px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {masterHeaders.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--text-muted)', fontSize: '11px', border: '1px dashed var(--border)', borderRadius: '10px' }}>
                          Load a file to see columns
                        </div>
                      ) : filteredHeaders.map((header, idx) => (
                        <div 
                          key={idx}
                          draggable
                          onDragStart={(e) => onDragStart(e, header)}
                          className="draggable-header"
                          style={{ 
                            padding: '10px', 
                            background: 'var(--glass-subtle)', 
                            border: '1px solid var(--border)', 
                            borderRadius: '8px', 
                            fontSize: '12px', 
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          <GripVertical size={12} color="var(--text-muted)" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{header}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* TAB 2: GENERAL */}
              {activeSidebarTab === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="form-group">
                    <label>Template Name</label>
                    <input 
                      value={formData.name || ''} 
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Monthly Report"
                    />
                  </div>
                  <div className="form-group">
                    <label>Report Category</label>
                    <select value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)}>
                      <option value="">— No Category —</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Filename Format</label>
                    <input
                      value={formData.fileNameFormat || ''}
                      onChange={e => setFormData(prev => ({ ...prev, fileNameFormat: e.target.value }))}
                      placeholder="Report_{date}.xlsx"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--glass-subtle)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={formData.isHighlightEmptyEnabled || false} 
                        onChange={e => setFormData(prev => ({ ...prev, isHighlightEmptyEnabled: e.target.checked }))}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '13px' }}>Highlight Empty Cells</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.isSummaryMode || false}
                        onChange={e => setFormData(prev => ({ ...prev, isSummaryMode: e.target.checked }))}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '13px' }}>Single Row Summary</span>
                    </label>
                  </div>

                  {/* Sort Configuration */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--glass-subtle)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.sortConfig?.enabled || false}
                        onChange={e => setFormData(prev => ({ ...prev, sortConfig: { ...(prev.sortConfig || {}), enabled: e.target.checked } }))}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>Sort Report Rows</span>
                    </label>
                    {formData.sortConfig?.enabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sort Column</label>
                          <SearchableDropdown
                            options={(formData.mappings || []).map(m => (m.target || m.source || '').trim()).filter(Boolean)}
                            value={formData.sortConfig?.column || ''}
                            onChange={val => setFormData(prev => ({ ...prev, sortConfig: { ...(prev.sortConfig || {}), column: val } }))}
                            placeholder="Select column to sort by..."
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Direction</label>
                            <select
                              value={formData.sortConfig?.direction || 'asc'}
                              onChange={e => setFormData(prev => ({ ...prev, sortConfig: { ...(prev.sortConfig || {}), direction: e.target.value } }))}
                              style={{ padding: '6px', fontSize: '12px', width: '100%' }}
                            >
                              <option value="asc">Ascending (A→Z / 0→9)</option>
                              <option value="desc">Descending (Z→A / 9→0)</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sort Type</label>
                            <select
                              value={formData.sortConfig?.type || 'auto'}
                              onChange={e => setFormData(prev => ({ ...prev, sortConfig: { ...(prev.sortConfig || {}), type: e.target.value } }))}
                              style={{ padding: '6px', fontSize: '12px', width: '100%' }}
                            >
                              <option value="auto">Auto-detect</option>
                              <option value="alpha">Alphabetical</option>
                              <option value="numeric">Numeric</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: FILTERS */}
              {activeSidebarTab === 'filters' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* RAW MASTER DATA FILTER */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-bg)', paddingBottom: '8px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)' }}>Raw Master Data Filter</h4>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                        <input 
                          type="checkbox" 
                          checked={formData.isGlobalFilterEnabled !== false} 
                          onChange={e => setFormData(prev => ({ ...prev, isGlobalFilterEnabled: e.target.checked }))}
                        />
                        Enabled
                      </label>
                    </div>

                    {formData.isGlobalFilterEnabled !== false && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(formData.globalFilters || []).map((filter, index) => (
                          <div key={index} style={{ padding: '12px', background: 'var(--input-bg)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  onClick={() => handleGlobalFilterChange(index, 'mode', 'filter')}
                                  style={{ padding: '2px 8px', fontSize: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: filter.mode !== 'exclude' ? 'var(--primary)' : 'var(--glass-bg)', color: filter.mode !== 'exclude' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: '700' }}
                                >Filter Rows</button>
                                <button
                                  onClick={() => handleGlobalFilterChange(index, 'mode', 'exclude')}
                                  style={{ padding: '2px 8px', fontSize: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: filter.mode === 'exclude' ? '#CD5C5C' : 'var(--glass-bg)', color: filter.mode === 'exclude' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: '700' }}
                                >Exclude Column</button>
                              </div>
                              <button onClick={() => handleRemoveGlobalFilter(index)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}><Plus size={12} style={{ transform: 'rotate(45deg)' }} /></button>
                            </div>

                          <SearchableDropdown
                            options={masterHeaders}
                            value={filter.conditionCol}
                            onChange={(val) => handleGlobalFilterChange(index, 'conditionCol', val)}
                            placeholder={filter.mode === 'exclude' ? 'Select column to exclude...' : 'Select Col...'}
                          />

                          {filter.mode !== 'exclude' && (
                            <>
                          <select
                            value={filter.operator || '=='}
                            onChange={e => handleGlobalFilterChange(index, 'operator', e.target.value)}
                            style={{ padding: '6px', fontSize: '12px' }}
                          >
                            <option value="unique">Unique Only</option>
                            <option value="==">Equals (In)</option>
                            <option value="!=">Not Equals</option>
                            <option value=">">Greater Than (&gt;)</option>
                            <option value="<">Less Than (&lt;)</option>
                            <option value=">=">Greater or Equal (&gt;=)</option>
                            <option value="<=">Less or Equal (&lt;=)</option>
                            <option value="contains">Contains</option>
                            <option value="between">Between</option>
                            <option disabled style={{ color: 'var(--text-muted)', fontSize: '10px' }}>── Date ──</option>
                            <option value="this_month">This Month</option>
                            <option value="prev_month">Previous Month</option>
                            <option value="not_seen_within_days">Not Seen Within Days</option>
                          </select>

                          {(filter.operator === 'this_month' || filter.operator === 'prev_month') ? (
                            <div style={{ fontSize: '11px', color: 'var(--primary)', padding: '4px 6px', background: 'rgba(99,102,241,0.08)', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.2)' }}>
                              Auto-detects from data
                            </div>
                          ) : filter.operator === 'not_seen_within_days' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <input type="number" min="1" placeholder="Days (e.g. 3)" value={filter.conditionVals?.[0] || ''} onChange={e => handleGlobalFilterChange(index, 'conditionVals', [e.target.value])} style={{ padding: '6px', fontSize: '11px' }} />
                              <SearchableDropdown options={masterHeaders} value={filter.groupByCol || ''} onChange={v => handleGlobalFilterChange(index, 'groupByCol', v)} placeholder="Patient / Group By Column..." />
                            </div>
                          ) : filter.operator !== 'unique' && (
                            <div style={{ position: 'relative' }}>
                              <div style={{ position: 'absolute', top: '-18px', right: '0' }}>
                                <button
                                  onClick={() => handleGlobalFilterChange(index, 'isManual', !filter.isManual)}
                                  style={{ background: 'none', border: 'none', color: filter.isManual ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                >
                                  {filter.isManual ? <List size={10} /> : <Keyboard size={10} />}
                                  {filter.isManual ? 'List' : 'Manual'}
                                </button>
                              </div>

                              {filter.operator === 'between' ? (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <input placeholder="Min" value={filter.conditionVals?.[0] || ''} onChange={e => handleGlobalFilterChange(index, 'conditionVals', [e.target.value, filter.conditionVals?.[1] || ''])} style={{ padding: '6px', fontSize: '11px' }} />
                                  <input placeholder="Max" value={filter.conditionVals?.[1] || ''} onChange={e => handleGlobalFilterChange(index, 'conditionVals', [filter.conditionVals?.[0] || '', e.target.value])} style={{ padding: '6px', fontSize: '11px' }} />
                                </div>
                              ) : (
                                filter.isManual ? (
                                  <input
                                    placeholder="e.g. Val1, Val2"
                                    value={Array.isArray(filter.conditionVals) ? filter.conditionVals.join(', ') : filter.conditionVals || ''}
                                    onChange={e => handleGlobalFilterChange(index, 'conditionVals', e.target.value.split(',').map(s => s.trim()))}
                                    style={{ width: '100%', padding: '8px 6px', fontSize: '11px' }}
                                  />
                                ) : (
                                  masterUniqueValues[filter.conditionCol] ? (
                                    <MultiSelectDropdown
                                      options={masterUniqueValues[filter.conditionCol]}
                                      selectedValues={filter.conditionVals || []}
                                      onChange={vals => handleGlobalFilterChange(index, 'conditionVals', vals)}
                                      placeholder="Values..."
                                    />
                                  ) : (
                                    <input placeholder="Value..." value={filter.conditionVals?.[0] || ''} onChange={e => handleGlobalFilterChange(index, 'conditionVals', [e.target.value])} style={{ padding: '6px', fontSize: '11px' }} />
                                  )
                                )
                              )}
                            </div>
                          )}
                          </>
                          )}
                        </div>
                      ))}
                        <button onClick={handleAddGlobalFilter} className="btn-secondary" style={{ width: '100%', padding: '8px', fontSize: '11px' }}>
                          <Plus size={12} /> Add Master Filter
                        </button>
                      </div>
                    )}
                  </div>

                  {/* REPORT OUTPUT FILTERS */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--glass-bg)', paddingTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-bg)', paddingBottom: '8px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--secondary)' }}>Report Output Filters</h4>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                        <input 
                          type="checkbox" 
                          checked={formData.isOutputFilterEnabled !== false} 
                          onChange={e => setFormData(prev => ({ ...prev, isOutputFilterEnabled: e.target.checked }))}
                        />
                        Enabled
                      </label>
                    </div>

                    {formData.isOutputFilterEnabled !== false && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(formData.outputFilters || []).map((filter, index) => (
                          <div key={index} style={{ padding: '12px', background: 'rgba(110, 231, 183, 0.05)', borderRadius: '10px', border: '1px solid rgba(110, 231, 183, 0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '10px', color: 'var(--success)', fontWeight: '700' }}>OUTPUT FILTER #{index+1}</span>
                              <button onClick={() => handleRemoveOutputFilter(index)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}><Plus size={12} style={{ transform: 'rotate(45deg)' }} /></button>
                            </div>
                            
                            <select 
                              value={filter.conditionCol} 
                              onChange={e => handleOutputFilterChange(index, 'conditionCol', e.target.value)}
                              style={{ padding: '8px', fontSize: '12px' }}
                            >
                                <option value="">Select Template Col...</option>
                                {(formData.mappings || []).map((m, idx) => (
                                  <option key={idx} value={m.target}>{m.target} (Col {m.tag})</option>
                                ))}
                            </select>

                            <select
                              value={filter.operator || '=='}
                              onChange={e => handleOutputFilterChange(index, 'operator', e.target.value)}
                              style={{ padding: '6px', fontSize: '12px' }}
                            >
                              <option value="==">In (==)</option>
                              <option value="!=">Not In</option>
                              <option value=">">Greater Than (&gt;)</option>
                              <option value="<">Less Than (&lt;)</option>
                              <option value=">=">Greater or Equal (&gt;=)</option>
                              <option value="<=">Less or Equal (&lt;=)</option>
                              <option value="contains">Has String</option>
                              <option value="between">Between</option>
                              <option disabled style={{ color: 'var(--text-muted)', fontSize: '10px' }}>── Date ──</option>
                              <option value="this_month">This Month</option>
                              <option value="prev_month">Previous Month</option>
                            </select>

                            {filter.operator === 'this_month' || filter.operator === 'prev_month' ? (
                              <div style={{ fontSize: '11px', color: 'var(--primary)', padding: '4px 6px', background: 'rgba(99,102,241,0.08)', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.2)' }}>
                                Auto-detects from data
                              </div>
                            ) : (
                            <div style={{ position: 'relative' }}>
                               <div style={{ position: 'absolute', top: '-18px', right: '0' }}>
                                <button
                                  onClick={() => handleOutputFilterChange(index, 'isManual', !filter.isManual)}
                                  style={{ background: 'none', border: 'none', color: filter.isManual ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                >
                                  {filter.isManual ? <List size={10} /> : <Keyboard size={10} />}
                                  {filter.isManual ? 'List' : 'Manual'}
                                </button>
                              </div>

                              {filter.operator === 'between' ? (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <input placeholder="Min" value={filter.conditionVals?.[0] || ''} onChange={e => handleOutputFilterChange(index, 'conditionVals', [e.target.value, filter.conditionVals?.[1] || ''])} style={{ padding: '6px', fontSize: '11px' }} />
                                  <input placeholder="Max" value={filter.conditionVals?.[1] || ''} onChange={e => handleOutputFilterChange(index, 'conditionVals', [filter.conditionVals?.[0] || '', e.target.value])} style={{ padding: '6px', fontSize: '11px' }} />
                                </div>
                              ) : (
                                filter.isManual ? (
                                  <input 
                                    placeholder="Value..." 
                                    value={Array.isArray(filter.conditionVals) ? filter.conditionVals.join(', ') : filter.conditionVals || ''} 
                                    onChange={e => handleOutputFilterChange(index, 'conditionVals', e.target.value.split(',').map(s => s.trim()))}
                                    style={{ width: '100%', padding: '8px 6px', fontSize: '11px' }}
                                  />
                                ) : (
                                  <input placeholder="Filter Value..." value={filter.conditionVals?.[0] || ''} onChange={e => handleOutputFilterChange(index, 'conditionVals', [e.target.value])} style={{ padding: '6px', fontSize: '11px', width: '100%' }} />
                                )
                              )}
                            </div>
                            )}
                          </div>
                        ))}
                        <button onClick={handleAddOutputFilter} className="btn-secondary" style={{ width: '100%', padding: '8px', fontSize: '11px' }}>
                          <Plus size={12} /> Add Output Filter
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: REPORT */}
              {activeSidebarTab === 'report' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* PIVOT SECTION */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: '600' }}>Pivot Analysis</h4>
                      <input 
                        type="checkbox" 
                        checked={formData.isPivotEnabled} 
                        onChange={e => setFormData(prev => ({ ...prev, isPivotEnabled: e.target.checked }))}
                      />
                    </div>
                    {formData.isPivotEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px', background: 'var(--glass-subtle)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div className="form-group">
                           <label style={{ fontSize: '11px' }}>Row Field</label>
                           <SearchableDropdown options={masterHeaders} value={formData.pivotConfig?.rowField || ''} onChange={v => setFormData(prev => ({ ...prev, pivotConfig: { ...prev.pivotConfig, rowField: v } }))} placeholder="Select..." />
                        </div>
                        <div className="form-group">
                           <label style={{ fontSize: '11px' }}>Col Field</label>
                           <SearchableDropdown options={masterHeaders} value={formData.pivotConfig?.colField || ''} onChange={v => setFormData(prev => ({ ...prev, pivotConfig: { ...prev.pivotConfig, colField: v } }))} placeholder="Optional..." />
                        </div>
                        <div className="form-group">
                           <label style={{ fontSize: '11px' }}>Val Field</label>
                           <SearchableDropdown options={masterHeaders} value={formData.pivotConfig?.valField || ''} onChange={v => setFormData(prev => ({ ...prev, pivotConfig: { ...prev.pivotConfig, valField: v } }))} placeholder="Optional..." />
                        </div>
                        <select value={formData.pivotConfig?.aggType || 'count'} onChange={e => setFormData(prev => ({ ...prev, pivotConfig: { ...prev.pivotConfig, aggType: e.target.value } }))} style={{ padding: '8px', fontSize: '12px' }}>
                           <option value="count">Count Rows</option>
                           <option value="sum">Sum Values</option>
                           <option value="avg">Average Values</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* HEADER SECTION */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: '600' }}>Title Header</h4>
                      <input 
                        type="checkbox" 
                        checked={formData.isHeaderEnabled} 
                        onChange={e => setFormData(prev => ({ ...prev, isHeaderEnabled: e.target.checked }))}
                      />
                    </div>
                    {formData.isHeaderEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--glass-subtle)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <select value={formData.headerConfig?.type || 'custom'} onChange={e => setFormData(prev => ({ ...prev, headerConfig: { ...prev.headerConfig, type: e.target.value } }))} style={{ padding: '8px', fontSize: '12px' }}>
                           <option value="custom">Custom Text</option>
                           <option value="mapped">From Master Column</option>
                        </select>
                        {formData.headerConfig?.type === 'mapped' ? (
                          <SearchableDropdown options={masterHeaders} value={formData.headerConfig?.sourceCol || ''} onChange={v => setFormData(prev => ({ ...prev, headerConfig: { ...prev.headerConfig, sourceCol: v } }))} placeholder="Select source..." />
                        ) : (
                          <input placeholder="Header Title..." value={formData.headerConfig?.text || ''} onChange={e => setFormData(prev => ({ ...prev, headerConfig: { ...prev.headerConfig, text: e.target.value } }))} style={{ padding: '10px' }} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* MAIN CANVAS */}
        <div className="main-canvas" style={{ overflow: 'hidden' }}>
          <div className="glass" style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--glass-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Drop Zone Grid</h3>
               <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>Horizontal scrolling canvas (A-Z)</span>
               </div>
            </div>

            <div style={{ flex: 1, overflowX: 'auto', padding: '32px' }}>
              <div style={{ display: 'flex', gap: '20px', minWidth: 'min-content', alignItems: 'flex-start' }}>

                {/* MAPPED COLUMNS — drag to reorder */}
                {(formData.mappings || []).map((mapping, idx) => {
                  const isDragging = dragReorderIdx === idx;
                  const isDragOver = dragOverReorderIdx === idx;
                  return (
                    <div
                      key={mapping.tag || idx}
                      draggable
                      onDragStart={(e) => onColDragStart(e, idx)}
                      onDragOver={(e) => onColDragOver(e, idx)}
                      onDrop={(e) => onColDrop(e, idx)}
                      onDragEnd={() => { setDragReorderIdx(null); setDragOverReorderIdx(null); }}
                      style={{
                        width: '260px',
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        opacity: isDragging ? 0.45 : 1,
                        transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
                        transition: 'opacity 0.2s, transform 0.15s',
                        cursor: 'default'
                      }}
                    >
                      {/* Column Letter Header with drag handle */}
                      <div style={{
                        textAlign: 'center',
                        background: 'var(--primary)',
                        padding: '8px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '700',
                        color: 'white',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                        boxShadow: isDragOver ? '0 0 0 2px var(--primary)' : 'none'
                      }}>
                        <GripVertical
                          size={16}
                          style={{ cursor: 'grab', opacity: 0.7, flexShrink: 0 }}
                          onMouseDown={e => e.currentTarget.closest('[draggable]').setAttribute('draggable', true)}
                        />
                        <span>Col {mapping.tag} — #{idx + 1}</span>
                        <div style={{ width: 16 }} />
                      </div>

                      {/* Column Card */}
                      <div
                        className="grid-col is-mapped"
                        onClick={() => {
                          setActiveCell({ colIndex: idx, colLetter: mapping.tag });
                          setModalData(mapping);
                          setShowModal(true);
                        }}
                        style={{
                          flex: 1,
                          border: isDragOver ? '2px solid var(--primary)' : '2px dashed var(--border)',
                          borderRadius: '16px',
                          minHeight: '260px',
                          display: 'flex',
                          flexDirection: 'column',
                          background: 'rgba(99, 102, 241, 0.05)',
                          transition: 'all 0.2s',
                          padding: '20px',
                          position: 'relative',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <div style={{ background: 'var(--primary)', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', textTransform: 'uppercase' }}>{mapping.type}</div>
                              {mapping.totalType && mapping.totalType !== 'none' && (
                                <div style={{ background: 'var(--secondary)', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  &Sigma; {mapping.totalType}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); removeMapping(mapping.tag); }}
                              style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>{mapping.target}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>From: {mapping.source || 'Manual/Engine'}</div>
                            {mapping.enableMerging && <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '4px', fontWeight: '700' }}>⊞ MERGE</div>}
                          </div>

                          <div className="btn-link" style={{ width: '100%', textAlign: 'center', background: 'var(--glass-bg)', borderRadius: '8px', padding: '8px' }}>
                            <Settings size={14} /> Configuration
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* ADD COLUMN SLOT */}
                {
                  (formData.mappings || []).length < 26 && (
                    <div
                      onDragOver={onDragOver}
                      onDrop={(e) => onDrop(e, (formData.mappings || []).length)}
                      style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer' }}
                      onClick={() => {
                        const newIdx = (formData.mappings || []).length;
                        const newLetter = String.fromCharCode(65 + newIdx);
                        setActiveCell({ colIndex: newIdx, colLetter: newLetter });
                        setModalData({ type: 'direct', target: '', source: '', enableMerging: false, totalType: 'none', totalLabel: '', findText: '', replaceWith: '', columnFilters: [] });
                        setShowModal(true);
                      }}
                    >
                      <div style={{ textAlign: 'center', background: 'var(--input-bg)', padding: '8px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        Column {String.fromCharCode(65 + (formData.mappings || []).length)}
                      </div>
                      <div style={{ flex: 1, border: '2px dashed var(--border)', borderRadius: '16px', minHeight: '260px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.01)', transition: 'all 0.3s', padding: '20px', position: 'relative' }}>
                        <div style={{ textAlign: 'center', color: 'var(--glass-border)', fontSize: '12px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px dashed currentColor', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Plus size={20} />
                          </div>
                          Click to Add Column<br/>or Drop Header Here
                        </div>
                      </div>
                    </div>
                  )
                }

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONFIG MODAL */}
      {showModal && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content glass" style={{ width: '850px', padding: '32px', background: 'var(--bg-card)', animation: 'fadeIn 0.3s ease-out', maxHeight: '90vh', overflowY: 'auto', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '700' }}>Configure Column {activeCell?.colLetter}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Apply rules for processing data into this cell.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="btn-icon"><X size={24} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
               <div className="form-group">
                 <label>Target Field Name (Display Label)</label>
                 <input 
                   value={modalData.target || ''} 
                   onChange={e => setModalData(prev => ({ ...prev, target: e.target.value }))}
                   placeholder="e.g. Patient Age"
                 />
               </div>


               <div className="form-group">
                 <label>Processing Rule</label>
                 <select 
                   value={modalData.type}
                   onChange={e => setModalData(prev => ({ ...prev, type: e.target.value }))}
                   style={{ color: 'var(--text-main)', background: 'var(--input-bg)' }}
                 >
                   <option value="direct">Direct Mapping (1-to-1)</option>
                   <option value="serial">Serial Number (Row Index)</option>
                   <option value="count">Occurrence Count (Running Total)</option>
                   <option value="math">Mathematical Formula</option>
                   <option value="condition_count">Conditional Count (Dashboard Summary)</option>
                   <option value="time_diff">Time Difference</option>
                   <option value="last_visit_date">Last Visit Date</option>
                 </select>
               </div>

               {modalData.type === 'direct' && (
                 <div className="form-group" style={{ marginTop: '4px' }}>
                    <label>Source Column (from Master)</label>
                    <SearchableDropdown 
                      options={masterHeaders} 
                      value={modalData.source} 
                      onChange={val => setModalData(prev => ({ ...prev, source: val }))}
                      placeholder="Select header..."
                      zIndex={1100} 
                    />
                 </div>
               )}

               {modalData.type === 'last_visit_date' && (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(99,102,241,0.05)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.2)' }}>
                   <div className="form-group">
                     <label style={{ fontSize: '11px' }}>Date Column (Visit Date)</label>
                     <SearchableDropdown options={masterHeaders} value={modalData.source || ''} onChange={val => setModalData(prev => ({ ...prev, source: val }))} placeholder="Select date column..." zIndex={1100} />
                   </div>
                   <div className="form-group">
                     <label style={{ fontSize: '11px' }}>Patient / Group By Column</label>
                     <SearchableDropdown options={masterHeaders} value={modalData.groupByCol || ''} onChange={val => setModalData(prev => ({ ...prev, groupByCol: val }))} placeholder="Select patient ID column..." zIndex={1100} />
                   </div>
                   <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>Shows the latest date found in the date column for each unique value in the group-by column.</p>
                 </div>
               )}

{/* DISPLAY OPTIONS */}
                    <div style={{ background: 'var(--glass-subtle)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '8px' }}>
                       <label style={{ fontSize: '12px', fontWeight: '700', color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <LayoutGrid size={14} /> Display & Formatting
                       </label>
                       
                       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                             <p style={{ fontSize: '14px', fontWeight: '600' }}>Merge Identical Vertical Cells</p>
                             <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Groups repeating values (e.g. Doctor names) into a single centered block.</p>
                          </div>
                          <div 
                             onClick={() => setModalData(prev => ({ ...prev, enableMerging: !prev.enableMerging }))}
                             style={{ 
                               width: '44px', 
                               height: '24px', 
                               borderRadius: '12px', 
                               background: modalData.enableMerging ? 'var(--primary)' : 'var(--glass-border)',
                               position: 'relative',
                               cursor: 'pointer',
                               transition: '0.3s'
                             }}
                          >
                             <div style={{ 
                               width: '18px', 
                               height: '18px', 
                               borderRadius: '50%', 
                               background: 'white', 
                               position: 'absolute', 
                               top: '3px', 
                               left: modalData.enableMerging ? '23px' : '3px',
                               transition: '0.3s',
                               boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                             }} />
                          </div>
                       </div>
                    </div>

                    <div style={{ background: 'var(--glass-subtle)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '8px' }}>
                       <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <Calculator size={14} /> Numerical Calculation
                       </label>
                       
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                           <p style={{ fontSize: '14px', fontWeight: '600' }}>Report Summary (Grand Total)</p>
                           <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Calculate and display a summary result at the end of the report row.</p>
                           
                           <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                              {['none', 'sum', 'avg', 'count', 'min', 'max'].map(type => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setModalData(prev => ({ ...prev, totalType: type }))}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    border: '1px solid var(--border)',
                                    background: modalData.totalType === type ? 'var(--primary)' : 'var(--glass-bg)',
                                    color: modalData.totalType === type ? 'white' : 'var(--text-main)',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase'
                                  }}
                                >
                                  {type}
                                </button>
                              ))}
                           </div>

                           {modalData.totalType !== 'none' && (
                             <div style={{ marginTop: '12px' }}>
                                <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Summary Label (Custom Text)</label>
                                <input 
                                  value={modalData.totalLabel}
                                  onChange={e => setModalData(prev => ({ ...prev, totalLabel: e.target.value }))}
                                  placeholder="e.g. GRAND TOTAL, Average:"
                                  style={{ padding: '8px 12px', fontSize: '13px' }}
                                />
                             </div>
                           )}
                       </div>
                    </div>

                    <div style={{ background: 'var(--glass-subtle)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '8px' }}>
                       <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <Settings size={14} /> Data Cleaning & Transforms
                       </label>
                       
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                           <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Automatically prune or replace text for this specific column.</p>
                           
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              <div className="form-group">
                                 <label style={{ fontSize: '11px' }}>Find Text</label>
                                 <input 
                                   value={modalData.findText || ''}
                                   onChange={e => setModalData(prev => ({ ...prev, findText: e.target.value }))}
                                   placeholder="e.g. Synergy Health, "
                                   style={{ padding: '8px', fontSize: '12px' }}
                                 />
                              </div>
                              <div className="form-group">
                                 <label style={{ fontSize: '11px' }}>Replace With</label>
                                 <input 
                                   value={modalData.replaceWith || ''}
                                   onChange={e => setModalData(prev => ({ ...prev, replaceWith: e.target.value }))}
                                   placeholder="e.g. [Empty]"
                                   style={{ padding: '8px', fontSize: '12px' }}
                                 />
                              </div>
                           </div>
                           
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'var(--glass-bg)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                              <input 
                                type="checkbox"
                                checked={modalData.simplifyDate || false}
                                onChange={e => setModalData(prev => ({ ...prev, simplifyDate: e.target.checked }))}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <div>
                                 <p style={{ fontSize: '12px', fontWeight: '600' }}>Simplify Date (Extract Date Part)</p>
                                 <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Removes Day names and Time (e.g. 'Friday, Feb 27 - 2026 , 9:30 AM' becomes 'Feb 27 - 2026').</p>
                              </div>
                           </div>

                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'var(--glass-bg)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                              <input 
                                type="checkbox"
                                checked={modalData.simplifyTime || false}
                                onChange={e => setModalData(prev => ({ ...prev, simplifyTime: e.target.checked }))}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <div>
                                 <p style={{ fontSize: '12px', fontWeight: '600' }}>Simplify Time (Extract Time Part)</p>
                                 <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Extracts the time (e.g. '9:30 AM').</p>
                              </div>
                           </div>

                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'var(--glass-bg)', borderRadius: '10px', border: '1px solid var(--border)', borderColor: 'var(--primary)' }}>
                                 <input 
                                   type="checkbox"
                                   checked={modalData.normalizeMonth || false}
                                   onChange={e => setModalData(prev => ({ ...prev, normalizeMonth: e.target.checked }))}
                                   style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                 />
                                 <div>
                                    <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--primary)' }}>Normalize Month</p>
                                    <p style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Displays only Month (e.g. 'Apr').</p>
                                 </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'var(--glass-bg)', borderRadius: '10px', border: '1px solid var(--border)', borderColor: 'var(--primary)' }}>
                                 <input 
                                   type="checkbox"
                                   checked={modalData.normalizeWeek || false}
                                   onChange={e => setModalData(prev => ({ ...prev, normalizeWeek: e.target.checked }))}
                                   style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                 />
                                 <div>
                                    <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--primary)' }}>Normalize Week</p>
                                    <p style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Groups by Week from Start.</p>
                                 </div>
                              </div>
                           </div>
                           
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--glass-subtle)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                               <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <BarChart size={14} /> Group-Level Aggregation
                               </label>
                               <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Calculate values across a merged group (e.g. Total Patient Fee).</p>
                               <select 
                                 value={modalData.groupAggType || 'none'}
                                 onChange={e => setModalData(prev => ({ ...prev, groupAggType: e.target.value }))}
                                 style={{ padding: '8px', fontSize: '12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)' }}
                               >
                                 <option value="none">None (Show individual rows)</option>
                                 <option value="sum">Sum (Add all values in group)</option>
                                 <option value="count">Count (Number of items in group)</option>
                                 <option value="avg">Average (Mean of group)</option>
                                 <option value="min">Minimum Value in group</option>
                                 <option value="max">Maximum Value in group</option>
                               </select>

                               {(modalData.groupAggType && modalData.groupAggType !== 'none') && (
                                 <div style={{ marginTop: '4px' }}>
                                   <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Grouped By (Level):</label>
                                   <select 
                                     value={modalData.groupAggBy || ''}
                                     onChange={e => setModalData(prev => ({ ...prev, groupAggBy: e.target.value }))}
                                     style={{ width: '100%', padding: '8px', fontSize: '12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)' }}
                                   >
                                     <option value="">Default (All Merged Cols to Left)</option>
                                     {formData.mappings
                                       .filter(m => m.enableMerging && m.target)
                                       .map(m => (
                                         <option key={m.tag} value={m.target}>{m.target}</option>
                                       ))
                                     }
                                   </select>
                                 </div>
                               )}
                            </div>

                            <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>* Whitespace will be automatically trimmed after replacement.</p>
                       </div>
                    </div>

               {modalData.type === 'direct' && (
                 <div className="form-group">
                    <label>Source Column (from Master)</label>
                    <SearchableDropdown 
                      options={masterHeaders} 
                      value={modalData.source} 
                      onChange={val => setModalData(prev => ({ ...prev, source: val }))}
                      placeholder="Select header..."
                    />
                 </div>
               )}

               {modalData.type === 'math' && (
                 <div className="form-group">
                    <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                       <span>Interactive Formula Builder</span>
                       <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: '700' }}>ADVANCED MATH</span>
                    </label>
                     <FormulaBuilder 
                        formula={modalData.formula || ''} 
                        masterHeaders={masterHeaders} 
                        templateColumns={Object.values(formData.mappings || {})
                          .filter(m => m.target && m.tag !== modalData.tag)
                          .map(m => m.target)}
                        onChange={val => setModalData(prev => ({ ...prev, formula: val }))} 
                     />
                 </div>
               )}

               {modalData.type === 'time_diff' && (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--glass-subtle)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                   <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '700' }}>
                     Time Difference Configuration
                   </div>
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                     <div className="form-group">
                       <label>Start Time (Check-in Col)</label>
                       <SearchableDropdown
                         options={masterHeaders}
                         value={modalData.colB || ''}
                         onChange={val => setModalData(prev => ({ ...prev, colB: val }))}
                         placeholder="Select column..."
                       />
                     </div>
                     <div className="form-group">
                       <label>End Time (Check-out Col)</label>
                       <SearchableDropdown
                         options={masterHeaders}
                         value={modalData.colA || ''}
                         onChange={val => setModalData(prev => ({ ...prev, colA: val }))}
                         placeholder="Select column..."
                       />
                     </div>
                   </div>
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                     <div className="form-group">
                       <label>Output Type</label>
                       <select
                         value={modalData.outType || 'duration_hhmm'}
                         onChange={e => setModalData(prev => ({ ...prev, outType: e.target.value }))}
                         style={{ padding: '8px', fontSize: '12px' }}
                       >
                         <option value="duration_hhmm">Duration (HH:MM)</option>
                         <option value="duration_mins">Duration (Minutes)</option>
                         <option value="exceeds_yn">Exceeds Threshold? (Yes/No)</option>
                         <option value="excess_mins">Excess Above Threshold (Mins)</option>
                         <option value="excess_hhmm">Excess Above Threshold (HH:MM)</option>
                          <option value="remaining_mins">Remaining Below Threshold (Mins)</option>
                          <option value="remaining_hhmm">Remaining Below Threshold (HH:MM)</option>
                       </select>
                     </div>
                     <div className="form-group">
                       <label>Threshold (minutes, e.g. 45)</label>
                       <input
                         type="number"
                         placeholder="e.g. 45"
                         value={modalData.threshold || ''}
                         onChange={e => setModalData(prev => ({ ...prev, threshold: e.target.value }))}
                         style={{ padding: '8px', fontSize: '12px' }}
                       />
                     </div>
                   </div>
                 </div>
               )}

               {(modalData.type === 'condition_count' || modalData.type === 'count') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {modalData.type === 'count' && (
                      <div className="form-group">
                        <label>Field to Count (Target Value)</label>
                        <SearchableDropdown 
                          options={masterHeaders} 
                          value={modalData.source} 
                          onChange={val => setModalData(prev => ({ ...prev, source: val }))}
                          placeholder="Select field to count..."
                        />
                        
                        <div style={{ marginTop: '12px', padding: '12px', background: 'var(--glass-subtle)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                           <div>
                              <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary)' }}>Scope to Contiguous Group</p>
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Counts rows within the current merged block only. Ideal for session subtotals.</p>
                           </div>
                           <div 
                              onClick={() => setModalData(prev => ({ ...prev, isGroupedCount: !prev.isGroupedCount }))}
                              style={{ 
                                width: '36px', 
                                height: '20px', 
                                borderRadius: '10px', 
                                background: modalData.isGroupedCount ? 'var(--primary)' : 'var(--glass-border)',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: '0.3s'
                              }}
                           >
                              <div style={{ 
                                width: '14px', 
                                height: '14px', 
                                borderRadius: '50%', 
                                background: 'var(--text-main)', 
                                position: 'absolute', 
                                top: '3px', 
                                left: modalData.isGroupedCount ? '19px' : '3px',
                                transition: '0.3s'
                              }} />
                           </div>
                        </div>
                      </div>
                    )}
                    
                    <div style={{ background: 'var(--glass-subtle)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase' }}>Filtering Criteria (Optional)</label>
                      
                      {/* Render Multiple Rules */}
                      {modalData.rules?.map((rule, ridx) => (
                        <div key={ridx} style={{ background: 'var(--glass-subtle)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              const newRules = [...modalData.rules];
                              newRules.splice(ridx, 1);
                              setModalData(prev => ({ ...prev, rules: newRules }));
                            }}
                            style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}
                          >
                            <Trash2 size={12} />
                          </button>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label style={{ fontSize: '11px' }}>Condition Field</label>
                            <SearchableDropdown 
                              options={masterHeaders} 
                              value={rule.conditionCol} 
                              onChange={val => {
                                const newRules = [...modalData.rules];
                                newRules[ridx].conditionCol = val;
                                setModalData(prev => ({ ...prev, rules: newRules }));
                              }}
                              placeholder="Select field..."
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="form-group">
                              <label style={{ fontSize: '11px' }}>Comparator</label>
                              <select 
                                value={rule.operator}
                                onChange={e => {
                                  const newRules = [...modalData.rules];
                                  newRules[ridx].operator = e.target.value;
                                  setModalData(prev => ({ ...prev, rules: newRules }));
                                }}
                                style={{ padding: '8px', fontSize: '12px' }}
                              >
                                <option value="==">In (==)</option>
                                <option value="!=">Not In</option>
                                <option value=">">Greater Than (&gt;)</option>
                                <option value="<">Less Than (&lt;)</option>
                                <option value=">=">Greater or Equal (&gt;=)</option>
                                <option value="<=">Less or Equal (&lt;=)</option>
                                <option value="contains">Has String</option>
                                <option value="between">Range (Min,Max)</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label style={{ fontSize: '11px' }}>Criteria Values</label>
                              <div style={{ position: 'relative' }}>
                                 <div style={{ position: 'absolute', top: '-18px', right: '0' }}>
                                    <button 
                                      onClick={() => {
                                        const newRules = [...modalData.rules];
                                        newRules[ridx].isManual = !newRules[ridx].isManual;
                                        setModalData(prev => ({ ...prev, rules: newRules }));
                                      }}
                                      style={{ background: 'none', border: 'none', color: rule.isManual ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    >
                                      {rule.isManual ? <List size={10} /> : <Keyboard size={10} />}
                                      {rule.isManual ? 'List' : 'Manual'}
                                    </button>
                                  </div>
                                  {rule.isManual ? (
                                    <input 
                                      placeholder="e.g. Val1, Val2" 
                                      value={Array.isArray(rule.conditionVals) ? rule.conditionVals.join(', ') : rule.conditionVals || ''} 
                                      onChange={e => {
                                        const newRules = [...modalData.rules];
                                        newRules[ridx].conditionVals = e.target.value.split(',').map(s => s.trim());
                                        setModalData(prev => ({ ...prev, rules: newRules }));
                                      }}
                                      style={{ width: '100%', padding: '8px 6px', fontSize: '11px' }}
                                    />
                                  ) : (
                                    <MultiSelectDropdown 
                                       options={masterUniqueValues[rule.conditionCol] || []}
                                       selectedValues={rule.conditionVals || []}
                                       onChange={vals => {
                                         const newRules = [...modalData.rules];
                                         newRules[ridx].conditionVals = vals;
                                         setModalData(prev => ({ ...prev, rules: newRules }));
                                       }}
                                       placeholder="Values..."
                                    />
                                  )}
                                </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      <button 
                         className="btn-link"
                         onClick={(e) => {
                           e.preventDefault();
                           setModalData(prev => ({ 
                             ...prev, 
                             rules: [...(prev.rules || []), { conditionCol: '', operator: '==', conditionVals: [], isManual: false }] 
                           }));
                         }}
                         style={{ width: '100%', padding: '10px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: '10px', fontSize: '12px' }}
                      >
                         <Plus size={14} /> Add New Condition
                      </button>

                      {(!modalData.rules || modalData.rules.length === 0) && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                          No conditions applied. This column will count all records.
                        </p>
                      )}
                    </div>
                  </div>
                )}

               {/* COLUMN CONDITIONS */}
               <div style={{ background: 'var(--glass-subtle)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                   <label style={{ fontSize: '12px', fontWeight: '700', color: '#f59e0b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <Filter size={14} /> Column Conditions
                   </label>
                   <button
                     type="button"
                     onClick={() => setModalData(prev => ({ ...prev, columnFilters: [...(prev.columnFilters || []), { conditionCol: '', operator: '==', conditionVals: [], isManual: false }] }))}
                     style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '700', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--glass-bg)', cursor: 'pointer', color: 'var(--text-main)' }}
                   >+ Add Condition</button>
                 </div>
                 <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>Show this cell's value only when all conditions are met. Rows that fail will show blank for this column.</p>

                 {(modalData.columnFilters || []).length === 0 && (
                   <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No conditions — shows for all rows.</p>
                 )}

                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   {(modalData.columnFilters || []).map((f, fi) => (
                     <div key={fi} style={{ padding: '12px', background: 'var(--glass-bg)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                       <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                         <button
                           type="button"
                           onClick={() => setModalData(prev => ({ ...prev, columnFilters: (prev.columnFilters || []).filter((_, i) => i !== fi) }))}
                           style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}
                         ><X size={14} /></button>
                       </div>
                       <SearchableDropdown
                         options={masterHeaders}
                         value={f.conditionCol}
                         onChange={val => {
                           const upd = [...(modalData.columnFilters || [])]; upd[fi] = { ...upd[fi], conditionCol: val };
                           setModalData(prev => ({ ...prev, columnFilters: upd }));
                         }}
                         placeholder="Condition column..."
                         zIndex={1200}
                       />
                       <select
                         value={f.operator || '=='}
                         onChange={e => {
                           const upd = [...(modalData.columnFilters || [])]; upd[fi] = { ...upd[fi], operator: e.target.value };
                           setModalData(prev => ({ ...prev, columnFilters: upd }));
                         }}
                         style={{ padding: '6px', fontSize: '12px' }}
                       >
                         <option value="==">Equals (In)</option>
                         <option value="!=">Not Equals</option>
                         <option value=">">Greater Than</option>
                         <option value="<">Less Than</option>
                         <option value=">=">Greater or Equal</option>
                         <option value="<=">Less or Equal</option>
                         <option value="contains">Contains</option>
                         <option value="between">Between</option>
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
                           <input type="number" min="1" placeholder="Days (e.g. 3)" value={(f.conditionVals || [])[0] || ''}
                             onChange={e => { const upd = [...(modalData.columnFilters || [])]; upd[fi] = { ...upd[fi], conditionVals: [e.target.value] }; setModalData(prev => ({ ...prev, columnFilters: upd })); }}
                             style={{ padding: '6px 8px', fontSize: '12px' }} />
                           <SearchableDropdown options={masterHeaders} value={f.groupByCol || ''}
                             onChange={v => { const upd = [...(modalData.columnFilters || [])]; upd[fi] = { ...upd[fi], groupByCol: v }; setModalData(prev => ({ ...prev, columnFilters: upd })); }}
                             placeholder="Patient / Group By Column..." />
                         </div>
                       ) : (
                       <div style={{ position: 'relative', paddingTop: '20px' }}>
                         <div style={{ position: 'absolute', top: '2px', right: '0' }}>
                           <button
                             type="button"
                             onClick={() => {
                               const upd = [...(modalData.columnFilters || [])]; upd[fi] = { ...upd[fi], isManual: !upd[fi].isManual };
                               setModalData(prev => ({ ...prev, columnFilters: upd }));
                             }}
                             style={{ background: 'none', border: 'none', color: f.isManual ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}
                           >
                             {f.isManual ? <List size={10} /> : <Keyboard size={10} />}
                             {f.isManual ? 'List' : 'Manual'}
                           </button>
                         </div>
                         {f.operator === 'between' ? (
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                             <input
                               placeholder="Min value..."
                               value={(f.conditionVals || [])[0] || ''}
                               onChange={e => {
                                 const upd = [...(modalData.columnFilters || [])];
                                 const vals = [...(upd[fi].conditionVals || [])]; vals[0] = e.target.value;
                                 upd[fi] = { ...upd[fi], conditionVals: vals };
                                 setModalData(prev => ({ ...prev, columnFilters: upd }));
                               }}
                               style={{ padding: '6px 8px', fontSize: '12px' }}
                             />
                             <input
                               placeholder="Max value..."
                               value={(f.conditionVals || [])[1] || ''}
                               onChange={e => {
                                 const upd = [...(modalData.columnFilters || [])];
                                 const vals = [...(upd[fi].conditionVals || [])]; vals[1] = e.target.value;
                                 upd[fi] = { ...upd[fi], conditionVals: vals };
                                 setModalData(prev => ({ ...prev, columnFilters: upd }));
                               }}
                               style={{ padding: '6px 8px', fontSize: '12px' }}
                             />
                           </div>
                         ) : f.isManual ? (
                           <input
                             placeholder="Comma-separated values..."
                             value={(f.conditionVals || []).join(', ')}
                             onChange={e => {
                               const upd = [...(modalData.columnFilters || [])];
                               upd[fi] = { ...upd[fi], conditionVals: e.target.value.split(',').map(v => v.trim()).filter(Boolean) };
                               setModalData(prev => ({ ...prev, columnFilters: upd }));
                             }}
                             style={{ padding: '6px 8px', fontSize: '12px', width: '100%' }}
                           />
                         ) : (
                           <MultiSelectDropdown
                             options={f.conditionCol && masterUniqueValues[f.conditionCol] ? masterUniqueValues[f.conditionCol] : []}
                             selectedValues={f.conditionVals || []}
                             onChange={vals => {
                               const upd = [...(modalData.columnFilters || [])];
                               upd[fi] = { ...upd[fi], conditionVals: vals };
                               setModalData(prev => ({ ...prev, columnFilters: upd }));
                             }}
                             placeholder="Select values..."
                           />
                         )}
                       </div>
                       )}
                     </div>
                   ))}
                 </div>
               </div>

                <button onClick={confirmMapping} className="btn-primary btn-full" style={{ padding: '16px' }}>
                  Confirm Mapping for Column {activeCell?.colLetter}
               </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .draggable-header:hover { border-color: var(--primary) !important; background: rgba(99, 102, 241, 0.1) !important; transform: scale(1.02); }
        .grid-col.is-mapped .grid-col-header { color: white; }
        .is-mapped:hover { transform: translateY(-4px); }
        .btn-icon { background: none; border: none; color: var(--text-muted); cursor: pointer; transition: 0.2s; }
        .btn-icon:hover { color: white; transform: rotate(90deg); }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        /* Custom Scrollbar for Modal */
        .modal-content::-webkit-scrollbar { width: 8px; }
        .modal-content::-webkit-scrollbar-track { background: var(--glass-bg); border-radius: 4px; }
        .modal-content::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }
        .modal-content::-webkit-scrollbar-thumb:hover { background: var(--glass-strong); border: 2px solid transparent; background-clip: content-box; }
      `}} />
    </div>
  );
}
