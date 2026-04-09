import fs from 'fs';

let content = fs.readFileSync('src/pages/VisualExcelMapping.jsx', 'utf8');

// The block we want to move
const displayOptionsBlockRegex = /\s*{\/\* DISPLAY OPTIONS \*\/}[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;

const match = content.match(displayOptionsBlockRegex);

if (match) {
    const block = match[0].trim();
    // 1. Remove it from its current position
    content = content.replace(match[0], '');
    
    // 2. Insert it after the "Processing Rule" selection block
    const targetRegex = /<option value="time_diff">Time Difference<\/option>\s*<\/select>\s*<\/div>/;
    
    if (targetRegex.test(content)) {
        content = content.replace(targetRegex, (m) => m + '\n\n' + block);
        fs.writeFileSync('src/pages/VisualExcelMapping.jsx', content);
        console.log('VisualExcelMapping.jsx updated: Display Options are now global');
    } else {
        console.log('Target insertion point not found');
    }
} else {
    console.log('Display Options block not found');
}
