import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

const oldMergeLogicHeader = `             if (mergeMappings.length > 0) {
                if (!ws['!merges']) ws['!merges'] = [];
                
                mergeMappings.forEach(m => {`;

const newMergeLogicHeader = `             if (mergeMappings.length > 0) {
                if (!ws['!merges']) ws['!merges'] = [];
                
                // Track "Break Points" from columns to the left to ensure hierarchical merging.
                // A child column (like Count) should never merge across a parent's boundary.
                const parentBreakPoints = new Set();

                mergeMappings.forEach(m => {`;

const oldMergeLoop = `                  for (let r = dataStartRow + 1; r < finalAOA.length; r++) {
                     const currentVal = getVal(r, colIdx);
                     
                     if (currentVal !== lastVal) {
                        if (r - 1 > startIdx) {
                           ws['!merges'].push({ s: { r: startIdx, c: colIdx }, e: { r: r - 1, c: colIdx } });`;

const newMergeLoop = `                  for (let r = dataStartRow + 1; r < finalAOA.length; r++) {
                     const currentVal = getVal(r, colIdx);
                     
                     // BREAK if value changes OR if a parent column to the left broke here
                     if (currentVal !== lastVal || parentBreakPoints.has(r)) {
                        if (r - 1 > startIdx) {
                           ws['!merges'].push({ s: { r: startIdx, c: colIdx }, e: { r: r - 1, c: colIdx } });`;

const oldMergeReset = `                        lastVal = currentVal;
                        startIdx = r;
                     }
                  }`;

const newMergeReset = `                        lastVal = currentVal;
                        startIdx = r;
                        // Important: Mark this as a break point for all columns to the right
                        parentBreakPoints.add(r);
                     }
                  }`;

if (content.includes(oldMergeLogicHeader) && content.includes(oldMergeLoop) && content.includes(oldMergeReset)) {
    content = content.replace(oldMergeLogicHeader, newMergeLogicHeader);
    content = content.replace(oldMergeLoop, newMergeLoop);
    content = content.replace(oldMergeReset, newMergeReset);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated with Hierarchical (Smart) Merging logic');
} else {
    console.log('Target merge logic strings not found');
}
