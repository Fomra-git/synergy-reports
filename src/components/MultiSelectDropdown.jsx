import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, Search, CheckSquare, Square, X } from 'lucide-react';

/** Walk up DOM to find nearest scrollable ancestor */
function findScrollParent(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return document.body;
}

export default function MultiSelectDropdown({
  options,
  selectedValues,
  onChange,
  placeholder = 'Select values...',
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [scrollContainer, setScrollContainer] = useState(null);

  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  // Resolve scroll container once mounted
  useEffect(() => {
    if (triggerRef.current) {
      setScrollContainer(findScrollParent(triggerRef.current));
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // rAF loop: compute position in scroll-container content coordinates
  useEffect(() => {
    if (!isOpen || !scrollContainer) return;
    let rafId;
    const DROP_HEIGHT = 264;

    const update = () => {
      if (!triggerRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const isBody = scrollContainer === document.body;
      const containerRect = isBody
        ? { top: 0, left: 0 }
        : scrollContainer.getBoundingClientRect();
      const scrollTop = isBody ? window.scrollY : scrollContainer.scrollTop;
      const scrollLeft = isBody ? window.scrollX : scrollContainer.scrollLeft;

      // Convert from viewport coords to content coords of the scroll container
      const relBottom = triggerRect.bottom - containerRect.top + scrollTop;
      const relTop    = triggerRect.top    - containerRect.top + scrollTop;
      const relLeft   = triggerRect.left   - containerRect.left + scrollLeft;

      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const top = spaceBelow >= DROP_HEIGHT
        ? relBottom + 4
        : relTop - DROP_HEIGHT - 4;

      setDropdownPos({ top, left: relLeft, width: triggerRect.width });
      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, scrollContainer]);

  const filteredOptions = options.filter(opt =>
    String(opt).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggle = (opt) =>
    onChange(selectedValues.includes(opt)
      ? selectedValues.filter(v => v !== opt)
      : [...selectedValues, opt]);

  const isAllSelected =
    filteredOptions.length > 0 &&
    filteredOptions.every(opt => selectedValues.includes(opt));

  const toggleAll = () => {
    if (isAllSelected) {
      onChange(selectedValues.filter(v => !filteredOptions.includes(v)));
    } else {
      onChange([...new Set([...selectedValues, ...filteredOptions])]);
    }
  };

  // Panel rendered into the scroll container (not body)
  const panel = isOpen && scrollContainer && ReactDOM.createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        background: 'var(--bg-card)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        zIndex: 1000,
        boxShadow: '0 16px 40px -8px rgba(0,0,0,0.35), 0 0 0 1px var(--border)',
      }}
    >
      {/* Search */}
      <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
        <Search
          size={14}
          color="var(--text-muted)"
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }}
        />
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
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Options list */}
      <ul style={{ maxHeight: '200px', overflowY: 'auto', listStyle: 'none', padding: '4px', margin: 0 }}>
        {filteredOptions.length > 0 && (
          <li
            onClick={toggleAll}
            style={{
              padding: '8px 12px', fontSize: '13px', color: 'var(--text-main)',
              cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center',
              gap: '8px', fontWeight: '600', borderBottom: '1px solid var(--border)',
            }}
          >
            {isAllSelected
              ? <CheckSquare size={16} color="var(--primary)" />
              : <Square size={16} color="var(--text-muted)" />}
            Select All
          </li>
        )}
        {filteredOptions.length === 0 ? (
          <li style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
            No values found
          </li>
        ) : (
          filteredOptions.map((opt, i) => {
            const isSel = selectedValues.includes(opt);
            return (
              <li
                key={i}
                onClick={e => { e.stopPropagation(); toggle(opt); }}
                style={{
                  padding: '8px 12px', fontSize: '13px', color: 'var(--text-main)',
                  cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center',
                  gap: '8px', transition: 'background 0.15s',
                  background: isSel ? 'rgba(99,102,241,0.1)' : 'transparent',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--glass-bg)'}
                onMouseOut={e => e.currentTarget.style.background = isSel ? 'rgba(99,102,241,0.1)' : 'transparent'}
              >
                {isSel
                  ? <CheckSquare size={16} color="var(--primary)" />
                  : <Square size={16} color="var(--text-muted)" />}
                {opt}
              </li>
            );
          })
        )}
      </ul>
    </div>,
    scrollContainer
  );

  return (
    <div ref={triggerRef} style={{ position: 'relative', width: '100%', flex: 1 }}>
      {/* Trigger */}
      <div
        onClick={() => !disabled && setIsOpen(o => !o)}
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
          opacity: disabled ? 0.7 : 1,
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

      {panel}
    </div>
  );
}
