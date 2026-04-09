import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

// Use a regex that allows for variation in the surrounding code
const sortingInjectionRegex = /else\s*{\s*reportData\s*=\s*reportData\.map\(\s*r\s*=>\s*r\.data\s*\);\s*}\s*/;

const newLogic = `else {
            // Extract the flat data
            reportData = reportData.map(r => r.data);
            
            // AUTOMATIC SORTING FOR MERGED COLUMNS (New Fix)
            // To ensure "Merge & Center" works effectively, we must group identical rows together.
            const mergeCols = template.mappings
               .filter(m => m.enableMerging && m.target)
               .map(m => m.target);

            if (mergeCols.length > 0) {
               reportData.sort((a, b) => {
                  for (const col of mergeCols) {
                     const valA = String(a[col] || '').trim();
                     const valB = String(b[col] || '').trim();
                     if (valA !== valB) {
                        // Use a natural sort to handle names and numbers correctly
                        return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                     }
                  }
                  return 0;
               });
            }
         }
`;

if (sortingInjectionRegex.test(content)) {
    content = content.replace(sortingInjectionRegex, newLogic);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated with automatic data grouping for robust merging (v2)');
} else {
    console.log('Regex for sorting injection not found');
}
