import fs from 'fs';

const filePath = 'src/pages/AdminPanel.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Add AdminSettings import and Settings icon
content = content.replace(
  "import { UserPlus, UserMinus, Shield, Mail, Search, AlertCircle } from 'lucide-react';",
  "import { UserPlus, UserMinus, Shield, Mail, Search, AlertCircle, Settings } from 'lucide-react';\nimport AdminSettings from '../components/AdminSettings';"
);

// Add activeTab state
content = content.replace(
  "const [success, setSuccess] = useState('');",
  "const [success, setSuccess] = useState('');\n  const [activeTab, setActiveTab] = useState('users');"
);

// Replace header and wrap content
const targetHeader = `      <header className="page-header">
        <h1 className="page-title">Admin Management</h1>
        <p className="page-description">Authorize new users and manage permission levels.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px' }}>`;

const replacementHeader = `      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
           <h1 className="page-title">Admin Management</h1>
           <p className="page-description">Authorize users and configure global app settings.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', background: 'var(--glass-subtle)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <button 
               onClick={() => setActiveTab('users')}
               style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'users' ? 'var(--primary)' : 'transparent', color: activeTab === 'users' ? 'white' : 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}
            >
               User Management
            </button>
            <button 
               onClick={() => setActiveTab('settings')}
               style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'settings' ? 'var(--primary)' : 'transparent', color: activeTab === 'settings' ? 'white' : 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}
            >
               App Settings
            </button>
        </div>
      </header>

      {activeTab === 'users' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px' }}>`;

const bottomWrapSrc = `        </div>
      </div>

      <ModernModal`;

const bottomWrapRepl = `        </div>
      </div>
      ) : (
        <AdminSettings />
      )}

      <ModernModal`;

content = content.replace(targetHeader, replacementHeader);
content = content.replace(bottomWrapSrc, bottomWrapRepl);

fs.writeFileSync(filePath, content);
console.log('Updated AdminPanel.jsx with tabs.');
