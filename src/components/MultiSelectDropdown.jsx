import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, CheckSquare, Square, X } from 'lucide-react';

export default function MultiSelectDropdown({ options, selectedValues, onChange, placeholder = "Select values...", disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    String(opt).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelection = (opt) => {
    const newSelected = selectedValues.includes(opt)
      ? selectedValues.filter(v => v !== opt)
      : [...selectedValues, opt];
    onChange(newSelected);
  };

  const isAllSelected = filteredOptions.length > 0 && filteredOptions.every(opt => selectedValues.includes(opt));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      onChange(selectedValues.filter(v => !filteredOptions.includes(v)));
    } else {
      const added = filteredOptions.filter(v => !selectedValues.includes(v));
      onChange([...selectedValues, ...added]);
    }
  };

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative', width: '100%', flex: 1 }}
    >
      {/* Trigger */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          background: 'var(--input-bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '10px 16px',
          color: selectedValues.length > 0 ? 'var(--text-main)' : 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          minHeight: '42px',
          opacity: disabled ? 0.7 : 1
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '8px' }}>
          {selectedValues.length === 0 ? placeholder : `${selectedValues.length} item(s) selected`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedValues.length > 0 && !disabled && (
            <X
              size={14}
              color="var(--text-muted)"
              style={{ cursor: 'pointer', opacity: 0.6 }}
              onClick={e => { e.stopPropagation(); onChange([]); setIsOpen(false); }}
            />
          )}
          <ChevronDown
            size={16}
            color="var(--text-muted)"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }}
          />
        </div>
      </div>

      {/* Panel — in-DOM absolute, escapes via parent z-index chain */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          zIndex: 10,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.25), 0 0 0 1px var(--border)'
        }}>
          {/* Search */}
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              autoFocus
              type="text"
              placeholder="Search values..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--glass-subtle)',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 8px 8px 32px',
                fontSize: '13px',
                color: 'var(--text-main)',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Options */}
          <ul style={{ maxHeight: '200px', overflowY: 'auto', listStyle: 'none', padding: '4px', margin: 0 }}>
            {filteredOptions.length > 0 && (
              <li
                onClick={toggleSelectAll}
                style={{
                  padding: '8px 12px', fontSize: '13px', color: 'var(--text-main)',
                  cursor: 'pointer', borderRadius: '8px', display: 'flex',
                  alignItems: 'center', gap: '8px', fontWeight: '600',
                  borderBottom: '1px solid var(--border)'
                }}
              >
                {isAllSelected ? <CheckSquare size={16} color="var(--primary)" /> : <Square size={16} color="var(--text-muted)" />}
                Select All
              </li>
            )}
            {filteredOptions.length === 0 ? (
              <li style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>No values found</li>
            ) : (
              filteredOptions.map((opt, i) => (
                <li
                  key={i}
                  onClick={e => { e.stopPropagation(); toggleSelection(opt); }}
                  style={{
                    padding: '8px 12px', fontSize: '13px', color: 'var(--text-main)',
                    cursor: 'pointer', borderRadius: '8px', display: 'flex',
                    alignItems: 'center', gap: '8px', transition: 'background 0.15s',
                    background: selectedValues.includes(opt) ? 'rgba(99,102,241,0.1)' : 'transparent'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--glass-bg)'}
                  onMouseOut={e => e.currentTarget.style.background = selectedValues.includes(opt) ? 'rgba(99,102,241,0.1)' : 'transparent'}
                >
                  {selectedValues.includes(opt) ? <CheckSquare size={16} color="var(--primary)" /> : <Square size={16} color="var(--text-muted)" />}
                  {opt}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
