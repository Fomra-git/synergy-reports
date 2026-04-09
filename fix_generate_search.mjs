import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

// 1. Add Search to imports if not there
if (content.includes('ArrowRight') && !content.includes('Search')) {
    content = content.replace('ArrowRight', 'ArrowRight,\n  Search');
}

// 2. Add templateSearchTerm state
if (content.includes('setSelectedTemplates(prev =>') && !content.includes('templateSearchTerm')) {
    content = content.replace('const [isGenerating, setIsGenerating]', 'const [templateSearchTerm, setTemplateSearchTerm] = useState(\'\');\n  const [isGenerating, setIsGenerating]');
}

// 3. Inject Search UI into the template selection list
const targetDivider = `              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>`;

const searchUI = `              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

if (content.includes(targetDivider)) {
    content = content.replace(targetDivider, searchUI);
}

// 4. Use filteredTemplates in the loop
const loopStart = `{templates.map(template => (`;
if (content.includes(loopStart)) {
    content = content.replace(loopStart, `{filteredTemplates.map(template => (`);
}

fs.writeFileSync('src/pages/GenerateReport.jsx', content);
console.log('GenerateReport.jsx updated with Search functionality');
