import fs from 'fs';

let content = fs.readFileSync('src/pages/AdminPanel.jsx', 'utf8');

const oldButton = /<td style=\{\{ padding: '16px 8px', textAlign: 'right' \}\}>\s+<button\s+onClick=\{\(\) => handleDeleteUser\(user\.id\)\}\s+style=\{\{ background: 'none', border: 'none', color: 'var\(--error\)', cursor: 'pointer', padding: '8px', borderRadius: '8px' \}\}\s+>\s+<UserMinus size=\{18\} \/>\s+<\/button>\s+<\/td>/g;

const newButton = `<td style={{ padding: '16px 8px', textAlign: 'right' }}>
                            <button 
                              onClick={() => handleDeleteUser(user.id)}
                              className="modern-icon-box"
                              style={{ border: 'none', color: 'var(--error)', padding: '8px', display: 'inline-flex' }}
                              title="Revoke Access"
                            >
                               <UserMinus size={18} />
                            </button>
                         </td>`;

content = content.replace(oldButton, newButton);

fs.writeFileSync('src/pages/AdminPanel.jsx', content);
console.log('AdminPanel.jsx updated successfully');
