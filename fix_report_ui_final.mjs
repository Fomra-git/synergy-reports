import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

// 1. Inject Search UI
const dividerString = `              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>`;

const searchInputUI = `
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

if (content.includes(dividerString) && !content.includes('Search templates...')) {
    content = content.replace(dividerString, dividerString + searchInputUI);
    console.log('Search UI injected');
} else {
    console.log('Search UI injection skipped (already present or divider not found)');
}

// 2. Fix Selection Count
const oldCounter = `{selectedTemplates.length} / {templates.length} Selected`;
const newCounter = `{selectedTemplates.length} / {filteredTemplates.length} Selected`;

if (content.includes(oldCounter)) {
    content = content.replace(oldCounter, newCounter);
    console.log('Counter updated');
} else {
    console.log('Counter update skipped');
}

fs.writeFileSync('src/pages/GenerateReport.jsx', content);
