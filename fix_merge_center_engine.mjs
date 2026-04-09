import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

const injectionPoint = `            XLSX.utils.book_append_sheet(wb, ws, 'Data Report');`;

const mergeLogic = `            // Apply Vertical Merging for Hierarchical Rows (New)
            const mergeMappings = template.mappings.filter(m => m.enableMerging && m.target);
            if (mergeMappings.length > 0) {
               if (!ws['!merges']) ws['!merges'] = [];
               
               mergeMappings.forEach(m => {
                  const colIdx = columnHeaders.indexOf(m.target);
                  if (colIdx === -1) return;
                  
                  // Start row: 0 is Title (if exists), 1 is Headers, 2 is First Data Row
                  let dataStartRow = (topReportHeader !== null && topReportHeader !== undefined) ? 2 : 1;
                  
                  let startIdx = dataStartRow;
                  let lastVal = finalAOA[startIdx] ? (typeof finalAOA[startIdx][colIdx] === 'object' ? finalAOA[startIdx][colIdx].v : finalAOA[startIdx][colIdx]) : null;
                  
                  for (let r = dataStartRow + 1; r < finalAOA.length; r++) {
                     const currentValRaw = finalAOA[r][colIdx];
                     const currentVal = typeof currentValRaw === 'object' ? currentValRaw.v : currentValRaw;
                     
                     if (currentVal !== lastVal) {
                        if (r - 1 > startIdx) {
                           ws['!merges'].push({ s: { r: startIdx, c: colIdx }, e: { r: r - 1, c: colIdx } });
                           
                           // Apply "Center" alignment to the merged block
                           const cellAddress = XLSX.utils.encode_cell({ r: startIdx, c: colIdx });
                           if (ws[cellAddress]) {
                              if (typeof ws[cellAddress] !== 'object') ws[cellAddress] = { v: ws[cellAddress], t: 's' };
                              if (!ws[cellAddress].s) ws[cellAddress].s = {};
                              ws[cellAddress].s.alignment = { vertical: 'center', horizontal: 'center' };
                           }
                        }
                        lastVal = currentVal;
                        startIdx = r;
                     }
                  }
                  
                  // Close final merge group if any
                  if (finalAOA.length - 1 > startIdx) {
                      ws['!merges'].push({ s: { r: startIdx, c: colIdx }, e: { r: finalAOA.length - 1, c: colIdx } });
                      const cellAddress = XLSX.utils.encode_cell({ r: startIdx, c: colIdx });
                      if (ws[cellAddress]) {
                         if (typeof ws[cellAddress] !== 'object') ws[cellAddress] = { v: ws[cellAddress], t: 's' };
                         if (!ws[cellAddress].s) ws[cellAddress].s = {};
                         ws[cellAddress].s.alignment = { vertical: 'center', horizontal: 'center' };
                      }
                  }
               });
            }

            XLSX.utils.book_append_sheet(wb, ws, 'Data Report');`;

if (content.includes(injectionPoint)) {
    content = content.replace(injectionPoint, mergeLogic);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated with Merge & Center engine logic');
} else {
    console.log('Injection point not found');
}
