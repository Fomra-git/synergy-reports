import React from 'react';
import SearchableDropdown from './SearchableDropdown';
import { Plus, Trash2, MessageCircleQuestion } from 'lucide-react';

/**
 * CustomFieldsEditor
 * Lets an admin define "custom fields" on a template. Each custom field maps a
 * human-friendly label (e.g. "Doctor Name") to a master-file column. During
 * Custom Report generation, the user is prompted to pick values for each field
 * (multi-select, populated from the distinct values found in that column of the
 * uploaded Excel), and the report is filtered to the selected values.
 *
 * Stored on the template as `customFields: [{ id, label, column }]`.
 * Purely additive — templates without custom fields behave exactly as before.
 */
export default function CustomFieldsEditor({ customFields, onChange, columns = [] }) {
  const fields = customFields || [];

  const addField = () =>
    onChange([...fields, { id: Date.now().toString(), label: '', column: '' }]);

  const updateField = (id, key, val) =>
    onChange(fields.map(f => (f.id === id ? { ...f, [key]: val } : f)));

  const removeField = (id) => onChange(fields.filter(f => f.id !== id));

  return (
    <div className="glass" style={{ padding: '24px', marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <MessageCircleQuestion size={18} color="var(--primary)" />
        <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Custom Fields (Custom Report)</h3>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '18px' }}>
        Define questions to ask during <strong>Custom Report</strong> generation. Each field maps a label to a
        column; the user picks values from a multi-select dropdown (built from that column) and the report is
        filtered to the selection. Leave empty to disable custom prompts for this template.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {fields.map((f, idx) => (
          <div
            key={f.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr auto',
              gap: '12px',
              alignItems: 'center',
              padding: '14px',
              background: 'var(--glass-subtle)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
            }}
          >
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>
                Field Label (question)
              </label>
              <input
                type="text"
                value={f.label || ''}
                onChange={e => updateField(f.id, 'label', e.target.value)}
                placeholder="e.g. Doctor Name"
                style={{
                  width: '100%',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  color: 'var(--text-main)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>
                Master Excel Column
              </label>
              <SearchableDropdown
                options={columns}
                value={f.column || ''}
                onChange={v => updateField(f.id, 'column', v)}
                placeholder="Select column..."
              />
            </div>
            <button
              onClick={() => removeField(f.id)}
              title="Remove custom field"
              style={{
                marginTop: '20px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: 'var(--danger, #ef4444)',
                borderRadius: '10px',
                width: '38px',
                height: '38px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addField}
        style={{
          marginTop: fields.length > 0 ? '14px' : '0',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          color: 'var(--primary)',
          borderRadius: '12px',
          padding: '10px 16px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <Plus size={16} /> Add Custom Field
      </button>
    </div>
  );
}
