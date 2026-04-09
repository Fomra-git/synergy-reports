import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

const oldGetVal = `                  const getVal = (r, c) => {
                     const cell = finalAOA[r] ? finalAOA[r][c] : null;
                     return (cell && typeof cell === 'object') ? cell.v : cell;
                  };`;

const newGetVal = `                  // Normalized value for comparison (trimming for robustness)
                  const getVal = (r, c) => {
                     const cell = finalAOA[r] ? finalAOA[r][c] : null;
                     const raw = (cell && typeof cell === 'object') ? cell.v : cell;
                     if (raw === null || raw === undefined) return '';
                     return String(raw).trim();
                  };`;

const oldCompare = `if (currentVal !== lastVal) {`;
const newCompare = `if (currentVal !== lastVal && lastVal !== null) {`; // Ensure we don't merge leading nulls into the first real value

if (content.includes(oldGetVal)) {
    content = content.replace(oldGetVal, newGetVal);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated with robust merge comparison');
} else {
    console.log('Target helper not found');
}
