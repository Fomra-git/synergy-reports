import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

// Use regex to catch the specific lines regardless of exact spacing
const regex1 = /\/\/ The group identity is based on the MAPPED value of the source column\s+const baseVal = String\(reportData\[i\]\.data\[sourceCol\] \|\| ''\)\.trim\(\);/;
const replacement1 = `// The group identity is based on the ORIGINAL RAW value of the source column
                  const baseVal = String(reportData[i].raw[sourceCol] || '').trim();`;

const regex2 = /while \(j < reportData\.length && String\(reportData\[j\]\.data\[sourceCol\] \|\| ''\)\.trim\(\) === baseVal\) \{/;
const replacement2 = `while (j < reportData.length && String(reportData[j].raw[sourceCol] || '').trim() === baseVal) {`;

if (regex1.test(content) && regex2.test(content)) {
    content = content.replace(regex1, replacement1);
    content = content.replace(regex2, replacement2);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated with final boundary detection fix (v3)');
} else {
    console.log('Regex matches not found');
}
