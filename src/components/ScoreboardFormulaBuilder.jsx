import React, { useMemo } from 'react';
import { Plus, X } from 'lucide-react';

/**
 * ScoreboardFormulaBuilder
 * A visual chip/token builder for Scoreboard formulas that use the
 * "{{groupId:colId:suffix}}" token format (e.g. {{g_1:c_2:total}} + {{g_3:c_4:total}}).
 *
 * Instead of copy-pasting column IDs and typing "+" between them, the user picks
 * columns by friendly name and taps operator buttons — the token string is built
 * automatically.
 *
 * Props:
 *  - formula      : string   — current formula expression
 *  - onChange     : (str) => void
 *  - columns      : [{ ref: 'g_1:c_2', label: 'Group ▸ Column' }]  referenceable columns
 *  - defaultSuffix: 'total' | 'cur' | 'conv'  suffix applied to newly inserted columns
 *  - globalVars   : [{ ref: 'B:CUR', label: 'Branch Current' }]  optional global tokens
 */

const OPERATORS = [
  { sym: '+', label: '+' },
  { sym: '-', label: '−' },
  { sym: '*', label: '×' },
  { sym: '/', label: '÷' },
  { sym: '(', label: '(' },
  { sym: ')', label: ')' },
];

const SUFFIXES = ['total', 'cur', 'conv'];

// Order matters: braces token → number → identifier (funcs/SUM_ALL) → operators
const TOKEN_REGEX = /(\{\{[^}]*\}\})|(\d+\.\d+|\d+)|([A-Za-z_][A-Za-z0-9_]*)|([+\-*/(),])/g;

const splitSuffix = (inner) => {
  const parts = inner.split(':');
  const last = (parts[parts.length - 1] || '').toLowerCase();
  if (SUFFIXES.includes(last)) {
    return { ref: parts.slice(0, -1).join(':'), suffix: last };
  }
  return { ref: inner, suffix: '' };
};

export default function ScoreboardFormulaBuilder({
  formula = '',
  onChange,
  columns = [],
  defaultSuffix = 'total',
  globalVars = [],
}) {
  const colByRef = useMemo(() => {
    const m = {};
    columns.forEach(c => { m[c.ref.toLowerCase()] = c; });
    globalVars.forEach(v => { m[v.ref.toLowerCase()] = { ...v, isGlobal: true }; });
    return m;
  }, [columns, globalVars]);

  // Parse the formula string into a chip array (derived, not state — single source of truth)
  const tokens = useMemo(() => {
    if (!formula) return [];
    const out = [];
    for (const m of formula.matchAll(TOKEN_REGEX)) {
      if (m[1]) {
        const inner = m[1].replace(/^\{\{|\}\}$/g, '').trim();
        const { ref, suffix } = splitSuffix(inner);
        const known = colByRef[ref.toLowerCase()];
        out.push({
          type: known?.isGlobal ? 'var' : 'col',
          ref,
          suffix,
          label: known ? known.label : ref,
          known: !!known,
        });
      } else if (m[2]) {
        out.push({ type: 'const', value: m[2] });
      } else if (m[3]) {
        out.push({ type: 'raw', value: m[3] }); // function names etc. — preserved as-is
      } else if (m[4]) {
        out.push({ type: 'op', value: m[4] });
      }
    }
    return out;
  }, [formula, colByRef]);

  const stringify = (toks) => toks.map(t => {
    if (t.type === 'col' || t.type === 'var') return `{{${t.suffix ? `${t.ref}:${t.suffix}` : t.ref}}}`;
    return t.value;
  }).join(' ');

  const commit = (toks) => onChange(stringify(toks));

  const addToken = (tok) => commit([...tokens, tok]);
  const removeToken = (i) => commit(tokens.filter((_, idx) => idx !== i));
  const clearAll = () => commit([]);

  const handleAddColumn = (ref) => {
    if (!ref) return;
    const col = columns.find(c => c.ref === ref);
    addToken({ type: 'col', ref, suffix: defaultSuffix, label: col ? col.label : ref, known: true });
  };
  const handleAddVar = (ref) => {
    if (!ref) return;
    const v = globalVars.find(g => g.ref === ref);
    addToken({ type: 'var', ref, suffix: '', label: v ? v.label : ref, known: true });
  };

  const CHIP = {
    col:   { bg: 'rgba(99,102,241,0.22)', border: 'rgba(99,102,241,0.75)' },
    var:   { bg: 'rgba(16,185,129,0.22)', border: 'rgba(16,185,129,0.75)' },
    const: { bg: 'rgba(245,158,11,0.16)', border: 'rgba(245,158,11,0.6)' },
    op:    { bg: 'rgba(255,255,255,0.07)', border: 'var(--border)' },
    raw:   { bg: 'rgba(236,72,153,0.16)', border: 'rgba(236,72,153,0.6)' },
  };
  const SUFFIX_BADGE = { total: 'Tot', cur: 'Cur', conv: 'Con' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Chip preview strip */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center',
        padding: '10px 12px', minHeight: '46px',
        background: 'var(--input-bg)', borderRadius: '8px', border: '1px solid var(--border)',
      }}>
        {tokens.length === 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            Pick columns and operators below to build the formula…
          </span>
        )}
        {tokens.map((t, idx) => {
          const s = CHIP[t.type] || CHIP.op;
          const isMissing = (t.type === 'col' || t.type === 'var') && !t.known;
          return (
            <span key={idx} style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 7px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
              background: isMissing ? 'rgba(239,68,68,0.15)' : s.bg,
              border: `1px solid ${isMissing ? 'var(--error)' : s.border}`,
              color: 'var(--text-main)', fontFamily: t.type === 'op' ? 'inherit' : 'monospace',
            }} title={isMissing ? `Unknown reference: ${t.ref}` : (t.ref || '')}>
              {(t.type === 'col' || t.type === 'var') ? t.label : t.value}
              {t.type === 'col' && t.suffix && (
                <span style={{ fontSize: '8px', opacity: 0.7, textTransform: 'uppercase', background: 'rgba(0,0,0,0.15)', padding: '1px 3px', borderRadius: '3px' }}>
                  {SUFFIX_BADGE[t.suffix] || t.suffix}
                </span>
              )}
              <button type="button" onClick={() => removeToken(idx)}
                style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={11} />
              </button>
            </span>
          );
        })}
        {tokens.length > 0 && (
          <button type="button" onClick={clearAll} className="btn-link"
            style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
            Clear
          </button>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Operators */}
        <div style={{ display: 'flex', gap: '3px' }}>
          {OPERATORS.map(op => (
            <button key={op.sym} type="button" onClick={() => addToken({ type: 'op', value: op.sym })}
              className="btn-secondary"
              style={{ padding: '5px 0', fontSize: '13px', fontWeight: 'bold', minWidth: '30px' }}>
              {op.label}
            </button>
          ))}
        </div>

        {/* Add column */}
        <select
          value=""
          onChange={e => { handleAddColumn(e.target.value); e.target.value = ''; }}
          style={{ padding: '6px 8px', fontSize: '11px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-main)', minWidth: '150px' }}
        >
          <option value="">+ Add column…</option>
          {columns.map(c => <option key={c.ref} value={c.ref}>{c.label}</option>)}
        </select>

        {/* Add global var (branch formulas only) */}
        {globalVars.length > 0 && (
          <select
            value=""
            onChange={e => { handleAddVar(e.target.value); e.target.value = ''; }}
            style={{ padding: '6px 8px', fontSize: '11px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-main)' }}
          >
            <option value="">+ Variable…</option>
            {globalVars.map(v => <option key={v.ref} value={v.ref}>{v.label}</option>)}
          </select>
        )}

        {/* Add constant */}
        <ConstantInput onAdd={val => addToken({ type: 'const', value: val })} />
      </div>
    </div>
  );
}

function ConstantInput({ onAdd }) {
  const [val, setVal] = React.useState('');
  const add = () => {
    if (val !== '' && !isNaN(val)) { onAdd(val); setVal(''); }
  };
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      <input
        type="number" value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        placeholder="123"
        style={{ width: '64px', padding: '6px', fontSize: '11px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-main)' }}
      />
      <button type="button" onClick={add} className="btn-secondary" style={{ padding: '6px 8px', display: 'flex' }}>
        <Plus size={12} />
      </button>
    </div>
  );
}
