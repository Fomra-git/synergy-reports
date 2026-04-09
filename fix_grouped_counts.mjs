import fs from 'fs';

let content = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');

const injectionPoint = `                  return 0;
               });
            }
         }`;

const groupedCountLogic = `                  return 0;
               });
            }

            // POST-SORTING RECALCULATION FOR GROUPED COUNTS (New Fix)
            // If any count column is set to "Grouped Scope", we recalculate its value 
            // based on the contiguous block size in the final sorted report.
            const groupedCountMappings = template.mappings.filter(m => m.type === 'count' && m.isGroupedCount && m.source && m.target);
            if (groupedCountMappings.length > 0) {
               groupedCountMappings.forEach(m => {
                  const targetCol = m.target;
                  const sourceCol = m.source;
                  let i = 0;
                  while (i < reportData.length) {
                     const baseVal = String(reportData[i][sourceCol] || '').trim();
                     let j = i;
                     // Find the end of the contiguous block
                     while (j < reportData.length && String(reportData[j][sourceCol] || '').trim() === baseVal) {
                        j++;
                     }
                     const groupSize = j - i;
                     // Overwrite the count value for all rows in this group
                     for (let k = i; k < j; k++) {
                        reportData[k][targetCol] = groupSize;
                     }
                     i = j;
                  }
               });
            }
         }`;

if (content.includes(injectionPoint)) {
    content = content.replace(injectionPoint, groupedCountLogic);
    fs.writeFileSync('src/pages/GenerateReport.jsx', content);
    console.log('GenerateReport.jsx updated with Precise Grouped Count engine logic');
} else {
    console.log('Injection point for Grouped Count logic not found');
}
