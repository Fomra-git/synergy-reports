import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Settings, Save, Upload, Loader2, ImagePlus } from 'lucide-react';
import { useConfig, DEFAULT_CONFIG } from '../context/ConfigContext';

export default function AdminSettings() {
  const { config } = useConfig();
  const [formData, setFormData] = useState(DEFAULT_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Hydrate local form with whatever is in ConfigContext
  useEffect(() => {
    if (config) {
      setFormData(prev => ({ ...prev, ...config }));
    }
  }, [config]);

  const handleImageUpload = (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check size limit: max 1MB for base64 storage
    if (file.size > 1024 * 1024) {
       alert("File size exceeds 1MB. Please choose a smaller image.");
       return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, [field]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveStatus('');
    try {
      const configDocRef = doc(db, 'system_config', 'branding');
      await setDoc(configDocRef, formData, { merge: true });
      setSaveStatus('Global App Settings updated successfully! All users will see these changes momentarily.');
      setTimeout(() => setSaveStatus(''), 5000);
    } catch (err) {
      console.error('Error saving config:', err);
      setSaveStatus('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass" style={{ padding: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Settings size={20} color="var(--primary)" />
        <h3 style={{ fontSize: '18px' }}>Global Settings</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="form-group">
               <label>App Name</label>
               <input 
                 value={formData.appName} 
                 onChange={e => setFormData(p => ({...p, appName: e.target.value}))} 
                 placeholder="Synergy"
               />
            </div>
            <div className="form-group">
               <label>App Subtitle</label>
               <input 
                 value={formData.appSubtitle} 
                 onChange={e => setFormData(p => ({...p, appSubtitle: e.target.value}))} 
                 placeholder="Reports Engine"
               />
            </div>
         </div>

         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Logo Upload */}
            <div className="form-group">
              <label>App Logo (sidebar & login)</label>
              <div style={{ 
                 border: '2px dashed var(--border)', 
                 borderRadius: '12px', 
                 padding: '24px', 
                 textAlign: 'center',
                 display: 'flex',
                 flexDirection: 'column',
                 alignItems: 'center',
                 gap: '12px',
                 background: 'var(--glass-subtle)',
                 position: 'relative'
              }}>
                 {formData.logoBase64 ? (
                    <img src={formData.logoBase64} alt="App Logo Preview" style={{ maxHeight: '60px', maxWidth: '100%' }} />
                 ) : (
                    <ImagePlus size={32} color="var(--text-muted)" />
                 )}
                 <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max file size: 1MB. Transparent PNG recommended.</p>
                 <input 
                    type="file" 
                    accept="image/*" 
                    onChange={e => handleImageUpload(e, 'logoBase64')}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                 />
                 {formData.logoBase64 && (
                    <button onClick={() => setFormData(p => ({...p, logoBase64: null}))} style={{ fontSize: '11px', color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', zIndex: 10 }}>Remove Image</button>
                 )}
              </div>
            </div>

            {/* Favicon Upload */}
            <div className="form-group">
              <label>Browser Favicon</label>
              <div style={{ 
                 border: '2px dashed var(--border)', 
                 borderRadius: '12px', 
                 padding: '24px', 
                 textAlign: 'center',
                 display: 'flex',
                 flexDirection: 'column',
                 alignItems: 'center',
                 gap: '12px',
                 background: 'var(--glass-subtle)',
                 position: 'relative'
              }}>
                 {formData.faviconBase64 ? (
                    <img src={formData.faviconBase64} alt="Favicon Preview" style={{ width: '32px', height: '32px' }} />
                 ) : (
                    <ImagePlus size={32} color="var(--text-muted)" />
                 )}
                 <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Square aspect ratio recommended (e.g. 32x32). Max 1MB.</p>
                 <input 
                    type="file" 
                    accept="image/*" 
                    onChange={e => handleImageUpload(e, 'faviconBase64')}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                 />
                 {formData.faviconBase64 && (
                    <button onClick={() => setFormData(p => ({...p, faviconBase64: null}))} style={{ fontSize: '11px', color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', zIndex: 10 }}>Remove Favicon</button>
                 )}
              </div>
            </div>
         </div>

         <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }}></div>

         {/* Design Settings */}
         <h4 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '-10px' }}>Theming &amp; Colors</h4>
         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
               <label>Primary Brand Color</label>
               <input 
                  type="color" 
                  value={formData.primaryColor || '#6366f1'} 
                  onChange={e => setFormData(p => ({...p, primaryColor: e.target.value}))}
                  style={{ height: '48px', padding: '4px', cursor: 'pointer' }}
               />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
               <label>Secondary Accent Color</label>
               <input 
                  type="color" 
                  value={formData.secondaryColor || '#ec4899'} 
                  onChange={e => setFormData(p => ({...p, secondaryColor: e.target.value}))}
                  style={{ height: '48px', padding: '4px', cursor: 'pointer' }}
               />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
                <label>App Font Family</label>
                <select 
                  value={formData.fontFamily || "'Outfit', 'Inter', system-ui, sans-serif"}
                  onChange={e => setFormData(p => ({...p, fontFamily: e.target.value}))}
                  style={{ height: '48px' }}
                >
                   <option value="'Outfit', 'Inter', system-ui, sans-serif">Outfit (Default Modern)</option>
                   <option value="'Inter', system-ui, sans-serif">Inter (Clean)</option>
                   <option value="'Roboto', sans-serif">Roboto (Google Standard)</option>
                   <option value="system-ui, sans-serif">System Native (Fastest)</option>
                   <option value="Arial, sans-serif">Arial (Legacy)</option>
                </select>
            </div>
         </div>

         {saveStatus && (
           <div style={{ padding: '12px', background: saveStatus.includes('Global App Settings updated') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: saveStatus.includes('Global App Settings updated') ? 'var(--success)' : 'var(--error)', borderRadius: '10px', fontSize: '14px', marginTop: '10px' }}>
             {saveStatus}
           </div>
         )}

         <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
             <button onClick={handleSaveSettings} className="btn-primary" disabled={isSaving} style={{ minWidth: '180px' }}>
               {isSaving ? <Loader2 size={18} className="spinner" /> : <><Save size={18} /> Apply Changes Globally</>}
             </button>
         </div>

      </div>
    </div>
  );
}
