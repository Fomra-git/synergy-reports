import fs from 'fs';
import path from 'path';

function replaceInFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Splitting by lines to apply selective replacement
    const lines = content.split('\n');
    const newLines = lines.map(line => {
        // If the line defines a button/badge with primary background, keep it white.
        if (line.includes('var(--primary)') || line.includes('(--success)')) {
            return line;
        }
        
        // For input components specifically, use --input-text
        if (line.includes('<input ') && line.includes('color: \'white\'')) {
            return line.replace(/color:\s*'white'/g, "color: 'var(--input-text)'");
        }

        // For all other generic text, use --text-main
        let modifiedLine = line.replace(/color:\s*'white'/g, "color: 'var(--text-main)'");
        modifiedLine = modifiedLine.replace(/color:\s*"white"/g, 'color: "var(--text-main)"');
        
        return modifiedLine;
    });

    content = newLines.join('\n');

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        console.log('Fixed fonts in ' + filePath);
    }
}

const pagesDir = 'src/pages';
if(fs.existsSync(pagesDir)){
    fs.readdirSync(pagesDir).forEach(file => {
       if (file.endsWith('.jsx')) replaceInFile(path.join(pagesDir, file));
    });
}

const compsDir = 'src/components';
if(fs.existsSync(compsDir)){
    fs.readdirSync(compsDir).forEach(file => {
       if (file.endsWith('.jsx')) replaceInFile(path.join(compsDir, file));
    });
}

console.log('Font color fix complete.');
