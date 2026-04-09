import React from 'react';
import { X, AlertTriangle, Info, CheckCircle2, HelpCircle } from 'lucide-react';

/**
 * ModernModal Component
 * A premium, glassmorphic replacement for window.alert, window.confirm, and window.prompt.
 */
export default function ModernModal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  type = 'info', // info, danger, success, warning
  mode = 'alert', // alert, confirm, prompt
  onConfirm, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  inputValue = '',
  onInputChange
}) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'danger': return <AlertTriangle size={32} color="#ef4444" />;
      case 'success': return <CheckCircle2 size={32} color="#10b981" />;
      case 'warning': return <AlertTriangle size={32} color="#f59e0b" />;
      default: return <Info size={32} color="#6366f1" />;
    }
  };

  const getAccentColor = () => {
    switch (type) {
      case 'danger': return '#ef4444';
      case 'success': return '#10b981';
      case 'warning': return '#f59e0b';
      default: return '#6366f1';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modern-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-accent-line" style={{ background: getAccentColor() }}></div>
        
        <button 
          onClick={onClose} 
          style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '8px' }}>
          <div style={{ padding: '16px', background: `${getAccentColor()}15`, borderRadius: '20px', marginBottom: '20px' }}>
            {getIcon()}
          </div>
          
          <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '12px', color: 'var(--text-main)' }}>{title}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', lineHeight: '1.6', marginBottom: mode === 'prompt' ? '16px' : '32px' }}>{message}</p>

          {mode === 'prompt' && (
            <div className="form-group" style={{ width: '100%', marginBottom: '32px' }}>
              <input 
                autoFocus
                value={inputValue} 
                onChange={e => onInputChange(e.target.value)}
                placeholder="Enter value..."
                onKeyDown={e => e.key === 'Enter' && onConfirm && onConfirm(inputValue)}
                style={{ textAlign: 'center' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            {(mode === 'confirm' || mode === 'prompt') && (
              <button 
                onClick={onClose} 
                className="btn-secondary" 
                style={{ flex: 1, padding: '12px', background: 'var(--glass-bg)', color: 'var(--text-main)' }}
              >
                {cancelText}
              </button>
            )}
            <button 
              onClick={() => onConfirm ? onConfirm(inputValue) : onClose()} 
              className="btn-primary" 
              style={{ flex: 1, padding: '12px', background: getAccentColor(), boxShadow: `0 8px 20px -5px ${getAccentColor()}50` }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
