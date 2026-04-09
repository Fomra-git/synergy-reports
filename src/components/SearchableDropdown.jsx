import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export default function SearchableDropdown({ options, value, onChange, placeholder = "Select...", disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="searchable-dropdown" ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          background: disabled ? 'var(--input-bg)' : 'var(--input-bg)',
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
          opacity: disabled ? 0.7 : 1
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '8px' }}>
          {value || placeholder}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {value && !disabled && (
            <X 
              size={14} 
              color="var(--text-muted)" 
              style={{ cursor: 'pointer', opacity: 0.6 }} 
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setIsOpen(false);
              }}
            />
          )}
          <ChevronDown size={16} color="var(--text-muted)" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }} />
        </div>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '8px',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          zIndex: 1050,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 0 0 1px var(--border)'
        }}>
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              autoFocus
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--glass-subtle)',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 8px 8px 32px',
                fontSize: '13px',
                color: 'var(--text-main)'
              }}
            />
          </div>
          <ul style={{
            maxHeight: '200px',
            overflowY: 'auto',
            listStyle: 'none',
            padding: '4px',
            margin: 0
          }}>
            {/* NONE OPTION */}
            <li 
              onClick={() => {
                onChange('');
                setIsOpen(false);
                setSearchTerm('');
              }}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                borderRadius: '8px',
                fontStyle: 'italic',
                borderBottom: '1px solid var(--border)',
                marginBottom: '4px'
              }}
              onMouseOver={(e) => e.target.style.background = 'var(--glass-bg)'}
              onMouseOut={(e) => e.target.style.background = 'transparent'}
            >
              (None / Clear)
            </li>

            {filteredOptions.length === 0 ? (
              <li style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>No matches found</li>
            ) : (
              filteredOptions.map((opt, i) => (
                <li 
                  key={i}
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    background: opt === value ? 'var(--primary)' : 'transparent',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    if (opt !== value) e.target.style.background = 'var(--glass-bg)';
                  }}
                  onMouseOut={(e) => {
                    if (opt !== value) e.target.style.background = 'transparent';
                  }}
                >
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
