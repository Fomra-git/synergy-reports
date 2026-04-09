import fs from 'fs';

let content = fs.readFileSync('src/pages/VisualExcelMapping.jsx', 'utf8');

const displayOptionsBlock = `                    {/* DISPLAY OPTIONS */}
                    <div style={{ background: 'rgba(56,189,248,0.05)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(56,189,248,0.2)', marginBottom: '8px' }}>
                       <label style={{ fontSize: '12px', fontWeight: '700', color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <LayoutGrid size={14} /> Display & Formatting
                       </label>
                       
                       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                             <p style={{ fontSize: '14px', fontWeight: '600' }}>Merge Identical Vertical Cells</p>
                             <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Groups repeating values (e.g. Doctor names) into a single centered block.</p>
                          </div>
                          <div 
                             onClick={() => setModalData(prev => ({ ...prev, enableMerging: !prev.enableMerging }))}
                             style={{ 
                               width: '44px', 
                               height: '24px', 
                               borderRadius: '12px', 
                               background: modalData.enableMerging ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                               position: 'relative',
                               cursor: 'pointer',
                               transition: '0.3s'
                             }}
                          >
                             <div style={{ 
                               width: '18px', 
                               height: '18px', 
                               borderRadius: '50%', 
                               background: 'white', 
                               position: 'absolute', 
                               top: '3px', 
                               left: modalData.enableMerging ? '23px' : '3px',
                               transition: '0.3s',
                               boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                             }} />
                          </div>
                       </div>
                    </div>`;

// 1. Remove it from its current position
if (content.includes(displayOptionsBlock)) {
    content = content.replace(displayOptionsBlock, '');
}

// 2. Insert it after the "Processing Rule" selection (around line 883)
const targetPoint = `                   <option value="time_diff">Time Difference</option>
                  </select>
               </div>`;

if (content.includes(targetPoint)) {
    content = content.replace(targetPoint, targetPoint + '\n\n' + displayOptionsBlock);
    fs.writeFileSync('src/pages/VisualExcelMapping.jsx', content);
    console.log('VisualExcelMapping.jsx updated: Display Options are now global');
} else {
    console.log('Target insertion point not found');
}
