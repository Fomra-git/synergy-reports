import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, CheckSquare, AlertCircle, Copy } from 'lucide-react';
import SearchableDropdown from './SearchableDropdown';

const OPERATORS = [
  { id: 'eq',          label: 'Equals' },
  { id: 'neq',         label: 'Not equals' },
  { id: 'contains',    label: 'Contains' },
  { id: 'not_contains',label: 'Does not contain' },
  { id: 'starts_with', label: 'Starts with' },
  { id: 'ends_with',   label: 'Ends with' },
];

const emptyCheck = () => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  label: '',
  filterColumn: '',
  filterValue: '',
  column: '',
  operator: 'eq',
  expectedValue: '',
  displayColumn: '',
});

const inputSty = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--glass-subtle)', color: 'var(--text)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' };
const labelSty = { fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const dividerSty = { height: '1px', background: 'rgba(99,102,241,0.15)', margin: '4px 0' };

function field(label, children) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={labelSty}>{label}</label>
      {children}
    </div>
  );
}

function AccordionCheck({ check, isOpen, onToggle, onDuplicate, onRemove, onChange, masterHeaders, index }) {
  const op = OPERATORS.find(o => o.id === check.operator) || OPERATORS[0];
  const hasFilter = check.filterColumn && check.filterValue;
  const title = check.label || (hasFilter ? `${check.filterColumn} = "${check.filterValue}"` : check.column) || 'Untitled Check';
  const subtitle = check.column
    ? (hasFilter
        ? `When ${check.filterColumn} = "${check.filterValue}" → ${check.column} ${op.label.toLowerCase()} "${check.expectedValue || '—'}"`
        : `${check.column} ${op.label.toLowerCase()} "${check.expectedValue || '—'}"`)
    : 'No column configured';

  return (
    <div style={{
      border: `1px solid ${isOpen ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
      borderRadius: '12px',
      overflow: 'hidden',
      background: isOpen ? 'rgba(99,102,241,0.04)' : 'rgba(255,255,255,0.02)',
      transition: 'border-color 0.15s',
    }}>
      {/* Accordion Header */}
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', cursor: 'pointer' }}
      >
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
          background: 'linear-gradient(135deg,#6366f1,#818cf8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'white',
        }}>
          {index + 1}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </div>
          {!isOpen && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <button
          onClick={e => { e.stopPropagation(); onDuplicate(); }}
          title="Duplicate"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 5px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
        >
          <Copy size={13} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Delete"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 5px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
        >
          <Trash2 size={13} />
        </button>
        {isOpen ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
      </div>

      {/* Accordion Body */}
      {isOpen && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ height: '1px', background: 'var(--border)', marginBottom: '2px' }} />

          {field('Check Label (optional)',
            <input
              value={check.label || ''}
              placeholder="e.g. Category A — Net Fee check"
              onChange={e => onChange({ ...check, label: e.target.value })}
              style={inputSty}
            />
          )}

          {/* When section */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              When (filter rows — optional)
            </div>
            {field('Category / Filter Column',
              <SearchableDropdown
                options={masterHeaders}
                value={check.filterColumn || ''}
                onChange={v => onChange({ ...check, filterColumn: v })}
                placeholder="Select column (e.g. Category)..."
              />
            )}
            {field('Filter Value (exact)',
              <input
                value={check.filterValue || ''}
                placeholder="e.g. Category A"
                onChange={e => onChange({ ...check, filterValue: e.target.value })}
                style={inputSty}
              />
            )}
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
              Leave blank to check <strong>all rows</strong>. Set both fields to check only rows where that column matches the filter value.
            </p>
          </div>

          <div style={dividerSty} />

          {/* Then check section */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Then check
            </div>
            {field('Column to Validate',
              <SearchableDropdown
                options={masterHeaders}
                value={check.column || ''}
                onChange={v => onChange({ ...check, column: v })}
                placeholder="Select column (e.g. Net Fee)..."
              />
            )}
            {field('Condition',
              <select
                value={check.operator || 'eq'}
                onChange={e => onChange({ ...check, operator: e.target.value })}
                style={inputSty}
              >
                {OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
            {field('Expected Constant Value',
              <input
                value={check.expectedValue || ''}
                placeholder="e.g. 1000"
                onChange={e => onChange({ ...check, expectedValue: e.target.value })}
                style={inputSty}
              />
            )}
          </div>

          <div style={dividerSty} />

          {field('Identifier Column (shown in results)',
            <SearchableDropdown
              options={masterHeaders}
              value={check.displayColumn || ''}
              onChange={v => onChange({ ...check, displayColumn: v })}
              placeholder="Optional: column to identify the row (e.g. Patient Name)..."
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function ConstantCheckPanel({ constantChecks = [], onChange, masterHeaders = [], showExpected = false, onShowExpectedChange }) {
  const [openId, setOpenId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const addCheck = () => {
    const c = emptyCheck();
    onChange([...constantChecks, c]);
    setOpenId(c.id);
  };

  const duplicateCheck = (check) => {
    const copy = { ...check, id: Date.now().toString() + Math.random().toString(36).slice(2), label: check.label ? check.label + ' (copy)' : '' };
    const idx = constantChecks.findIndex(c => c.id === check.id);
    const next = [...constantChecks];
    next.splice(idx + 1, 0, copy);
    onChange(next);
    setOpenId(copy.id);
  };

  const updateCheck = (id, updated) => onChange(constantChecks.map(c => c.id === id ? updated : c));
  const removeCheck = (id) => {
    onChange(constantChecks.filter(c => c.id !== id));
    if (openId === id) setOpenId(null);
  };

  return (
    <div style={{ background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
      <div
        onClick={() => setPanelOpen(o => !o)}
        style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: 'rgba(99,102,241,0.04)' }}
      >
        <AlertCircle size={16} color="var(--primary)" />
        <span style={{ flex: 1, fontSize: '13px', fontWeight: '700', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Constant Checks
          {constantChecks.length > 0 && (
            <span style={{ marginLeft: '8px', background: 'var(--primary)', color: 'white', borderRadius: '10px', padding: '1px 8px', fontSize: '10px', fontWeight: '700' }}>
              {constantChecks.length}
            </span>
          )}
        </span>
        {panelOpen ? <ChevronUp size={15} color="var(--text-muted)" /> : <ChevronDown size={15} color="var(--text-muted)" />}
      </div>

      {panelOpen && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            Validate column values against constants, optionally filtered by category. The report will list all rows where the value does not match.
          </p>

          {/* Append expected values toggle */}
          <label
            onClick={e => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: showExpected ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', userSelect: 'none' }}
          >
            <input
              type="checkbox"
              checked={!!showExpected}
              onChange={e => onShowExpectedChange?.(e.target.checked)}
              style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>Append expected values to report rows</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>Adds an "Expected [column]" column at the end of each row in the generated report</div>
            </div>
          </label>

          {constantChecks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px', borderRadius: '10px', border: '1px dashed var(--border)' }}>
              No constant checks configured.<br />Add one to validate column values per category.
            </div>
          )}

          {constantChecks.map((check, idx) => (
            <AccordionCheck
              key={check.id}
              index={idx}
              check={check}
              isOpen={openId === check.id}
              onToggle={() => setOpenId(openId === check.id ? null : check.id)}
              onDuplicate={() => duplicateCheck(check)}
              onRemove={() => removeCheck(check.id)}
              onChange={updated => updateCheck(check.id, updated)}
              masterHeaders={masterHeaders}
            />
          ))}

          <button
            onClick={addCheck}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '10px', border: '1px dashed rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.06)', color: 'var(--primary)', fontSize: '12px', fontWeight: '600', cursor: 'pointer', width: '100%', marginTop: '4px' }}
          >
            <Plus size={13} /> Add Constant Check
          </button>
        </div>
      )}
    </div>
  );
}
