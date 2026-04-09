import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

// Regex to find the start of the templates list
const regex = /\{\s*templates\.length\s*===\s*0\s*\?\s*\([\s\S]*?\)\s*:\s*\(\s*<div\s+style=\{\{\s*display:\s*'flex',\s*flexDirection:\s*'column',\s*gap:\s*'12px'\s*\}\}>\s*/;

const match = content.match(regex);

if (match) {
    const replacement = match[0] + `
                   <div 
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
                   >
                      <div className="modern-icon-box" style={{ 
                        width: '24px', 
                        height: '24px', 
                        borderRadius: '6px', 
                        background: (selectedTemplates.length === templates.length && templates.length > 0) ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                        borderColor: (selectedTemplates.length === templates.length && templates.length > 0) ? 'var(--primary)' : 'var(--border)',
                        color: 'white',
                        flexShrink: 0
                      }}>
                        {(selectedTemplates.length === templates.length && templates.length > 0) && <CheckCircle2 size={16} />}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Select All Templates
                      </span>
                      <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>
                        {selectedTemplates.length} / {templates.length} Selected
                      </div>
                   </div>
`;
    content = content.replace(regex, replacement);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated successfully');
} else {
    console.log('Regex did not match');
}
