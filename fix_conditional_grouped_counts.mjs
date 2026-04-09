import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

// 1. Preserve 'raw' row in mapping phase
const mappingReturnOld = `return { data: newRow, hasEmpty: rowHasEmpty };`;
const mappingReturnNew = `return { data: newRow, raw: row, hasEmpty: rowHasEmpty };`;

// 2. Change flattening logic and improve sorting/count engine
const flatteningLogicOldRegex = /\/\/ Hiding rows that don't have empty cells in Audit\/Highlight mode[\s\S]*?finalAOA\.push\(columnHeaders\);[\s\S]*?reportData\.forEach\(row => \{[\s\S]*?finalAOA\.push\(columnHeaders\.map\(h => row\[h\]\)\);[\s\S]*?\}\);/;

const flatteningLogicNew = `// Hiding rows that don't have empty cells in Audit/Highlight mode
        if (template.isHighlightEmptyEnabled) {
           reportData = reportData.filter(r => r.hasEmpty);
        }

        // AUTOMATIC SORTING FOR MERGED COLUMNS
        // We sort the wrapped objects to preserve access to original 'raw' data
        const mergeCols = template.mappings
           .filter(m => m.enableMerging && m.target)
           .map(m => m.target);

        if (mergeCols.length > 0) {
           reportData.sort((a, b) => {
              for (const col of mergeCols) {
                 const valA = String(a.data[col] || '').trim();
                 const valB = String(b.data[col] || '').trim();
                 if (valA !== valB) {
                    return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                 }
              }
              return 0;
           });
        }

        // POST-SORTING RECALCULATION FOR GROUPED COUNTS (Improved Fix)
        const groupedCountMappings = template.mappings.filter(m => m.type === 'count' && m.isGroupedCount && m.source && m.target);
        if (groupedCountMappings.length > 0) {
           groupedCountMappings.forEach(m => {
              const targetCol = m.target;
              const sourceCol = m.source;
              let i = 0;
              while (i < reportData.length) {
                 // The group identity is based on the MAPPED value of the source column
                 const baseVal = String(reportData[i].data[sourceCol] || '').trim();
                 let j = i;
                 let groupMatches = 0;

                 // Find the end of the contiguous block and count valid rows
                 while (j < reportData.length && String(reportData[j].data[sourceCol] || '').trim() === baseVal) {
                    // CRITICAL FIX: Evaluate conditions against the ORIGINAL RAW master row
                    if (evaluateCondition(reportData[j].raw, m)) {
                       groupMatches++;
                    }
                    j++;
                 }

                 // Overwrite the count value for all mapped results in this group
                 for (let k = i; k < j; k++) {
                    reportData[k].data[targetCol] = groupMatches;
                 }
                 i = j;
              }
           });
        }

        // --- FLATTEN DATA FOR FINAL OUTPUT ---
        // Insert Top Merged Header
        if (topReportHeader !== null && topReportHeader !== undefined) {
           finalAOA.push([topReportHeader]);
        }
        
        columnHeaders = template.mappings.filter(m => m.target).map(m => m.target);
        finalAOA.push(columnHeaders);
        
        reportData.forEach(item => {
           finalAOA.push(columnHeaders.map(h => item.data[h]));
        });`;

// We also need to remove the redundant extraction block I added previously
const redundantBlockRegex = /\s*}\s*else\s*{\s*\/\/ Extract the flat data[\s\S]*?\}\s*}\s*}\s*}\s*\/\/ 3\. Generate Pivot Data/;
const pivotStart = `// 3. Generate Pivot Data`;

if (content.includes(mappingReturnOld)) {
    content = content.replace(mappingReturnOld, mappingReturnNew);
    
    // Replace the entire sequence from Audit filters to finalAOA push
    const startMarker = `// Hiding rows that don't have empty cells in Audit/Highlight mode`;
    const endMarker = `reportData.forEach(row => {`;
    // We'll replace up to the end of that loop
    const startIndex = content.indexOf(startMarker);
    const lastLoopIndex = content.lastIndexOf(`finalAOA.push(columnHeaders.map(h => row[h]));`);
    const endIndex = content.indexOf(`});`, lastLoopIndex) + 3;
    
    if (startIndex !== -1 && lastLoopIndex !== -1) {
        content = content.substring(0, startIndex) + flatteningLogicNew + content.substring(endIndex);
        fs.writeFileSync('src/pages/GenerateReport.jsx', content);
        console.log('GenerateReport.jsx updated with Conditional Grouped Counting logic');
    } else {
        console.log('Start/End markers not found for extraction logic');
    }
} else {
    console.log('Mapping return point not found');
}
