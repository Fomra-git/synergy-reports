import React, { useRef } from 'react';
import XLSX from 'xlsx-js-style';
import SearchableDropdown from './SearchableDropdown';
import { Files, Upload, X, GitMerge, Rows3, Columns3, Plus } from 'lucide-react';
import { SOURCE_COL, getSecondaryFiles } from '../utils/multiFileMerge';

/**
 * DualFileConfig
 * Lets an admin build a template from the primary Excel file plus ANY NUMBER of
 * additional Excel files. For each extra file the admin uploads a sample (to expose
 * its columns) and chooses how it combines with the primary data at generation time:
 *   - 'join'     : enrich each primary row with matching columns from this file via a key
 *   - 'append'   : stack this file's rows under the primary rows (union of columns)
 *   - 'sections' : append + a "Source File" column so files can be grouped apart
 *
 * Stored on the template as:
 *   isDualFile (enabled flag),
 *   secondaryFiles: [{ id, mergeMode, headers, joinPrimaryKey, joinSecondaryKey, label }]
 *   firstFileLabel
 *
 * Legacy templates (single secondary via secondaryMasterHeaders / dualMergeMode /
 * joinSecondaryKey / secondFileLabel) are migrated on read by getSecondaryFiles().
 *
 * The component appends every extra file's columns (and "Source File" when any file
 * uses sections) into the designer's `masterHeaders`, so existing column dropdowns can
 * map them. Purely additive — templates with the feature disabled behave as before.
 */
const MODE_OPTIONS = [
  { id: 'join', label: 'Join by key', icon: <GitMerge size={14} />, desc: 'Match rows on a shared key column' },
  { id: 'append', label: 'Append rows', icon: <Rows3 size={14} />, desc: 'Stack this file under the primary' },
  { id: 'sections', label: 'Separate sections', icon: <Columns3 size={14} />, desc: 'Append + a "Source File" column' },
];

export default function DualFileConfig({ formData, setFormData, masterHeaders, setMasterHeaders }) {
  const uploadRefs = useRef({});

  const enabled = !!formData.isDualFile;
  const files = getSecondaryFiles(formData);
  const allSecHeaders = files.flatMap(f => f.headers || []);
  const primaryOnly = (masterHeaders || []).filter(h => h !== SOURCE_COL && !allSecHeaders.includes(h));

  // Rebuild the designer's column list: primary columns + every file's columns + (Source File when any file uses sections)
  const rebuildHeaders = (nextFiles) => {
    const union = [...primaryOnly];
    nextFiles.forEach(f => (f.headers || []).forEach(h => { if (h && !union.includes(h)) union.push(h); }));
    if (nextFiles.some(f => f.mergeMode === 'sections') && !union.includes(SOURCE_COL)) union.push(SOURCE_COL);
    setMasterHeaders(union);
  };

  const commitFiles = (nextFiles) => {
    setFormData(prev => ({ ...prev, isDualFile: true, secondaryFiles: nextFiles }));
    rebuildHeaders(nextFiles);
  };

  const toggle = () => {
    if (enabled) {
      setMasterHeaders(primaryOnly);
      setFormData(prev => ({ ...prev, isDualFile: false }));
    } else {
      // Persist the migrated array so legacy templates keep working, and expose columns
      commitFiles(files);
    }
  };

  const addFile = () => {
    const nf = { id: `sf_${Date.now()}`, mergeMode: 'join', headers: [], joinPrimaryKey: '', joinSecondaryKey: '', label: `File ${files.length + 2}` };
    commitFiles([...files, nf]);
  };

  const updateFile = (id, updates) => commitFiles(files.map(f => f.id === id ? { ...f, ...updates } : f));
  const removeFile = (id) => commitFiles(files.filter(f => f.id !== id));

  const handleSample = async (id, e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (rows.length === 0) return;
      const headerRow = rows.find(r => r.filter(c => c !== null && c !== '').length > 2) || rows[0];
      const headers = headerRow.map(h => String(h || '').trim()).filter(Boolean);
      commitFiles(files.map(f => f.id === id ? { ...f, headers } : f));
    } catch (err) {
      console.error('Extra file read error:', err);
    } finally {
      if (uploadRefs.current[id]) uploadRefs.current[id].value = '';
    }
  };

  const inputStyle = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '9px 12px', fontSize: '13px', color: 'var(--text-main)', outline: 'none', boxSizing: 'border-box' };

  return (
    <div className="glass" style={{ padding: '24px', marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Files size={18} color="var(--primary)" />
          <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Combine Multiple Excel Files</h3>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
          <input type="checkbox" checked={enabled} onChange={toggle} />
          Use additional files
        </label>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: enabled ? '18px' : 0 }}>
        Build this report from the primary file plus any number of additional Excel files. When enabled, users must
        upload every file to generate the report; single-file templates are unaffected.
      </p>

      {enabled && (
        <>
          {/* Primary file label */}
          <div style={{ marginBottom: '16px', maxWidth: '320px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>Primary file label</label>
            <input type="text" value={formData.firstFileLabel || ''} onChange={e => setFormData(prev => ({ ...prev, firstFileLabel: e.target.value }))} placeholder="File 1" style={inputStyle} />
          </div>

          {/* Per-file cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {files.map((f, idx) => (
              <div key={f.id} style={{ border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', background: 'var(--glass-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>Additional File {idx + 1}</span>
                  <button onClick={() => removeFile(f.id)} className="btn-link" style={{ color: 'var(--error)', display: 'flex', padding: '4px' }} title="Remove file"><X size={15} /></button>
                </div>

                {/* Merge mode */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                  {MODE_OPTIONS.map(opt => (
                    <button key={opt.id} onClick={() => updateFile(f.id, { mergeMode: opt.id })}
                      style={{ textAlign: 'left', padding: '10px', borderRadius: '10px', cursor: 'pointer',
                        background: f.mergeMode === opt.id ? 'rgba(99,102,241,0.12)' : 'var(--glass-bg)',
                        border: '1px solid', borderColor: f.mergeMode === opt.id ? 'var(--primary)' : 'var(--border)', color: 'var(--text-main)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '12px', marginBottom: '3px', color: f.mergeMode === opt.id ? 'var(--primary)' : 'var(--text-main)' }}>{opt.icon} {opt.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.35 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Sample uploader + label */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: (f.mergeMode === 'join') ? '12px' : 0, alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>Sample file (to read columns)</label>
                    <input ref={el => { uploadRefs.current[f.id] = el; }} type="file" accept=".xlsx,.xls,.csv" onChange={e => handleSample(f.id, e)} style={{ display: 'none' }} />
                    <button onClick={() => uploadRefs.current[f.id]?.click()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--primary)', borderRadius: '10px', padding: '9px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      <Upload size={14} /> {(f.headers || []).length > 0 ? `${f.headers.length} columns loaded` : 'Upload sample'}
                    </button>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>File label</label>
                    <input type="text" value={f.label || ''} onChange={e => updateFile(f.id, { label: e.target.value })} placeholder={`File ${idx + 2}`} style={inputStyle} />
                  </div>
                </div>

                {/* Join keys */}
                {f.mergeMode === 'join' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>Primary key column</label>
                      <SearchableDropdown options={primaryOnly} value={f.joinPrimaryKey || ''} onChange={v => updateFile(f.id, { joinPrimaryKey: v })} placeholder="Key in primary file..." />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>This file's key column</label>
                      <SearchableDropdown options={f.headers || []} value={f.joinSecondaryKey || ''} onChange={v => updateFile(f.id, { joinSecondaryKey: v })} placeholder="Key in this file..." />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={addFile}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '14px', background: 'var(--glass-bg)', border: '1px dashed var(--primary)', color: 'var(--primary)', borderRadius: '12px', padding: '10px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={15} /> Add another file
          </button>

          {allSecHeaders.length > 0 && (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '14px', lineHeight: 1.5 }}>
              Columns from your additional files are now available in every column dropdown above, so you can map or pivot them just like primary columns.
            </p>
          )}
        </>
      )}
    </div>
  );
}
