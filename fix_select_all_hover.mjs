import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

const target = `                    <div 
                      onClick={handleSelectAll}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '16px', 
                        padding: '12px 16px', 
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        marginBottom: '8px',
                        transition: '0.2s'
                      }}
                      className="interactive-icon"
                    >`;

const replacement = `                    <div 
                      onClick={handleSelectAll}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '16px', 
                        padding: '12px 16px', 
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        marginBottom: '8px',
                        transition: '0.2s',
                        borderRadius: '12px'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated successfully');
} else {
    // Try without line breaks in regex just in case
    console.log('Target not found');
}
