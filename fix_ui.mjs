import fs from 'fs';

let content = fs.readFileSync('src/pages/TemplateManager.jsx', 'utf8');

// Replace the main icon container
const oldIconBox = /<div style=\{\{\s+width: '48px',\s+height: '48px',\s+borderRadius: '12px',\s+background: 'rgba\(99, 102, 241, 0\.1\)',\s+display: 'flex',\s+alignItems: 'center',\s+justifyContent: 'center',\s+color: 'var\(--primary\)',\s+border: '1px solid rgba\(99, 102, 241, 0\.2\)'\s+\}\}>\s+<LayoutGrid size=\{24\} \/>\s+<\/div>/g;
const newIconBox = `<div className="modern-icon-box" style={{ width: '48px', height: '48px', color: 'var(--primary)' }}>
                      <LayoutGrid size={24} />
                    </div>`;

content = content.replace(oldIconBox, newIconBox);

// Replace the action buttons
const oldButtons = /<div style=\{\{ display: 'flex', gap: '8px' \}\}>\s+<button\s+onClick=\{\(\) => navigate\(\`\/visual-mapper\?id=\$\{template\.id\}\`\)\}\s+className="btn-secondary"\s+style=\{\{ padding: '8px', color: 'var\(--primary\)', background: 'rgba\(99, 102, 241, 0\.1\)' \}\}\s+title="Edit Template"\s+>\s+<Edit2 size=\{16\} \/>\s+<\/button>\s+<button\s+onClick=\{\(\) => handleDuplicate\(template\)\}\s+className="btn-secondary"\s+style=\{\{ padding: '8px', color: 'var\(--secondary\)', background: 'rgba\(56, 189, 248, 0\.1\)' \}\}\s+title="Duplicate Template"\s+>\s+<Copy size=\{16\} \/>\s+<\/button>\s+<button\s+onClick=\{\(\) => handleDelete\(template\.id\)\}\s+className="btn-secondary"\s+style=\{\{ padding: '8px', color: 'var\(--error\)', background: 'rgba\(239, 68, 68, 0\.1\)' \}\}\s+title="Delete Template"\s+>\s+<Trash2 size=\{16\} \/>\s+<\/button>\s+<\/div>/g;

const newButtons = `<div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => navigate(\`/visual-mapper?id=\${template.id}\`)} 
                        className="modern-icon-box" 
                        style={{ padding: '8px', color: 'var(--primary)' }}
                        title="Edit Template"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDuplicate(template)} 
                        className="modern-icon-box" 
                        style={{ padding: '8px', color: 'var(--secondary)' }}
                        title="Duplicate Template"
                      >
                        <Copy size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(template.id)} 
                        className="modern-icon-box" 
                        style={{ padding: '8px', color: 'var(--error)' }}
                        title="Delete Template"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>`;

content = content.replace(oldButtons, newButtons);

fs.writeFileSync('src/pages/TemplateManager.jsx', content);
console.log('TemplateManager.jsx updated successfully');
