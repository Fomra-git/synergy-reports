import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  FolderOpen, Plus, Edit2, Trash2, FileSpreadsheet,
  Tag, AlignLeft, X, ChevronDown, ChevronUp
} from 'lucide-react';
import ModernModal from '../components/ModernModal';

export default function ReportCategoriesAdmin() {
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    masterExcelFormatNotes: '',
    templateIds: []
  });
  const [saving, setSaving] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [expandedCat, setExpandedCat] = useState(null);
  const [modal, setModal] = useState({ isOpen: false });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [catSnap, tplSnap] = await Promise.all([
        getDocs(query(collection(db, 'reportCategories'))),
        getDocs(query(collection(db, 'templates')))
      ]);
      setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTemplates(tplSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingCategory(null);
    setFormData({ name: '', description: '', masterExcelFormatNotes: '', templateIds: [] });
    setTemplateSearch('');
    setShowForm(true);
  };

  const openEdit = (cat) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name || '',
      description: cat.description || '',
      masterExcelFormatNotes: cat.masterExcelFormatNotes || '',
      templateIds: cat.templateIds || []
    });
    setTemplateSearch('');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      const data = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        masterExcelFormatNotes: formData.masterExcelFormatNotes.trim(),
        templateIds: formData.templateIds,
        updatedAt: new Date().toISOString()
      };
      if (editingCategory) {
        await updateDoc(doc(db, 'reportCategories', editingCategory.id), data);
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'reportCategories'), data);
      }
      setShowForm(false);
      setEditingCategory(null);
      fetchAll();
    } catch (err) {
      console.error('Error saving category:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (cat) => {
    setModal({
      isOpen: true,
      title: 'Delete Category?',
      message: `Are you sure you want to delete "${cat.name}"? Templates assigned to it will not be deleted.`,
      type: 'danger',
      mode: 'confirm',
      confirmText: 'Delete Category',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'reportCategories', cat.id));
          fetchAll();
          setModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error('Error deleting category:', err);
        }
      }
    });
  };

  const toggleTemplate = (id) => {
    setFormData(prev => ({
      ...prev,
      templateIds: prev.templateIds.includes(id)
        ? prev.templateIds.filter(t => t !== id)
        : [...prev.templateIds, id]
    }));
  };

  const selectAllTemplates = () => {
    const visibleIds = filteredTemplatesForForm.map(t => t.id);
    const allSelected = visibleIds.every(id => formData.templateIds.includes(id));
    if (allSelected) {
      setFormData(prev => ({ ...prev, templateIds: prev.templateIds.filter(id => !visibleIds.includes(id)) }));
    } else {
      setFormData(prev => ({ ...prev, templateIds: [...new Set([...prev.templateIds, ...visibleIds])] }));
    }
  };

  const filteredTemplatesForForm = templates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const getTemplateName = (id) => templates.find(t => t.id === id)?.name || id;

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading categories...
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FolderOpen size={20} color="var(--primary)" />
          <h3 style={{ fontSize: '18px' }}>Report Categories</h3>
          <span style={{ fontSize: '12px', background: 'var(--glass-bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '10px', color: 'var(--text-muted)' }}>
            {categories.length} {categories.length === 1 ? 'category' : 'categories'}
          </span>
        </div>
        {!showForm && (
          <button
            className="btn-primary"
            onClick={openCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
          >
            <Plus size={16} /> New Category
          </button>
        )}
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="glass" style={{ padding: '32px', marginBottom: '32px', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: '700' }}>
              {editingCategory ? `Edit: ${editingCategory.name}` : 'Create New Category'}
            </h4>
            <button
              onClick={() => { setShowForm(false); setEditingCategory(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Name + Description */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Category Name *</label>
              <input
                type="text"
                placeholder="e.g. Sales Reports"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Description</label>
              <input
                type="text"
                placeholder="Short description of this category"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>

          {/* Master Excel Format Notes */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlignLeft size={14} /> Master Excel Format Notes
            </label>
            <textarea
              placeholder="Describe the expected format of the master Excel file — column names, data structure, notes for users uploading this file..."
              value={formData.masterExcelFormatNotes}
              onChange={e => setFormData(prev => ({ ...prev, masterExcelFormatNotes: e.target.value }))}
              rows={4}
              style={{
                width: '100%',
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '12px 16px',
                color: 'var(--text-main)',
                fontFamily: 'inherit',
                fontSize: '14px',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Template Selection */}
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <FileSpreadsheet size={14} /> Assign Templates
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                — {formData.templateIds.length} of {templates.length} selected
              </span>
            </label>

            {/* Search + Select All */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'var(--glass-subtle)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={templateSearch}
                  onChange={e => setTemplateSearch(e.target.value)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '13px', flex: 1, outline: 'none' }}
                />
              </div>
              <button
                onClick={selectAllTemplates}
                style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--glass-subtle)', color: 'var(--text-main)', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
              >
                {filteredTemplatesForForm.every(t => formData.templateIds.includes(t.id)) ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '8px',
              maxHeight: '280px',
              overflowY: 'auto',
              padding: '4px'
            }}>
              {filteredTemplatesForForm.map(t => {
                const isSelected = formData.templateIds.includes(t.id);
                return (
                  <div
                    key={t.id}
                    onClick={() => toggleTemplate(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                      borderRadius: '12px',
                      background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'var(--glass-subtle)',
                      border: '1px solid', borderColor: isSelected ? 'var(--primary)' : 'transparent',
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                  >
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '4px', border: '2px solid', flexShrink: 0,
                      borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                      background: isSelected ? 'var(--primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {isSelected && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1.5 4l2.5 2.5 5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: '500', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.name}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {t.type || 'direct'}
                      </p>
                    </div>
                  </div>
                );
              })}
              {filteredTemplatesForForm.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No templates match your search.
                </div>
              )}
            </div>
          </div>

          {/* Form actions */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setShowForm(false); setEditingCategory(null); }}
              style={{ padding: '10px 24px', borderRadius: '12px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formData.name.trim()}
              className="btn-primary"
              style={{ padding: '10px 24px' }}
            >
              {saving ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
            </button>
          </div>
        </div>
      )}

      {/* Categories list */}
      {categories.length === 0 ? (
        <div className="glass" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '20px' }}>
          <FolderOpen size={40} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }} />
          <p style={{ fontSize: '15px' }}>No categories yet.</p>
          <p style={{ fontSize: '13px', marginTop: '6px' }}>Create one to group your templates and guide users.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {categories.map(cat => {
            const isExpanded = expandedCat === cat.id;
            const assignedTemplates = templates.filter(t => (cat.templateIds || []).includes(t.id));
            return (
              <div key={cat.id} className="glass" style={{ padding: '24px', borderRadius: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: 0 }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Tag size={20} color="var(--primary)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: '700', fontSize: '15px' }}>{cat.name}</p>
                      {cat.description && (
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{cat.description}</p>
                      )}
                      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FileSpreadsheet size={12} /> {assignedTemplates.length} template{assignedTemplates.length !== 1 ? 's' : ''}
                        </span>
                        {cat.masterExcelFormatNotes && (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlignLeft size={12} /> Format notes added
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
                    <button
                      onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                      className="modern-icon-box"
                      style={{ border: 'none', color: 'var(--text-muted)', padding: '6px', display: 'inline-flex' }}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <button
                      onClick={() => openEdit(cat)}
                      className="modern-icon-box"
                      style={{ border: 'none', color: 'var(--primary)', padding: '6px', display: 'inline-flex' }}
                      title="Edit"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      className="modern-icon-box"
                      style={{ border: 'none', color: 'var(--error)', padding: '6px', display: 'inline-flex' }}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                    {cat.masterExcelFormatNotes && (
                      <div style={{ marginBottom: '16px' }}>
                        <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Master Excel Format Notes</p>
                        <div style={{ background: 'var(--glass-subtle)', borderRadius: '10px', padding: '14px 16px', fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                          {cat.masterExcelFormatNotes}
                        </div>
                      </div>
                    )}
                    {assignedTemplates.length > 0 && (
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Assigned Templates</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {assignedTemplates.map(t => (
                            <span key={t.id} style={{ padding: '4px 12px', borderRadius: '8px', background: 'var(--glass-bg)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-main)' }}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {!cat.masterExcelFormatNotes && assignedTemplates.length === 0 && (
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>No additional details.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ModernModal
        {...modal}
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
