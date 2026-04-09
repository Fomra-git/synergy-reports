import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

// Use regex to find the mergeMappings block
const mergeMappingsStartRegex = /if\s*\(mergeMappings\.length\s*>\s*0\)\s*\{\s*if\s*\(!ws\['!merges'\]\)\s*ws\['!merges'\]\s*=\s*\[\];/;
const replacementHeader = `if (mergeMappings.length > 0) {
                if (!ws['!merges']) ws['!merges'] = [];
                
                // Track "Break Points" from columns to the left to ensure hierarchical merging.
                // A child column (like Count) should never merge across a parent's group boundary.
                const parentBreakPoints = new Set();
`;

// Regex for the value comparison in the merge loop
const valueCompareRegex = /if\s*\(currentVal\s*!==\s*lastVal\)\s*\{/;
const replacementCompare = `if (currentVal !== lastVal || parentBreakPoints.has(r)) {`;

// Regex for the lastVal reset block
const lastValResetRegex = /lastVal\s*=\s*currentVal;\s*startIdx\s*=\s*r;/;
const replacementReset = `lastVal = currentVal;
                        startIdx = r;
                        // Important: Mark this as a break point for all columns to the right
                        parentBreakPoints.add(r);`;

if (mergeMappingsStartRegex.test(content) && valueCompareRegex.test(content) && lastValResetRegex.test(content)) {
    content = content.replace(mergeMappingsStartRegex, replacementHeader);
    content = content.replace(valueCompareRegex, replacementCompare);
    content = content.replace(lastValResetRegex, replacementReset);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated with Hierarchical (Smart) Merging logic (v2)');
} else {
    console.log('Regex matches not found in v2 script');
}
