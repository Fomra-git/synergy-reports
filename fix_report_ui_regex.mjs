import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

// Regex to find the start of the templates list more flexibly
const regex = /\{\s*templates\.length\s*===\s*0\s*\?\s*\([\s\S]*?\)\s*:\s*\(\s*<div\s+style=\{\{\s*display:\s*'flex',\s*flexDirection:\s*'column',\s*gap:\s*'12px'\s*\}\}>\s*/;

const match = content.match(regex);

if (match && !content.includes('Search templates...')) {
    const replacement = match[0] + `
                   {/* TEMPLATE SEARCH */}
                   <div style={{ 
                     display: 'flex', 
                     alignItems: 'center', 
                     gap: '12px', 
                     padding: '10px 16px', 
                     background: 'rgba(255,255,255,0.03)', 
                     borderRadius: '12px',
                     border: '1px solid var(--border)',
                     marginBottom: '8px'
                   }}>
                      <Search size={16} color="var(--text-muted)" />
                      <input 
                        type="text" 
                        placeholder="Search templates..." 
                        value={templateSearchTerm}
                        onChange={e => setTemplateSearchTerm(e.target.value)}
                        style={{ background: 'none', border: 'none', color: 'white', fontSize: '14px', flex: 1, outline: 'none' }}
                      />
                   </div>`;
    content = content.replace(regex, replacement);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('Search UI injected via Regex successfully');
} else {
    console.log('Regex did not match or Search already present');
}

// Final check for the selection counter
const oldCounter = /{selectedTemplates\.length}\s*\/\s*{templates\.length}\s*Selected/;
if (content.match(oldCounter)) {
    content = content.replace(oldCounter, `{selectedTemplates.length} / {filteredTemplates.length} Selected`);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('Counter updated');
}
