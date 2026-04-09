import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

const oldCheck = `                  // The group identity is based on the MAPPED value of the source column
                  const baseVal = String(reportData[i].data[sourceCol] || '').trim();
                  let j = i;
                  let groupMatches = 0;

                  // Find the end of the contiguous block and count valid rows
                  while (j < reportData.length && String(reportData[j].data[sourceCol] || '').trim() === baseVal) {`;

const newCheck = `                  // The group identity is based on the ORIGINAL RAW value of the source column
                  const baseVal = String(reportData[i].raw[sourceCol] || '').trim();
                  let j = i;
                  let groupMatches = 0;

                  // Find the end of the contiguous block and count valid rows
                  while (j < reportData.length && String(reportData[j].raw[sourceCol] || '').trim() === baseVal) {`;

if (content.includes(oldCheck)) {
    content = content.replace(oldCheck, newCheck);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated: Grouped counts now correctly use RAW data for boundary detection.');
} else {
    console.log('Old check logic not found');
}
