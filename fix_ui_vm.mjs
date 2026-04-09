import fs from 'fs';

let content = fs.readFileSync('src/pages/VisualExcelMapping.jsx', 'utf8');

// Replace handleSave function and add ModernModal to the end of return
const oldSaveRegex = /const handleSave = async \(\) => \{\s+if \(!formData\.name\) \{\s+alert\('Please enter a template name'\);\s+return;\s+\}\s+setIsSaving\(true\);\s+setSaveStatus\('Saving\.\.\.'\);\s+try \{\s+if \(selectedTemplateId\) \{\s+await updateDoc\(doc\(db, 'templates', selectedTemplateId\), formData\);\s+\} else \{\s+const docRef = await addDoc\(collection\(db, 'templates'\), \{\s+\.\.\.formData,\s+createdAt: new Date\(\)\.toISOString\(\)\s+\}\);\s+setSelectedTemplateId\(docRef\.id\);\s+fetchTemplates\(\);\s+\}\s+setSaveStatus\('Success!'\);\s+setTimeout\(\(\) => setSaveStatus\(''\), 3000\);\s+\} catch \(err\) \{\s+console\.error\('Save error:', err\);\s+\} finally \{\s+setIsSaving\(false\);\s+\}\s+\};/;

const newSave = `const handleSave = async () => {
    if (!formData.name) {
      setModal({
        isOpen: true,
        title: 'Missing Information',
        message: 'Please provide a name for your template before saving.',
        type: 'warning',
        mode: 'alert',
        confirmText: 'Got it'
      });
      return;
    }
    setIsSaving(true);
    setSaveStatus('Saving...');
    try {
      if (selectedTemplateId) {
        await updateDoc(doc(db, 'templates', selectedTemplateId), formData);
      } else {
        const docRef = await addDoc(collection(db, 'templates'), {
          ...formData,
          createdAt: new Date().toISOString()
        });
        setSelectedTemplateId(docRef.id);
        fetchTemplates();
      }
      setSaveStatus('Success!');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setModal({
        isOpen: true,
        title: 'Save Error',
        message: 'There was an issue saving your template to the cloud.',
        type: 'danger',
        mode: 'alert',
        confirmText: 'Retry'
      });
    } finally {
      setIsSaving(false);
    }
  };`;

// Use simple string replacement for reliability if possible, or broad regex
// Actually I'll just look for the handleSave start and finish.
const saveStart = "const handleSave = async () => {";
const saveEnd = "setIsSaving(false);\n    }\n  };";

// Finding the handleSave block
const startIndex = content.indexOf(saveStart);
const endIndex = content.indexOf(saveEnd, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    const fullBlock = content.substring(startIndex, endIndex + saveEnd.length);
    content = content.replace(fullBlock, newSave);
    console.log('handleSave refactored');
}

// Add ModernModal to JSX return
const returnEnd = "</div>\n    </div>\n  );\n}";
const newReturnPart = `</div>
      <ModernModal 
        {...modal} 
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
        onInputChange={val => setModal(prev => ({ ...prev, inputValue: val }))}
      />
    </div>
  );
}`;

if (content.includes(returnEnd)) {
    content = content.replace(returnEnd, newReturnPart);
    console.log('ModernModal added to JSX');
}

// Update Top level buttons
const oldTopButtons = /<div style=\{\{ display: 'flex', gap: '16px' \}\}>\s+<button onClick=\{handleSave\} className="btn-primary" disabled=\{isSaving\}>\s+\{isSaving \? <Loader2 className="spinner" size=\{18\} \/> : <Save size=\{18\} \/>\}\s+\{selectedTemplateId \? 'Update Template' : 'Save Template'\}\s+<\/button>\s+\{saveStatus === 'success' && <div style=\{\{ color: 'var\(--success\)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px' \}\}><CheckCircle2 size=\{16\} \/> Saved!<\/div>\}\s+<\/div>/;

const newTopButtons = `<div style={{ display: 'flex', gap: '12px' }}>
             <button 
               onClick={handleSave} 
               disabled={isSaving}
               className="btn-primary modern-icon-box"
               style={{ minWidth: '160px', padding: '12px 24px', gap: '8px', background: 'var(--primary)', color: 'white' }}
             >
               {isSaving ? <Loader2 className="spinner" size={18} /> : (saveStatus === 'Success!' ? <CheckCircle2 size={18} /> : <Save size={18} />)}
               {saveStatus || (selectedTemplateId ? 'Update Library' : 'Save Library')}
             </button>
          </div>`;

content = content.replace(oldTopButtons, newTopButtons);

fs.writeFileSync('src/pages/VisualExcelMapping.jsx', content);
console.log('VisualExcelMapping.jsx updated successfully');
