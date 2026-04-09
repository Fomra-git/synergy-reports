import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, getDocs } from 'firebase/firestore';
import XLSX from 'xlsx-js-style';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Download, 
  FileArchive,
  ArrowRight,
  Search
} from 'lucide-react';

export default function GenerateReport() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [masterFile, setMasterFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const q = query(collection(db, 'templates'));
      const snapshot = await getDocs(q);
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setMasterFile(file);
      setError('');
    } else {
      setError('Please upload a valid Excel or CSV file.');
    }
  };

  const toggleTemplateSelection = (id) => {
    setSelectedTemplates(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedTemplates.length === filteredTemplates.length && filteredTemplates.length > 0) {
      setSelectedTemplates([]);
    } else {
      setSelectedTemplates(filteredTemplates.map(t => t.id));
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(templateSearchTerm.toLowerCase()) || 
    (t.description || '').toLowerCase().includes(templateSearchTerm.toLowerCase())
  );

  const processFile = async (explicitTemplateId = null) => {
    const isSingle = !!explicitTemplateId;
    const targetTemplates = isSingle 
      ? templates.filter(t => t.id === explicitTemplateId)
      : templates.filter(t => selectedTemplates.includes(t.id));

    if (!masterFile || targetTemplates.length === 0) return;
    
    setIsGenerating(true);
    setStatus('Reading master file...');
    
    try {
      const data = await masterFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const masterData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]);
      
      const zip = new JSZip();
      
      for (const template of targetTemplates) {
        setStatus(`Generating ${template.name}...`);
        
        let topReportHeader = null;
        if (template.isHeaderEnabled && template.headerConfig) {
             if (template.headerConfig.type === 'custom' && template.headerConfig.text) {
                  topReportHeader = template.headerConfig.text;
             } else if (template.headerConfig.type === 'mapped' && template.headerConfig.sourceCol && masterData.length > 0) {
                  topReportHeader = masterData[0][template.headerConfig.sourceCol];
             }
        }
        
        const finalAOA = [];
        const wb = XLSX.utils.book_new();
        let columnHeaders = [];
        
        const evaluateCondition = (row, mapping) => {
          if (!mapping) return true;
          
          // Helper for single rule evaluation
          const evalRule = (targetVal, operator, conditionVals) => {
            const condVals = conditionVals && conditionVals.length > 0
              ? conditionVals
              : [];

            const numMaster = Number(targetVal);
            const isMasterNumeric = !isNaN(numMaster) && targetVal !== undefined && targetVal !== '' && targetVal !== null;

            if (operator === 'between') {
               if (condVals.length < 2) return false;
               const min = Number(condVals[0]);
               const max = Number(condVals[1]);
               if (!isMasterNumeric || isNaN(min) || isNaN(max)) return false;
               return numMaster >= min && numMaster <= max;
            }

            const evalSingle = (condVal) => {
              const numCond = condVal !== null && condVal !== undefined && condVal !== '' ? Number(condVal) : NaN;
              const isNumeric = isMasterNumeric && !isNaN(numCond);

              if (operator === '==') {
                return isNumeric ? numMaster === numCond : String(targetVal) === String(condVal);
              } else if (operator === '!=') {
                return isNumeric ? numMaster !== numCond : String(targetVal) !== String(condVal);
              } else if (operator === '>') {
                return isNumeric ? numMaster > numCond : String(targetVal) > String(condVal);
              } else if (operator === '<') {
                return isNumeric ? numMaster < numCond : String(targetVal) < String(condVal);
              } else if (operator === '>=') {
                return isNumeric ? numMaster >= numCond : String(targetVal) >= String(condVal);
              } else if (operator === '<=') {
                return isNumeric ? numMaster <= numCond : String(targetVal) <= String(condVal);
              } else if (operator === 'contains') {
                return String(targetVal || '').toLowerCase().includes(String(condVal || '').toLowerCase());
              }
              return false;
            };

            if (condVals.length > 0) {
              if (operator === '!=') {
                 return condVals.every(c => evalSingle(c));
              } else {
                 return condVals.some(c => evalSingle(c));
              }
            }
            return true;
          };

          // MULTI-RULE HANDLING (New)
          if (mapping.rules && mapping.rules.length > 0) {
            return mapping.rules.every(rule => {
              if (!rule.conditionCol) return true;
              return evalRule(row[rule.conditionCol], rule.operator, rule.conditionVals);
            });
          }

          // LEGACY SINGLE-RULE HANDLING
          if (!mapping.conditionCol) return true;
          return evalRule(row[mapping.conditionCol], mapping.operator, mapping.conditionVals);
        };

        // 1. Apply Global Pre-Filters (New Sidebar Engine)
        let filteredMasterData = [...masterData];
        
        if (template.isGlobalFilterEnabled !== false && template.globalFilters && template.globalFilters.length > 0) {
           template.globalFilters.forEach(globalFilter => {
              if (!globalFilter.conditionCol) return;
              
              if (globalFilter.operator === 'unique') {
                  const seen = new Set();
                  filteredMasterData = filteredMasterData.filter(row => {
                     const val = row[globalFilter.conditionCol];
                     if (val === undefined || val === null || val === '') return true;
                     const stringVal = String(val).trim().toLowerCase();
                     if (seen.has(stringVal)) return false;
                     seen.add(stringVal);
                     return true;
                  });
              } else {
                  filteredMasterData = filteredMasterData.filter(row => evaluateCondition(row, globalFilter));
              }
           });
        }

        // 2. Apply Legacy Mappings (Backwards Compatibility for templates using the old condition columns)
        const legacyConditionMappings = template.mappings.filter(m => m.type === 'condition' && m.conditionCol);
        if (legacyConditionMappings.length > 0) {
          filteredMasterData = filteredMasterData.filter(row => {
            return legacyConditionMappings.every(mapping => evaluateCondition(row, mapping));
          });
        }
        
        // Pre-compute Aggregate Metric Counts
        const metricCounts = {};
        template.mappings.forEach((mapping, idx) => {
          if (mapping.type === 'condition_count' && mapping.conditionCol) {
             let matchedCount = 0;
             // Count against the universally pre-filtered dataset, not the raw dataset!
             filteredMasterData.forEach(row => {
               if (evaluateCondition(row, mapping)) matchedCount++;
             });
             metricCounts[idx] = matchedCount;
          }
        });
        
        // Render 1 row automatically if it's purely a Summary Dashboard or user forced Summary Mode
        // We ensure Audit Mode (no mappings + highlight empty) doesn't accidentally trigger a single row.
        let hasMappingTargets = template.mappings.some(m => m.target);
        const isSummaryOnly = template.isSummaryMode === true || 
                             (hasMappingTargets && template.mappings.every(m => m.type === 'condition_count' || !m.target));

        if (isSummaryOnly && filteredMasterData.length > 0) {
           filteredMasterData = [filteredMasterData[0]];
        }

        // Pre-compute occurrences based on filtered data only
        const countMaps = {};
        const countMappings = template.mappings.filter(m => m.type === 'count' && m.source);
        countMappings.forEach(m => {
          countMaps[m.source] = {};
          filteredMasterData.forEach(row => {
            // Check optional conditions for count mappings
            if (!evaluateCondition(row, m)) return;

            const val = row[m.source];
            if (val !== undefined && val !== null) {
              countMaps[m.source][val] = (countMaps[m.source][val] || 0) + 1;
            }
          });
        });

        // Map data based on template rules
        let reportData = filteredMasterData.map((row, index) => {
          const newRow = {};
          let rowHasEmpty = false;
          
          template.mappings.forEach((mapping, mappingIndex) => {
            if (!mapping.target) return;
            
            let val = '';
            const type = mapping.type || 'direct';
            
            if (type === 'direct' && mapping.source) {
              val = row[mapping.source] !== undefined ? row[mapping.source] : '';
            } 
            else if (type === 'serial') {
              val = index + 1;
            } 
            else if (type === 'count' && mapping.source) {
              const rawVal = row[mapping.source];
              val = rawVal !== undefined && rawVal !== null ? countMaps[mapping.source][rawVal] : 0;
            }
            else if (type === 'time_diff' && mapping.colA && mapping.colB) {
              // Parse various time formats into total minutes since midnight
              const parseTimeToMins = (raw) => {
                if (raw === undefined || raw === null || raw === '') return null;
                const str = String(raw).trim().toUpperCase();

                // Handle Excel serial number (decimal fraction of a day)
                if (!isNaN(Number(str))) {
                  const fracDay = Number(str) % 1;
                  return Math.round(fracDay * 24 * 60);
                }

                // Handle HH:MM:SS AM/PM or HH:MM AM/PM
                const match = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/);
                if (!match) return null;
                let hrs = parseInt(match[1], 10);
                const mins = parseInt(match[2], 10);
                const isPM = match[4] === 'PM';
                const isAM = match[4] === 'AM';
                if (isPM && hrs !== 12) hrs += 12;
                if (isAM && hrs === 12) hrs = 0;
                return hrs * 60 + mins;
              };

              const timeA = parseTimeToMins(row[mapping.colA]); // End / Checkout
              const timeB = parseTimeToMins(row[mapping.colB]); // Start / Checkin
              
              if (timeA === null || timeB === null) {
                val = 'Parse Err';
              } else {
                let diffMins = timeA - timeB;
                if (diffMins < 0) diffMins += 24 * 60; // handle overnight crossings
                
                const threshold = mapping.threshold ? parseInt(mapping.threshold, 10) : null;
                const outType = mapping.outType || 'duration_hhmm';

                if (outType === 'duration_hhmm') {
                  const h = Math.floor(diffMins / 60);
                  const m = diffMins % 60;
                  val = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
                } else if (outType === 'duration_mins') {
                  val = diffMins;
                } else if (outType === 'exceeds_yn') {
                  val = threshold !== null ? (diffMins > threshold ? 'Yes' : 'No') : 'N/A';
                } else if (outType === 'excess_mins') {
                  val = threshold !== null ? (diffMins - threshold) : diffMins;
                } else if (outType === 'excess_hhmm') {
                  const excess = threshold !== null ? (diffMins - threshold) : 0;
                  const isNeg = excess < 0;
                  const absExcess = Math.abs(excess);
                  const h = Math.floor(absExcess / 60);
                  const m = absExcess % 60;
                  val = (isNeg ? '-' : '') + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
                } else if (outType === 'remaining_mins') {
                  val = threshold !== null ? (threshold - diffMins) : 0;
                } else if (outType === 'remaining_hhmm') {
                  const remaining = threshold !== null ? (threshold - diffMins) : 0;
                  const isNeg = remaining < 0;
                  const absRem = Math.abs(remaining);
                  const h = Math.floor(absRem / 60);
                  const m = absRem % 60;
                  val = (isNeg ? '-' : '') + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
                }
              }
            }
            else if (type === 'math' && mapping.formula) {
              let expression = mapping.formula;
              // Resolve [MasterCol] references from the raw master row
              const masterMatches = expression.match(/\[(.*?)\]/g);
              if (masterMatches) {
                masterMatches.forEach(match => {
                  const colName = match.replace(/\[|\]/g, '');
                  const innerVal = row[colName];
                  const numVal = isNaN(Number(innerVal)) ? 0 : Number(innerVal);
                  expression = expression.split(match).join(numVal);
                });
              }
              // Resolve {TemplateCol} references from already-computed template columns (newRow)
              const tmplMatches = expression.match(/\{(.*?)\}/g);
              if (tmplMatches) {
                tmplMatches.forEach(match => {
                  const colName = match.replace(/\{|\}/g, '');
                  const innerVal = newRow[colName];
                  const numVal = (innerVal !== undefined && innerVal !== null && !isNaN(Number(innerVal))) ? Number(innerVal) : 0;
                  expression = expression.split(match).join(numVal);
                });
              }

              // Transform human-friendly functions to JS Math
              const funcMap = {
                'ABS(': 'Math.abs(',
                'ROUND(': 'Math.round(',
                'CEIL(': 'Math.ceil(',
                'FLOOR(': 'Math.floor(',
                'MAX(': 'Math.max(',
                'MIN(': 'Math.min('
              };
              Object.entries(funcMap).forEach(([key, val]) => {
                expression = expression.split(key).join(val);
              });

              try {
                // Allow digits, operators, dots, commas, parentheses, spaces, and the word "Math"
                if (!/^[0-9+\-*/(),.\s]|Math\.[a-z]+/.test(expression)) {
                   // A more precise check: Allow only characters and specific Math calls
                   if (/[^0-9+\-*/(),.\s]|(?!\bMath\.(abs|round|ceil|floor|max|min)\b)Math\./.test(expression)) {
                      throw new Error("Invalid characters");
                   }
                }
                const result = new Function(`return ${expression}`)();
                val = isNaN(result) || !isFinite(result) ? 'Error' : Number(result.toFixed(4));
              } catch(e) {
                val = 'Err: Syntax';
              }
            }
            else if (type === 'condition' && mapping.conditionCol) {
              val = row[mapping.conditionCol] !== undefined ? row[mapping.conditionCol] : '';
            }
            else if (type === 'condition_count' && mapping.conditionCol) {
              val = metricCounts[mappingIndex] || 0;
            }

            // --- APPLY TEXT TRANSFORMS (Cleaning) ---
            if (mapping.findText && val !== null && val !== undefined) {
               try {
                  // Escape special regex characters in the search string
                  const escapedSearch = mapping.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  val = String(val).replace(new RegExp(escapedSearch, 'gi'), mapping.replaceWith || '').trim();
               } catch (e) {
                  console.error("Transform error:", e);
               }
            } else if (val !== null && val !== undefined) {
               // Default fallback: trim whitespace even if no find/replace is set
               val = String(val).trim();
            }

            // Apply Background Shading for Empty Cells if enabled
            const isEmpty = val === '' || val === null || val === undefined;
            if (template.isHighlightEmptyEnabled && isEmpty) {
               rowHasEmpty = true;
               newRow[mapping.target] = {
                 v: '',
                 t: 's',
                 s: { fill: { fgColor: { rgb: "FF8080" } } } // Medium Red
               };
            } else {
               newRow[mapping.target] = val;
            }
          });
          
          return { data: newRow, raw: row, hasEmpty: rowHasEmpty };
        });

        // 2.5 Apply Report Output Filters (Post-mapping)
        if (template.isOutputFilterEnabled !== false && template.outputFilters && template.outputFilters.length > 0) {
          reportData = reportData.filter(rowObj => {
            const mappedRow = rowObj.data;
            return template.outputFilters.every(filter => {
              if (!filter.conditionCol) return true;
              
              // We reuse evaluateCondition but pass the Mapped Row instead of the Master Row
              // The filter.conditionCol refers to the Target Column Name in the template
              const targetVal = mappedRow[filter.conditionCol];
              
              // Since evaluateCondition expects mapping.conditionCol to find value, 
              // we can just pass mappedRow directly if we ensure fields match.
              return evaluateCondition(mappedRow, filter);
            });
          });
        }

        // Hiding rows that don't have empty cells in Audit/Highlight mode
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
                 // The group identity is based on the ORIGINAL RAW value of the source column
                  const baseVal = String(reportData[i].raw[sourceCol] || '').trim();
                 let j = i;
                 let groupMatches = 0;

                 // Find the end of the contiguous block and count valid rows
                 while (j < reportData.length && String(reportData[j].raw[sourceCol] || '').trim() === baseVal) {
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
           finalAOA.push(columnHeaders.map(h => {
              const val = item.data[h];
              // SANITIZE DATA: Ensure we only pass primitives to Excel to avoid layout artifacts
              if (val === null || val === undefined) return '';
              if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : '';
              if (typeof val === 'object') return ''; // Don't render raw objects
              return val;
           }));
        });

        // --- ADD SUMMARY / TOTALS FOOTER ---
        const footerCalculations = template.mappings.filter(m => m.totalType && m.totalType !== 'none' && m.target);
        if (footerCalculations.length > 0) {
           const footerRow = new Array(columnHeaders.length).fill(null);
           const styledFooterRow = []; // We will use XLSX cell objects for styling
           
           // Index mapping for footer calculations
           const calcIdxs = footerCalculations.map(m => ({
              idx: columnHeaders.indexOf(m.target),
              type: m.totalType
           })).filter(o => o.idx !== -1).sort((a, b) => a.idx - b.idx);

           if (calcIdxs.length > 0) {
              // 1. Calculate the values
              const results = {};
              calcIdxs.forEach(({ idx, type }) => {
                 const values = reportData.map(item => {
                    const val = item.data[columnHeaders[idx]];
                    return parseFloat(val);
                 }).filter(v => !isNaN(v));

                 if (values.length === 0) {
                    results[idx] = 0;
                 } else {
                    switch (type) {
                       case 'sum': results[idx] = values.reduce((a, b) => a + b, 0); break;
                       case 'avg': results[idx] = values.reduce((a, b) => a + b, 0) / values.length; break;
                       case 'count': results[idx] = values.length; break;
                       case 'min': results[idx] = Math.min(...values); break;
                       case 'max': results[idx] = Math.max(...values); break;
                    }
                 }
              });

              // 2. Identify contiguous blocks and place shared labels
              let i = 0;
              while (i < calcIdxs.length) {
                 let j = i;
                 while (j + 1 < calcIdxs.length && calcIdxs[j+1].idx === calcIdxs[j].idx + 1) {
                    j++;
                 }

                 // Block is from calcIdxs[i].idx to calcIdxs[j].idx
                 const firstIdx = calcIdxs[i].idx;
                 const labelIdx = firstIdx - 1;

                 // Determine custom label
                 let customLabel = 'SUMMARY:';
                 for (let k = i; k <= j; k++) {
                    const mappingIdx = footerCalculations.findIndex(m => m.target === columnHeaders[calcIdxs[k].idx]);
                    if (mappingIdx !== -1 && footerCalculations[mappingIdx].totalLabel) {
                       customLabel = footerCalculations[mappingIdx].totalLabel;
                       break; 
                    }
                 }

                 if (labelIdx >= 0) {
                    footerRow[labelIdx] = customLabel;
                 }

                 // Fill result cells
                 for (let k = i; k <= j; k++) {
                    const currentIdx = calcIdxs[k].idx;
                    footerRow[currentIdx] = results[currentIdx];
                 }

                 i = j + 1;
              }

              // 3. Assemble the row with styling objects
              footerRow.forEach((val, fIdx) => {
                 if (val === null) {
                    styledFooterRow.push('');
                 } else {
                    styledFooterRow.push({
                       v: val,
                       t: typeof val === 'number' ? 'n' : 's',
                       s: {
                          font: { bold: true },
                          fill: { fgColor: { rgb: "F1F5F9" } }, // Subtle slate highlight
                          alignment: { horizontal: typeof val === 'number' ? 'center' : 'right' }
                       }
                    });
                 }
              });
              
              finalAOA.push(styledFooterRow);
           }
        }

        // 3. Generate Pivot Data if enabled
        let pivotRows = [];
        if (template.isPivotEnabled && template.pivotConfig && template.pivotConfig.rowField) {
           const { rowField, colField, valField, aggType } = template.pivotConfig;
           const pivotMap = {};
           const allCols = new Set();
           
           filteredMasterData.forEach(row => {
              const rVal = row[rowField] !== undefined && row[rowField] !== null ? String(row[rowField]) : '(Blank)';
              const cVal = colField ? (row[colField] !== undefined && row[colField] !== null ? String(row[colField]) : '(Blank)') : 'Value';
              const vVal = valField ? (isNaN(Number(row[valField])) ? 0 : Number(row[valField])) : 1;
              
              if (!pivotMap[rVal]) pivotMap[rVal] = {};
              if (!pivotMap[rVal][cVal]) pivotMap[rVal][cVal] = { sum: 0, count: 0 };
              
              pivotMap[rVal][cVal].sum += vVal;
              pivotMap[rVal][cVal].count += 1;
              allCols.add(cVal);
           });
           
           const sortedCols = Array.from(allCols).sort();
           pivotRows.push([rowField, ...sortedCols]);
           
           Object.entries(pivotMap).forEach(([r, cols]) => {
              const rowArr = [r];
              sortedCols.forEach(c => {
                 if (cols[c]) {
                    rowArr.push(aggType === 'count' ? cols[c].count : cols[c].sum);
                 } else {
                    rowArr.push(0);
                 }
              });
              pivotRows.push(rowArr);
           });
        }

        if (hasMappingTargets) {
           const ws = XLSX.utils.aoa_to_sheet(finalAOA);
           
           // Apply Merging for the Title Row
           if (topReportHeader !== null && topReportHeader !== undefined && columnHeaders.length > 1) {
              if (!ws['!merges']) ws['!merges'] = [];
              ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: columnHeaders.length - 1 } });
           }
            // Apply Vertical Merging for Hierarchical Rows (New)
            const mergeMappings = template.mappings.filter(m => m.enableMerging && m.target);
            if (mergeMappings.length > 0) {
                if (!ws['!merges']) ws['!merges'] = [];
                
                // Track "Break Points" from columns to the left to ensure hierarchical merging.
                // A child column (like Count) should never merge across a parent's group boundary.
                const parentBreakPoints = new Set();

               
               mergeMappings.forEach(m => {
                  const colIdx = columnHeaders.indexOf(m.target);
                  if (colIdx === -1) return;
                  
                  // Start row: 0 is Title (if exists), 1 is Headers, 2 is First Data Row
                  let dataStartRow = (topReportHeader !== null && topReportHeader !== undefined) ? 2 : 1;
                  
                  let startIdx = dataStartRow;

                  // NEW: Pre-apply "Center" alignment to ALL cells in this column for consistency
                  for (let r = dataStartRow; r < finalAOA.length; r++) {
                     const cellAddress = XLSX.utils.encode_cell({ r, c: colIdx });
                     if (ws[cellAddress]) {
                        if (typeof ws[cellAddress] !== 'object') ws[cellAddress] = { v: ws[cellAddress], t: 's' };
                        if (!ws[cellAddress].s) ws[cellAddress].s = {};
                        ws[cellAddress].s.alignment = { 
                           vertical: 'center', 
                           horizontal: 'center',
                           wrapText: false
                        };
                     }
                  }

                  // Handle AOA values which could be either primitives or cell objects {v: ...}
                  // Normalized value for comparison (trimming for robustness)
                  const getVal = (r, c) => {
                     const cell = finalAOA[r] ? finalAOA[r][c] : null;
                     const raw = (cell && typeof cell === 'object') ? cell.v : cell;
                     if (raw === null || raw === undefined) return '';
                     return String(raw).trim();
                  };
                  
                  let lastVal = getVal(startIdx, colIdx);
                  
                  for (let r = dataStartRow + 1; r < finalAOA.length; r++) {
                     const currentVal = getVal(r, colIdx);
                     
                     if (currentVal !== lastVal || parentBreakPoints.has(r)) {
                        if (r - 1 > startIdx) {
                           ws['!merges'].push({ s: { r: startIdx, c: colIdx }, e: { r: r - 1, c: colIdx } });
                        }
                        lastVal = currentVal;
                        startIdx = r;
                        // Important: Mark this as a break point for all columns to the right
                        parentBreakPoints.add(r);
                     }
                  }
                  
                  // Close final merge group if any
                  if (finalAOA.length - 1 > startIdx) {
                       ws['!merges'].push({ s: { r: startIdx, c: colIdx }, e: { r: finalAOA.length - 1, c: colIdx } });
                  }
               });
            }
             
             // --- ENFORCE COMPACT ROW HEIGHTS FOR ALL ROWS ---
             ws['!rows'] = finalAOA.map(() => ({ hpt: 16 }));

             XLSX.utils.book_append_sheet(wb, ws, 'Data Report');
        }
        
        if (pivotRows.length > 0) {
           const wsPivot = XLSX.utils.aoa_to_sheet(pivotRows);
           XLSX.utils.book_append_sheet(wb, wsPivot, 'Pivot Analysis');
        }

        if (wb.SheetNames.length === 0) {
           const wsEmpty = XLSX.utils.json_to_sheet([{ Status: 'No column mappings or pivot configuration targets found.' }]);
           XLSX.utils.book_append_sheet(wb, wsEmpty, 'Report');
        }
        
        // Write to buffer
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        
        // Add to ZIP or download individual
        const fileName = template.fileNameFormat
          ? template.fileNameFormat.replace('{date}', new Date().toISOString().split('T')[0]) + '.xlsx'
          : `${template.name.replace(/\s+/g, '_')}.xlsx`;
          
        if (!isSingle) {
          zip.file(fileName, excelBuffer);
        } else {
          const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
          saveAs(blob, fileName);
        }
      }
      
      if (!isSingle) {
        setStatus('Compressing files...');
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `Synergy_Reports_${new Date().getTime()}.zip`);
      }
      
      setStatus('Completed!');
      setTimeout(() => setStatus(''), 3000);
    } catch (err) {
      console.error('Generation error:', err);
      setError('An error occurred during report generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="generate-report">
      <header className="page-header">
        <h1 className="page-title">Generate Reports</h1>
        <p className="page-description">Process your master data through multiple templates simultaneously.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) 320px', gap: '32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* File Upload Section */}
          <div className="glass" style={{ padding: '32px' }}>
             <h3 style={{ fontSize: '18px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
               <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>1</span>
               Upload Master File
             </h3>
             
             <div 
               className={`upload-zone ${isDragging ? 'dragging' : ''} ${masterFile ? 'has-file' : ''}`}
               onClick={() => fileInputRef.current.click()}
               onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
               onDragLeave={() => setIsDragging(false)}
               onDrop={(e) => {
                 e.preventDefault();
                 setIsDragging(false);
                 const file = e.dataTransfer.files[0];
                 if (file) handleFileChange({ target: { files: [file] } });
               }}
               style={{ 
                 padding: masterFile ? '40px' : '60px',
                 borderColor: masterFile ? 'var(--success)' : (isDragging ? 'var(--primary)' : 'var(--border)')
               }}
             >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  style={{ display: 'none' }} 
                  accept=".xlsx, .xls, .csv" 
                />
                
                {masterFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', textAlign: 'left' }}>
                    <div className="login-logo-icon" style={{ width: '56px', height: '56px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                      <FileSpreadsheet size={28} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: '600', fontSize: '16px' }}>{masterFile.name}</p>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{(masterFile.size / 1024).toFixed(1)} KB • Ready to process</p>
                    </div>
                    <CheckCircle2 color="var(--success)" size={24} />
                  </div>
                ) : (
                  <>
                    <div className="upload-icon"><Upload size={32} /></div>
                    <p style={{ fontWeight: '600', fontSize: '16px' }}>Click or drag Excel/CSV file here</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>Security Note: This file stays in your browser.</p>
                  </>
                )}
             </div>
             {error && <div className="alert-error" style={{ marginTop: '20px' }}>{error}</div>}
          </div>

          {/* Template Selection Section */}
          <div className="glass" style={{ padding: '32px' }}>
             <h3 style={{ fontSize: '18px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
               <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>2</span>
               Select Output Templates
             </h3>
             
             {templates.length === 0 ? (
               <div style={{ textAlign: 'center', padding: '40px' }}>
                 <p style={{ color: 'var(--text-muted)' }}>No templates found. Create some in the Template Manager first.</p>
               </div>
             ) : (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                   
                   {/* TEMPLATE SEARCH */}
                   <div style={{ 
                     display: 'flex', 
                     alignItems: 'center', 
                     gap: '12px', 
                     padding: '10px 16px', 
                     background: 'var(--glass-subtle)', 
                     borderRadius: '12px',
                     border: '1px solid var(--border)',
                     marginBottom: '8px'
                   }}>
                      <Search size={16} color="var(--text-muted)" />
                      <input 
                        type="text" 
                        placeholder="Search templates..." 
                        value={templateSearchTerm}
                        onChange={e => setTemplateSearchTerm(e.target.value)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '14px', flex: 1, outline: 'none' }}
                      />
                   </div><div 
                     onClick={handleSelectAll}
                     onMouseOver={e => e.currentTarget.style.background = 'var(--glass-subtle)'} 
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'} 
                      style={{ borderRadius: '12px', 
                       display: 'flex', 
                       alignItems: 'center', 
                       gap: '16px', 
                       padding: '12px 16px', 
                       cursor: 'pointer',
                       borderBottom: '1px solid var(--border)',
                       marginBottom: '8px',
                       transition: '0.2s'
                     }}
                     
                   >
                      <div className="modern-icon-box" style={{ 
                        width: '24px', 
                        height: '24px', 
                        borderRadius: '6px', 
                        background: (selectedTemplates.length === templates.length && templates.length > 0) ? 'var(--primary)' : 'var(--glass-bg)',
                        borderColor: (selectedTemplates.length === templates.length && templates.length > 0) ? 'var(--primary)' : 'var(--border)',
                        color: 'var(--text-main)',
                        flexShrink: 0
                      }}>
                        {(selectedTemplates.length === templates.length && templates.length > 0) && <CheckCircle2 size={16} />}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Select All Templates
                      </span>
                      <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', background: 'var(--glass-bg)', padding: '2px 8px', borderRadius: '10px' }}>
                        {selectedTemplates.length} / {filteredTemplates.length} Selected
                      </div>
                   </div>
{filteredTemplates.map(template => (
                    <div 
                      key={template.id} 
                      onClick={() => toggleTemplateSelection(template.id)}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '16px', 
                        padding: '16px', 
                        borderRadius: '16px', 
                        background: selectedTemplates.includes(template.id) ? 'rgba(99, 102, 241, 0.1)' : 'var(--glass-subtle)',
                        border: '1px solid',
                        borderColor: selectedTemplates.includes(template.id) ? 'var(--primary)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                       <div style={{ 
                         width: '20px', 
                         height: '20px', 
                         borderRadius: '6px', 
                         border: '2px solid',
                         borderColor: selectedTemplates.includes(template.id) ? 'var(--primary)' : 'var(--border)',
                         background: selectedTemplates.includes(template.id) ? 'var(--primary)' : 'transparent',
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                         color: 'var(--text-main)'
                       }}>
                         {selectedTemplates.includes(template.id) && <CheckCircle2 size={14} />}
                       </div>
                       <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: '600' }}>{template.name}</p>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{template.mappings.length} column mappings</p>
                       </div>
                       
                       <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                         {masterFile && (
                           <button 
                             className="btn-link"
                             onClick={(e) => { e.stopPropagation(); processFile(template.id); }}
                             disabled={isGenerating}
                             title="Download this specific report directly"
                             style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px' }}
                           >
                             <Download size={18} />
                           </button>
                         )}
                         <ArrowRight size={16} color="var(--text-muted)" />
                       </div>
                    </div>
                  ))}
               </div>
             )}
          </div>
        </div>

        {/* Action Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
           <div className="glass" style={{ padding: '32px' }}>
              <div style={{ textAlign: 'center' }}>
                 <div style={{ 
                   width: '80px', 
                   height: '80px', 
                   borderRadius: '24px', 
                   background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                   color: 'var(--text-main)',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   margin: '0 auto 24px',
                   boxShadow: '0 8px 16px rgba(99, 102, 241, 0.2)'
                 }}>
                    <FileArchive size={40} />
                 </div>
                 <h4 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Execution Hub</h4>
                 <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '32px' }}>
                   Ready to generate {selectedTemplates.length} reports in a single ZIP file.
                 </p>
                 
                 <button 
                   className="btn-primary btn-full" 
                   disabled={!masterFile || selectedTemplates.length === 0 || isGenerating}
                   style={{ height: '56px', fontSize: '16px' }}
                   onClick={() => processFile(null)}
                 >
                   {isGenerating ? (
                     <><Loader2 className="spinner" size={20} /> Processing...</>
                   ) : (
                     <><Download size={20} /> Generate & Save ZIP</>
                   )}
                 </button>
                 
                 {status && (
                   <p style={{ marginTop: '16px', fontSize: '14px', color: 'var(--primary)', fontWeight: '500' }}>
                     {status}
                   </p>
                 )}
              </div>
           </div>

           <div className="glass" style={{ padding: '24px' }}>
              <h5 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} color="var(--warning)" />
                Security Standards
              </h5>
              <ul style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '16px' }}>
                <li>Your data is never uploaded to any server.</li>
                <li>Parsing happens 100% locally in your session.</li>
                <li>Only template metadata is stored in Firebase.</li>
                <li>Encryption-in-transit for template fetching.</li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  );
}
