import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';

export default function SearchableDropdown({ options, value, onChange, placeholder = "Select...", disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapperRef = useRef(null);
  const dropdownRef = useRef(null);

  // Calculate dropdown position relative to viewport
  const updatePosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropHeight = 260; // approx max height of dropdown

    let top;
    if (spaceBelow >= dropHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 6 + window.scrollY;
    } else {
      top = rect.top - dropHeight - 6 + window.scrollY;
    }

    setDropdownPos({
      top,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    if (!isOpen) updatePosition();
    setIsOpen(prev => !prev);
  };

  // Close on outside click
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

  // Reposition on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [isOpen, updatePosition]);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const dropdownMenu = isOpen && createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        zIndex: 99999,
        boxShadow: '0 16px 40px -8px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--border)',
      }}
    >
      {/* Search */}
      <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
        <Search size={14} color="var(--text-muted)"
          style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          autoFocus
          type="text"
          placeholder="Search..."
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
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      {/* Options */}
      <ul style={{ maxHeight: '200px', overflowY: 'auto', listStyle: 'none', padding: '4px', margin: 0 }}>
        {/* None/Clear */}
        <li
          onClick={() => { onChange(''); setIsOpen(false); setSearchTerm(''); }}
          style={{
            padding: '8px 12px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer',
            borderRadius: '8px', fontStyle: 'italic', borderBottom: '1px solid var(--border)', marginBottom: '4px',
          }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--glass-bg)'}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          (None / Clear)
        </li>

        {filteredOptions.length === 0 ? (
          <li style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
            No matches found
          </li>
        ) : (
          filteredOptions.map((opt, i) => (
            <li
              key={i}
              onClick={() => { onChange(opt); setIsOpen(false); setSearchTerm(''); }}
              style={{
                padding: '8px 12px', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer',
                borderRadius: '8px',
                background: opt === value ? 'var(--primary)' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseOver={e => { if (opt !== value) e.currentTarget.style.background = 'var(--glass-bg)'; }}
              onMouseOut={e => { if (opt !== value) e.currentTarget.style.background = 'transparent'; }}
            >
              {opt}
            </li>
          ))
        )}
      </ul>
    </div>,
    document.body
  );

  return (
    <div className="searchable-dropdown" ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <div
        onClick={handleOpen}
        style={{
          background: 'var(--input-bg)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '10px 16px',
          color: value ? 'var(--text-main)' : 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          minHeight: '42px',
          opacity: disabled ? 0.7 : 1,
          userSelect: 'none',
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '8px' }}>
          {value || placeholder}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {value && !disabled && (
            <X
              size={14}
              color="var(--text-muted)"
              style={{ cursor: 'pointer', opacity: 0.6 }}
              onClick={e => { e.stopPropagation(); onChange(''); setIsOpen(false); }}
            />
          )}
          <ChevronDown
            size={16}
            color="var(--text-muted)"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
          />
        </div>
      </div>

      {dropdownMenu}
    </div>
  );
}
