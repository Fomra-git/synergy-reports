import React, { useRef } from 'react';
import XLSX from 'xlsx-js-style';
import SearchableDropdown from './SearchableDropdown';
import { Files, Upload, X, GitMerge, Rows3, Columns3 } from 'lucide-react';

/**
 * DualFileConfig
 * Lets an admin build a template from TWO different Excel files. The admin uploads
 * a sample of the second file (to expose its columns) and chooses how the two files
 * combine at generation time:
 *   - 'join'     : enrich each File-1 row with matching File-2 columns via a key
 *   - 'append'   : stack File-2 rows under File-1 rows (union of columns)
 *   - 'sections' : append + a "Source File" column so the two files can be grouped apart
 *
 * Stored on the template as:
 *   isDualFile, dualMergeMode, secondaryMasterHeaders,
 *   joinPrimaryKey, joinSecondaryKey, firstFileLabel, secondFileLabel
 *
 * The component appends the second file's columns (and "Source File" for sections mode)
 * into the designer's `masterHeaders`, so every existing column dropdown can map them.
 * Purely additive — templates with dual-file disabled behave exactly as before.
 */
const SOURCE_COL = 'Source File';

export default function DualFileConfig({ formData, setFormData, masterHeaders, setMasterHeaders }) {
  const fileRef = useRef(null);

  const isDual = !!formData.isDualFile;
  const mode = formData.dualMergeMode || 'join';
  const secondaryHeaders = formData.secondaryMasterHeaders || [];
  const primaryOnly = (masterHeaders || []).filter(h => h !== SOURCE_COL && !secondaryHeaders.includes(h));

  // Rebuild the designer's column list: primary columns + secondary columns + (Source File when sections)
  const rebuildHeaders = (secHeaders, withSource) => {
    const union = [...primaryOnly];
    secHeaders.forEach(h => { if (h && !union.includes(h)) union.push(h); });
    if (withSource && !union.includes(SOURCE_COL)) union.push(SOURCE_COL);
    setMasterHeaders(union);
  };

  const patch = (updates) => setFormData(prev => ({ ...prev, ...updates }));

  const toggleDual = () => {
    if (isDual) {
      // Turn off: drop secondary + Source File columns from the dropdown list
      setMasterHeaders(primaryOnly);
      patch({ isDualFile: false });
    } else {
      patch({ isDualFile: true, dualMergeMode: mode });
      rebuildHeaders(secondaryHeaders, mode === 'sections');
    }
  };

  const setMode = (m) => {
    patch({ dualMergeMode: m });
    rebuildHeaders(secondaryHeaders, m === 'sections');
  };

  const handleSecondFile = async (e) => {
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
      patch({ isDualFile: true, secondaryMasterHeaders: headers, dualMergeMode: mode });
      rebuildHeaders(headers, mode === 'sections');
    } catch (err) {
      console.error('Second file read error:', err);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const modeOptions = [
    { id: 'join', label: 'Join by key', icon: <GitMerge size={15} />, desc: 'Match rows of both files on a shared key column' },
    { id: 'append', label: 'Append rows', icon: <Rows3 size={15} />, desc: 'Stack File 2 rows under File 1 (same columns)' },
    { id: 'sections', label: 'Separate sections', icon: <Columns3 size={15} />, desc: 'Append + a "Source File" column to group them apart' },
  ];

  return (
    <div className="glass" style={{ padding: '24px', marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Files size={18} color="var(--primary)" />
          <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Two Excel Files</h3>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
          <input type="checkbox" checked={isDual} onChange={toggleDual} />
          Use a second file
        </label>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: isDual ? '18px' : 0 }}>
        Build this report from two different Excel files. When enabled, users must upload both files to generate
        the report; templates that use a single file are unaffected.
      </p>

      {isDual && (
        <>
          {/* Merge mode selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '18px' }}>
            {modeOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                style={{
                  textAlign: 'left',
                  padding: '12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  background: mode === opt.id ? 'rgba(99, 102, 241, 0.12)' : 'var(--glass-subtle)',
                  border: '1px solid',
                  borderColor: mode === opt.id ? 'var(--primary)' : 'var(--border)',
                  color: 'var(--text-main)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', marginBottom: '4px', color: mode === opt.id ? 'var(--primary)' : 'var(--text-main)' }}>
                  {opt.icon} {opt.label}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{opt.desc}</div>
              </button>
            ))}
          </div>

          {/* Second-file sample uploader */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: secondaryHeaders.length > 0 ? '14px' : 0 }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleSecondFile} style={{ display: 'none' }} />
            <button
              onClick={() => fileRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--primary)', borderRadius: '12px', padding: '10px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              <Upload size={15} /> {secondaryHeaders.length > 0 ? `File 2 sample loaded (${secondaryHeaders.length} columns)` : 'Upload File 2 sample'}
            </button>
          </div>

          {/* Optional file labels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: mode === 'join' ? '14px' : 0 }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>File 1 label</label>
              <input
                type="text"
                value={formData.firstFileLabel || ''}
                onChange={e => patch({ firstFileLabel: e.target.value })}
                placeholder="File 1"
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 14px', fontSize: '13px', color: 'var(--text-main)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>File 2 label</label>
              <input
                type="text"
                value={formData.secondFileLabel || ''}
                onChange={e => patch({ secondFileLabel: e.target.value })}
                placeholder="File 2"
                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 14px', fontSize: '13px', color: 'var(--text-main)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Join keys */}
          {mode === 'join' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>File 1 key column</label>
                <SearchableDropdown
                  options={primaryOnly}
                  value={formData.joinPrimaryKey || ''}
                  onChange={v => patch({ joinPrimaryKey: v })}
                  placeholder="Key in File 1..."
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>File 2 key column</label>
                <SearchableDropdown
                  options={secondaryHeaders}
                  value={formData.joinSecondaryKey || ''}
                  onChange={v => patch({ joinSecondaryKey: v })}
                  placeholder="Key in File 2..."
                />
              </div>
            </div>
          )}

          {secondaryHeaders.length > 0 && (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '14px', lineHeight: 1.5 }}>
              File 2 columns are now available in every column dropdown above, so you can map or pivot them just like File 1 columns.
            </p>
          )}
        </>
      )}
    </div>
  );
}
