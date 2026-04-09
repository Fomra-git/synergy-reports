import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

const targetPoint = `         } else {
            reportData = reportData.map(r => r.data);
         }`;

const sortedLogic = `         } else {
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
                        // Use a natural sort to handle "Dr." and numbers correctly
                        return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                     }
                  }
                  return 0;
               });
            }
         }`;

if (content.includes(targetPoint)) {
    content = content.replace(targetPoint, sortedLogic);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated with automatic data grouping for robust merging');
} else {
    console.log('Target point for sorting not found');
}
