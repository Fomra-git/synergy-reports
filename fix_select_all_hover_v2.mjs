import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

// Use a more flexible regex that doesn't care about exact whitespace or indentation
const regex = /<div\s+onClick=\{handleSelectAll\}[\s\S]*?className="interactive-icon"\s*>/;

const match = content.match(regex);

if (match) {
    const updated = match[0]
        .replace('className="interactive-icon"', '')
        .replace('style={{', `onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'} 
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'} 
                      style={{ borderRadius: '12px',`);
    
    content = content.replace(match[0], updated);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated successfully');
} else {
    console.log('Regex did not match');
}
