import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Database, Layers, Calculator, ChevronDown } from 'lucide-react';

const OPERATORS = ['+', '-', '*', '/', '(', ')', ','];
const FUNCTIONS = ['ABS(', 'ROUND(', 'CEIL(', 'FLOOR(', 'MAX(', 'MIN('];

/**
 * FormulaBuilder
 * Props:
 *  - formula        : string  — the formula expression stored as "[Col1] + {TemplateCol}"
 *  - masterHeaders  : string[] — columns from the master Excel file → stored as [ColName]
 *  - templateColumns: string[] — columns already defined in this template → stored as {ColName}
 *  - onChange       : (formulaString) => void
 */
export default function FormulaBuilder({ formula, masterHeaders = [], templateColumns = [], onChange }) {
  const [tokens, setTokens] = useState([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [colTab, setColTab] = useState('master'); // 'master' | 'template'
  const [constValue, setConstValue] = useState('');
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Parse formula string into token array on mount/formula change
  useEffect(() => {
    if (!formula) { setTokens([]); return; }

    // Match [MasterCol], {TemplateCol}, numbers, functions, operators
    const regex = /(\[.*?\])|(\{.*?\})|(\d+\.\d+|\d+)|(ABS\(|ROUND\(|CEIL\(|FLOOR\(|MAX\(|MIN\()|([\+\-\*\/\(\)\,])/g;
    const matches = [...formula.matchAll(regex)];
    const newTokens = matches.map(m => {
      if (m[1]) return { type: 'master', value: m[1].replace(/\[|\]/g, '') };
      if (m[2]) return { type: 'template', value: m[2].replace(/\{|\}/g, '') };
      if (m[3]) return { type: 'const', value: m[3] };
      if (m[4]) return { type: 'func', value: m[4] };
      if (m[5]) return { type: 'op', value: m[5] };
      return null;
    }).filter(Boolean);
    setTokens(newTokens);
  }, [formula]);

  // Stringify tokens back to formula expression
  const updateFormula = (newTokens) => {
    const str = newTokens.map(t => {
      if (t.type === 'master') return `[${t.value}]`;
      if (t.type === 'template') return `{${t.value}}`;
      return t.value;
    }).join(' ');
    onChange(str);
  };

  const addToken = (type, value) => {
    const next = [...tokens, { type, value }];
    updateFormula(next);
    setShowAddMenu(false);
    setConstValue('');
  };

  const removeToken = (i) => {
    const next = tokens.filter((_, idx) => idx !== i);
    updateFormula(next);
  };

  const handleAddConst = () => {
    if (constValue !== '' && !isNaN(constValue)) {
      addToken('const', constValue);
    }
  };

  // Token appearance config
  const TOKEN_STYLE = {
    master:   { bg: 'rgba(99,102,241,0.25)',  border: 'rgba(99,102,241,0.8)',  label: 'M' },
    template: { bg: 'rgba(16,185,129,0.25)',  border: 'rgba(16,185,129,0.8)', label: 'T' },
    func:     { bg: 'rgba(236,72,153,0.2)',   border: '#ec4899',               label: 'f' },
    op:       { bg: 'rgba(255,255,255,0.07)', border: 'var(--glass-strong)', label: '' },
    const:    { bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.6)', label: '#' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* ── Formula Preview Strip ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '5px',
        padding: '10px 12px', minHeight: '52px',
        background: 'var(--glass-subtle)', borderRadius: '10px',
        border: '1px solid var(--border)', alignItems: 'center'
      }}>
        {tokens.length === 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            Start building your formula below…
          </span>
        )}
        {tokens.map((tok, idx) => {
          const s = TOKEN_STYLE[tok.type] || TOKEN_STYLE.op;
          return (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 8px', borderRadius: '6px',
              background: s.bg, border: `1px solid ${s.border}`,
              fontSize: '11px', fontWeight: '600', color: 'var(--text-main)'
            }}>
              {s.label && <span style={{ opacity: 0.6, fontSize: '9px' }}>{s.label}</span>}
              {tok.value}
              <button
                type="button"
                onClick={() => removeToken(idx)}
                style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: 0 }}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--text-muted)' }}>
        <span style={{ color: 'rgba(99,102,241,0.9)' }}>■ [M] Master Col</span>
        <span style={{ color: 'rgba(16,185,129,0.9)' }}>■ {'{T}'} Template Col</span>
        <span style={{ color: 'rgba(236,72,153,0.8)' }}>■ Function</span>
        <span style={{ color: 'rgba(245,158,11,0.8)' }}>■ Constant</span>
      </div>

      {/* ── Controls Row ── */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Quick operator buttons */}
        <div style={{ display: 'flex', gap: '3px' }}>
          {OPERATORS.map(op => (
            <button
              key={op} type="button"
              onClick={() => addToken('op', op)}
              className="btn-secondary"
              style={{ padding: '5px 9px', fontSize: '13px', fontWeight: 'bold', minWidth: '32px' }}
            >
              {op}
            </button>
          ))}
        </div>

        {/* Add Part menu */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowAddMenu(v => !v)}
            className="btn-primary"
            style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={13} /> Add Part <ChevronDown size={13} />
          </button>

          {showAddMenu && (
            <div className="glass" style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 200,
              marginTop: '6px', width: '300px', padding: '16px',
              background: 'var(--bg-card)',
              display: 'flex', flexDirection: 'column', gap: '14px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2), 0 0 0 1px var(--border)',
              maxHeight: '420px', overflowY: 'auto'
            }}>

              {/* ─── INSERT COLUMN (tabbed) ─── */}
              <div>
                <div style={{ display: 'flex', gap: '0', marginBottom: '8px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setColTab('master')}
                    style={{
                      flex: 1, padding: '6px', fontSize: '11px', fontWeight: '700', border: 'none', cursor: 'pointer',
                      background: colTab === 'master' ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                      color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                    }}
                  >
                    <Database size={11} /> Master Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => setColTab('template')}
                    style={{
                      flex: 1, padding: '6px', fontSize: '11px', fontWeight: '700', border: 'none', cursor: 'pointer',
                      background: colTab === 'template' ? 'rgba(16,185,129,0.7)' : 'rgba(255,255,255,0.04)',
                      color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                    }}
                  >
                    <Layers size={11} /> Template Cols
                  </button>
                </div>

                {colTab === 'master' ? (
                  masterHeaders.length === 0 ? (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Upload a master file first.</p>
                  ) : (
                    <select
                      onChange={(e) => e.target.value && addToken('master', e.target.value)}
                      style={{ width: '100%', padding: '8px', fontSize: '12px' }}
                      value=""
                    >
                      <option value="" disabled>Select Master Column…</option>
                      {masterHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  )
                ) : (
                  templateColumns.length === 0 ? (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No other template columns defined yet.</p>
                  ) : (
                    <select
                      onChange={(e) => e.target.value && addToken('template', e.target.value)}
                      style={{ width: '100%', padding: '8px', fontSize: '12px' }}
                      value=""
                    >
                      <option value="" disabled>Select Template Column…</option>
                      {templateColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )
                )}
              </div>

              {/* ─── INSERT FUNCTION ─── */}
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '6px', display: 'block' }}>Insert Function</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                  {FUNCTIONS.map(f => (
                    <button key={f} type="button" onClick={() => addToken('func', f)} className="btn-secondary" style={{ padding: '5px', fontSize: '10px' }}>
                      {f.replace('(', '()')}
                    </button>
                  ))}
                </div>
              </div>

              {/* ─── INSERT CONSTANT ─── */}
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '6px', display: 'block' }}>Insert Constant</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="number" value={constValue}
                    onChange={e => setConstValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddConst()}
                    placeholder="e.g. 1.18"
                    style={{ flex: 1, padding: '7px', fontSize: '12px' }}
                  />
                  <button type="button" onClick={handleAddConst} className="btn-primary" style={{ padding: '7px 10px' }}>
                    <Plus size={13} />
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

    </div>
  );
}
