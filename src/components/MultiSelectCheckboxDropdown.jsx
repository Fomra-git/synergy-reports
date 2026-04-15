import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, CheckSquare, Square } from 'lucide-react';

export default function MultiSelectCheckboxDropdown({
  options = [],
  values = [],
  onChange,
  placeholder = 'Select values...',
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapperRef = useRef(null);
  const dropdownRef = useRef(null);

  const updatePos = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropHeight = 280;
    const top = spaceBelow >= dropHeight || spaceBelow >= rect.top
      ? rect.bottom + 6
      : rect.top - dropHeight - 6;
    setPos({ top, left: rect.left, width: rect.width });
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    if (!isOpen) updatePos();
    setIsOpen(p => !p);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (
        wrapperRef.current && !wrapperRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onScrollResize = () => updatePos();
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [isOpen, updatePos]);

  const filtered = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  const toggle = (opt) => {
    const next = values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt];
    onChange(next);
  };

  const displayLabel =
    values.length === 0 ? placeholder
      : values.length === 1 ? values[0]
        : `${values.length} values selected`;

  const menu = isOpen && createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
        background: 'var(--bg-card)', backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)', borderRadius: '12px', zIndex: 99999,
        boxShadow: '0 16px 40px -8px rgba(0,0,0,0.35), 0 0 0 1px var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Search bar */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Search size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <input
          autoFocus
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '12px', color: 'var(--text-main)' }}
        />
      </div>
      {/* Select All / Clear row */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '14px', alignItems: 'center' }}>
        <button
          onClick={() => onChange([...filtered])}
          style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: '600' }}
        >
          Select All
        </button>
        <button
          onClick={() => onChange([])}
          style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Clear
        </button>
        {values.length > 0 && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{values.length} selected</span>
        )}
      </div>
      {/* Options */}
      <ul style={{ maxHeight: '200px', overflowY: 'auto', listStyle: 'none', padding: '4px', margin: 0 }}>
        {filtered.length === 0 ? (
          <li style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>No options</li>
        ) : (
          filtered.map((opt, i) => {
            const checked = values.includes(opt);
            return (
              <li
                key={i}
                onClick={() => toggle(opt)}
                style={{
                  padding: '8px 12px', fontSize: '13px', cursor: 'pointer', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: checked ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: 'var(--text-main)', transition: 'background 0.15s',
                  userSelect: 'none',
                }}
                onMouseOver={e => { if (!checked) e.currentTarget.style.background = 'var(--glass-bg)'; }}
                onMouseOut={e => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
              >
                {checked
                  ? <CheckSquare size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
                  : <Square size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
              </li>
            );
          })
        )}
      </ul>
    </div>,
    document.body
  );

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={handleOpen}
        style={{
          background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '12px',
          padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '13px', minHeight: '40px',
          opacity: disabled ? 0.7 : 1, userSelect: 'none',
          color: values.length > 0 ? 'var(--text-main)' : 'var(--text-muted)',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>
          {displayLabel}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {values.length > 0 && !disabled && (
            <X
              size={13} color="var(--text-muted)" style={{ opacity: 0.6, cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onChange([]); setIsOpen(false); }}
            />
          )}
          <ChevronDown
            size={15} color="var(--text-muted)"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
          />
        </div>
      </div>

      {/* Selected value tags (shown below trigger when multiple) */}
      {values.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
          {values.map(v => (
            <span key={v} style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 8px', background: 'rgba(99,102,241,0.12)', borderRadius: '20px',
              fontSize: '11px', color: 'var(--primary)', border: '1px solid rgba(99,102,241,0.25)',
            }}>
              {v}
              <X
                size={10} style={{ cursor: 'pointer', opacity: 0.7 }}
                onClick={() => toggle(v)}
              />
            </span>
          ))}
        </div>
      )}

      {menu}
    </div>
  );
}
