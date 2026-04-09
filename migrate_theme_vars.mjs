import fs from 'fs';
import path from 'path';

function replaceInFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    content = content.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.0[23]\s*\)/g, 'var(--glass-subtle)');
    content = content.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.05\s*\)/g, 'var(--glass-bg)');
    content = content.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.1\s*\)/g, 'var(--glass-border)');
    content = content.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.2\s*\)/g, 'var(--glass-strong)');
    content = content.replace(/rgba\(\s*15\s*,\s*23\s*,\s*42\s*,\s*0\.[0-9]+\s*\)/g, 'var(--input-bg)');

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        console.log('Updated ' + filePath);
    }
}

const pagesDir = 'src/pages';
const pageFiles = fs.readdirSync(pagesDir);
for (const file of pageFiles) {
   if (file.endsWith('.jsx')) {
       replaceInFile(path.join(pagesDir, file));
   }
}

const compsDir = 'src/components';
const compFiles = fs.readdirSync(compsDir);
for (const file of compFiles) {
   if (file.endsWith('.jsx')) {
       replaceInFile(path.join(compsDir, file));
   }
}

console.log('Done.');
