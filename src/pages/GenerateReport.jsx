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
      const worksheet = workbook.Sheets[firstSheetName];

      // --- ROBUST HEADER NORMALIZATION ---
      // Read only the first row to get names
      const headerRow = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] || [];
      const cleanHeaders = headerRow.map(h => String(h || "").trim());
      
      // Use the cleaned headers to parse the data
      // range: 1 ensures we start reading data from row 1, using cleanHeaders as keys for row 0
      const masterData = XLSX.utils.sheet_to_json(worksheet, { header: cleanHeaders, range: 1, defval: "" });

      // --- MASTER DATA NORMALIZATION: JSON-LAYER UN-MERGE ---
      if (worksheet['!merges'] && masterData.length > 0) {
         const headers = Object.keys(masterData[0]);
         worksheet['!merges'].forEach(range => {
            const { s, e } = range;
            for (let c = s.c; c <= e.c; c++) {
               const headerName = headers[c]; 
               if (!headerName) continue;
               const firstDataRowIdx = s.r - 1;
               if (firstDataRowIdx < 0) continue; 
               const sourceRow = masterData[firstDataRowIdx];
               if (!sourceRow) return;
               const val = sourceRow[headerName];
               if (val === undefined || val === null || val === "") return;
               for (let r = s.r; r <= e.r; r++) {
                  const targetRowIdx = r - 1;
                  if (targetRowIdx >= 0 && targetRowIdx < masterData.length) {
                     if (masterData[targetRowIdx][headerName] === "") {
                        masterData[targetRowIdx][headerName] = val;
                     }
                  }
               }
            }
         });
      }
      
      const zip = new JSZip();
      
      for (const template of targetTemplates) {
        setStatus(`Generating ${template.name}...`);
        
        let topReportHeader = null;
        if (template.isHeaderEnabled && template.headerConfig) {
             if (template.headerConfig.type === 'custom' && template.headerConfig.text) {
                  topReportHeader = template.headerConfig.text;
             } else if (template.headerConfig.type === 'mapped' && template.headerConfig.sourceCol && masterData.length > 0) {
                 topReportHeader = getMasterValue(masterData[0], template.headerConfig.sourceCol);
             }
        }
        
        const finalAOA = [];
        const wb = XLSX.utils.book_new();
        let columnHeaders = [];
        const parseSafeNum = (val) => {
            if (val === null || val === undefined || val === '') return 0;
            if (typeof val === 'number') return val;
            const cleaned = String(val).replace(/[^0-9.-]/g, '');
            const num = parseFloat(cleaned);
            return isNaN(num) ? 0 : num;
         };

         // --- ROBUST HEADER LOOKUP (Strips quotes, spaces, and handles case-insensitivity) ---
         const getMasterValue = (row, source) => {
           if (!source || !row) return '';
           // Try direct match first for performance
           if (row[source] !== undefined && row[source] !== null) return row[source];
           
           const cleanSource = String(source).trim().replace(/["']/g, '').toLowerCase();
           const matchingKey = Object.keys(row).find(k => {
              const cleanKey = String(k).trim().replace(/["']/g, '').toLowerCase();
              return cleanKey === cleanSource;
           });
           
           return matchingKey ? row[matchingKey] : '';
         };

         const evaluateCondition = (row, mapping) => {
          if (!mapping) return true;
          const evalRule = (targetVal, operator, conditionVals) => {
            const condVals = conditionVals && conditionVals.length > 0 ? conditionVals : [];
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
              if (operator === '==') return isNumeric ? numMaster === numCond : String(targetVal) === String(condVal);
              if (operator === '!=') return isNumeric ? numMaster !== numCond : String(targetVal) !== String(condVal);
              if (operator === '>') return isNumeric ? numMaster > numCond : String(targetVal) > String(condVal);
              if (operator === '<') return isNumeric ? numMaster < numCond : String(targetVal) < String(condVal);
              if (operator === '>=') return isNumeric ? numMaster >= numCond : String(targetVal) >= String(condVal);
              if (operator === '<=') return isNumeric ? numMaster <= numCond : String(targetVal) <= String(condVal);
              if (operator === 'contains') return String(targetVal || '').toLowerCase().includes(String(condVal || '').toLowerCase());
              return false;
            };
            if (condVals.length > 0) {
              if (operator === '!=') return condVals.every(c => evalSingle(c));
              return condVals.some(c => evalSingle(c));
            }
            return true;
          };
          if (mapping.rules && mapping.rules.length > 0) {
            return mapping.rules.every(rule => {
              if (!rule.conditionCol) return true;
              return evalRule(getMasterValue(row, rule.conditionCol), rule.operator, rule.conditionVals);
            });
          }
          if (!mapping.conditionCol) return true;
          return evalRule(getMasterValue(row, mapping.conditionCol), mapping.operator, mapping.conditionVals);
        };

        let filteredMasterData = [...masterData];
        const displayUniqueFilters = [];
        
        if (template.isGlobalFilterEnabled !== false && template.globalFilters && template.globalFilters.length > 0) {
           template.globalFilters.forEach(globalFilter => {
              if (!globalFilter.conditionCol) return;
              if (globalFilter.operator === 'unique') displayUniqueFilters.push(globalFilter);
              else filteredMasterData = filteredMasterData.filter(row => evaluateCondition(row, globalFilter));
           });
        }

        const legacyConditionMappings = (template.mappings || []).filter(m => m.type === 'condition' && m.conditionCol);
        if (legacyConditionMappings.length > 0) {
           filteredMasterData = filteredMasterData.filter(row => legacyConditionMappings.every(m => evaluateCondition(row, m)));
        }

        const metricCounts = {};
        (template.mappings || []).forEach((m, idx) => {
           if (m.type === 'condition_count' && m.conditionCol) {
              metricCounts[idx] = filteredMasterData.filter(row => evaluateCondition(row, m)).length;
           }
        });
        
        let hasMappingTargets = (template.mappings || []).some(m => m.target);

        // --- PIVOT TEMPLATE LOGIC ---
        if (template.type === 'pivot') {
          // CLONE AND MIGRATE (For backwards compatibility with old templates on different systems)
          let pivotCols = [...(template.pivotColumns || [])];
          
          // Migration 1: old valueFields to pivotColumns
          if (pivotCols.length === 0 && template.valueFields && template.valueFields.length > 0) {
            pivotCols = template.valueFields.map((vf, i) => ({
              id: `leggen-${i}`,
              type: 'aggregation',
              ...vf
            }));
          }

          // Migration 2: Inject grouping column if not in list
          const rowField = template.rowField;
          if (rowField && !pivotCols.some(c => c.type === 'grouping')) {
            pivotCols = [{
              id: 'grp-gen',
              type: 'grouping',
              source: rowField,
              displayName: rowField
            }, ...pivotCols];
          }

          const groupingCol = pivotCols.find(c => c.type === 'grouping');
          const activeRowField = groupingCol ? groupingCol.source : rowField;
          
          if (!activeRowField) {
            console.warn("Pivot template missing rowField/groupingCol", template.name);
          } else {
            const pivotMap = {}; 
            const aggCols = pivotCols.filter(c => c.type === 'aggregation');

            filteredMasterData.forEach(row => {
               const rawGroupVal = getMasterValue(row, activeRowField);
               const groupVal = rawGroupVal !== undefined && rawGroupVal !== null && rawGroupVal !== '' ? String(rawGroupVal) : '(Blank)';
               if (!pivotMap[groupVal]) {
                 pivotMap[groupVal] = {
                   rows: [],
                   firstRow: row,
                   aggregations: {}
                 };
               }
               pivotMap[groupVal].rows.push(row);
            });

            // Headers assembly (Directly from pivotCols)
            const headers = pivotCols.map(c => c.displayName || (c.type === 'aggregation' ? `${c.operation.toUpperCase()}(${c.source})` : c.source || 'Untitled'));
            finalAOA.push(headers);

            const pivotResults = [];

            Object.entries(pivotMap).forEach(([groupVal, group]) => {
               const groupResult = {};
               
               // 1. Pre-calculate aggregations
               aggCols.forEach(col => {
                  const vals = group.rows.map(r => parseSafeNum(r[col.source])).filter(v => v !== undefined);
                  let res = 0;
                  if (col.operation === 'count') res = vals.length;
                  else if (vals.length > 0) {
                    if (col.operation === 'sum') res = vals.reduce((a, b) => a + b, 0);
                    else if (col.operation === 'avg') res = vals.reduce((a, b) => a + b, 0) / vals.length;
                    else if (col.operation === 'min') res = Math.min(...vals);
                    else if (col.operation === 'max') res = Math.max(...vals);
                  }
                  group.aggregations[col.id] = typeof res === 'number' ? Number(res.toFixed(2)) : res;
               });

               // 2. Process all columns in order
               const reportRow = [];
               pivotCols.forEach(col => {
                  let val = '';
                  if (col.type === 'grouping') {
                    val = groupVal;
                  } else if (col.type === 'property') {
                    val = getMasterValue(group.firstRow, col.source);
                  } else if (col.type === 'aggregation') {
                    val = group.aggregations[col.id];
                  } else if (col.type === 'formula') {
                    let expr = col.formula || '';
                    (expr.match(/\[(.*?)\]/g) || []).forEach(m => {
                       const header = m.replace(/[\[\]]/g, '');
                       expr = expr.split(m).join(parseSafeNum(getMasterValue(group.firstRow, header)));
                    });
                    (expr.match(/\{(.*?)\}/g) || []).forEach(m => {
                       const colName = m.replace(/[\{\}]/g, '');
                       expr = expr.split(m).join(parseSafeNum(groupResult[colName]));
                    });

                    try {
                      const res = new Function(`return ${expr}`)();
                      val = isNaN(res) || !isFinite(res) ? 0 : Number(res.toFixed(4));
                    } catch(e) {
                      val = 'Err';
                    }
                  }
                  
                  const colKey = col.displayName || (col.type === 'aggregation' ? `${col.operation.toUpperCase()}(${col.source})` : col.source || 'Untitled');
                  groupResult[colKey] = val;
                  reportRow.push(val);
               });
               
               pivotResults.push({ data: groupResult, rawRow: reportRow });
            });

            // Apply Output Filters
            let filteredResults = pivotResults;
            if (template.isOutputFilterEnabled !== false && template.outputFilters && template.outputFilters.length > 0) {
               filteredResults = pivotResults.filter(res => {
                  return template.outputFilters.every(f => evaluateCondition(res.data, f));
               });
            }

            filteredResults.forEach(res => finalAOA.push(res.rawRow));

            hasMappingTargets = true;
            columnHeaders = headers;
        }
      } else {
          // --- STANDARD MAPPING LOGIC (RESTORED EXPERT PHASES) ---
          const countMaps = {};
          const countMappings = (template.mappings || []).filter(m => m.type === 'count' && m.source);
          countMappings.forEach(m => {
            countMaps[m.source] = {};
            filteredMasterData.forEach(row => {
              if (!evaluateCondition(row, m)) return;
              const val = getMasterValue(row, m.source);
              if (val !== undefined && val !== null && val !== '') countMaps[m.source][val] = (countMaps[m.source][val] || 0) + 1;
            });
          });

          const isSummaryOnly = template.isSummaryMode === true || (hasMappingTargets && (template.mappings || []).every(m => m.type === 'condition_count' || !m.target));
          let processData = [...filteredMasterData];
          if (isSummaryOnly && processData.length > 0) processData = [processData[0]];

          let reportData = processData.map((row, index) => {
            const newRow = {};
            let rowHasEmpty = false;
            (template.mappings || []).forEach((mapping, mappingIndex) => {
              if (!mapping.target) return;
              let val = '';
              const type = mapping.type || 'direct';
              if (type === 'direct' && mapping.source) val = getMasterValue(row, mapping.source);
              else if (type === 'serial') val = index + 1;
              else if (type === 'count' && mapping.source) {
                // countMaps is built with raw mapping.source as key, we should lookup robustly too?
                // Actually countMaps is built using row[m.source] which we should also normalize.
                val = getMasterValue(row, mapping.source) !== '' ? countMaps[mapping.source][getMasterValue(row, mapping.source)] : 0;
              }
              else if (type === 'time_diff' && mapping.colA && mapping.colB) {
                 const parseTimeToMins = (raw) => {
                    if (raw === undefined || raw === null || raw === '') return null;
                    const str = String(raw).trim().toUpperCase();
                    if (!isNaN(Number(str))) return Math.round((Number(str) % 1) * 24 * 60);
                    const match = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/);
                    if (!match) return null;
                    let hrs = parseInt(match[1], 10);
                    const mins = parseInt(match[2], 10);
                    if (match[4] === 'PM' && hrs !== 12) hrs += 12;
                    if (match[4] === 'AM' && hrs === 12) hrs = 0;
                    return hrs * 60 + mins;
                  };
                  const timeA = parseTimeToMins(row[mapping.colA]);
                  const timeB = parseTimeToMins(row[mapping.colB]);
                  if (timeA === null || timeB === null) val = 'Parse Err';
                  else {
                    let diffMins = timeA - timeB;
                    if (diffMins < 0) diffMins += 24 * 60;
                    const threshold = mapping.threshold ? parseInt(mapping.threshold, 10) : null;
                    const outType = mapping.outType || 'duration_hhmm';
                    if (outType === 'duration_hhmm') val = String(Math.floor(diffMins / 60)).padStart(2, '0') + ':' + String(diffMins % 60).padStart(2, '0');
                    else if (outType === 'duration_mins') val = diffMins;
                    else if (outType === 'exceeds_yn') val = threshold !== null ? (diffMins > threshold ? 'Yes' : 'No') : 'N/A';
                  }
              }
              else if (type === 'math' && mapping.formula) {
                 let expr = mapping.formula;
                 (expr.match(/\[(.*?)\]/g) || []).forEach(m => expr = expr.split(m).join(parseSafeNum(row[m.replace(/[\[\]]/g, '')])));
                 (expr.match(/\{(.*?)\}/g) || []).forEach(m => expr = expr.split(m).join(parseSafeNum(newRow[m.replace(/[\{\}]/g, '')])));
                 const funcMap = { 'ABS(': 'Math.abs(', 'ROUND(': 'Math.round(', 'CEIL(': 'Math.ceil(', 'FLOOR(': 'Math.floor(', 'MAX(': 'Math.max(', 'MIN(': 'Math.min(' };
                 Object.entries(funcMap).forEach(([k, v]) => expr = expr.split(k).join(v));
                 try { const res = new Function(`return ${expr}`)(); val = isNaN(res) || !isFinite(res) ? 'Error' : Number(res.toFixed(4)); } catch(e) { val = 'Err: Syntax'; }
              }
              else if (type === 'condition' || type === 'direct') val = row[mapping.conditionCol || mapping.source] || '';
              else if (type === 'condition_count') val = metricCounts[mappingIndex] || 0;

              if (mapping.findText && val) val = String(val).replace(new RegExp(mapping.findText, 'gi'), mapping.replaceWith || '').trim();
              else if (val) val = String(val).trim();

              const isEmpty = val === '' || val === null || val === undefined;
              if (template.isHighlightEmptyEnabled && isEmpty) {
                 rowHasEmpty = true;
                 newRow[mapping.target] = { v: '', t: 's', s: { fill: { fgColor: { rgb: "FF8080" } } } };
              } else newRow[mapping.target] = val;
            });
            return { data: newRow, raw: row, hasEmpty: rowHasEmpty };
          });

          // Output Filters
          if (template.isOutputFilterEnabled !== false && template.outputFilters && template.outputFilters.length > 0) {
            reportData = reportData.filter(r => template.outputFilters.every(f => evaluateCondition(r.data, f)));
          }
          if (template.isHighlightEmptyEnabled) reportData = reportData.filter(r => r.hasEmpty);

          // Sorting & Merging
          const mergeCols = (template.mappings || []).filter(m => m.enableMerging && m.target).map(m => m.target);
          if (mergeCols.length > 0) {
             reportData.sort((a, b) => {
                for (const col of mergeCols) {
                   const vA = String(a.data[col] || '').trim(), vB = String(b.data[col] || '').trim();
                   if (vA !== vB) return vA.localeCompare(vB, undefined, { numeric: true, sensitivity: 'base' });
                }
                return 0;
             });
          }

          // Aggregations (Cluster & Sum logic)
          const groupAggMappings = (template.mappings || []).filter(m => m.groupAggType && m.groupAggType !== 'none' && m.target);
          if (groupAggMappings.length > 0) {
             groupAggMappings.forEach(m => {
                const targetCol = m.target, aggType = m.groupAggType;
                const boundCols = m.groupAggBy ? [m.groupAggBy] : (template.mappings || []).slice(0, template.mappings.indexOf(m)).filter(map => map.enableMerging && map.target).map(map => map.target);
                if (boundCols.length === 0) return;
                const globalTotals = {};
                reportData.forEach(item => {
                   const groupKey = boundCols.map(c => String(item.data[c] || '').trim().toLowerCase()).join('|');
                   if (!globalTotals[groupKey]) globalTotals[groupKey] = { vals: [] };
                   globalTotals[groupKey].vals.push(parseSafeNum(item.data[targetCol]));
                });
                reportData.forEach(item => {
                   const groupKey = boundCols.map(c => String(item.data[c] || '').trim().toLowerCase()).join('|');
                   const g = globalTotals[groupKey];
                   if (!g.result) {
                      let res = 0;
                      if (aggType === 'sum') res = g.vals.reduce((a, b) => a + b, 0);
                      else if (aggType === 'count') res = g.vals.length;
                      else if (aggType === 'avg') res = g.vals.length ? g.vals.reduce((a, b) => a + b, 0) / g.vals.length : 0;
                      g.result = aggType === 'count' ? Math.round(res) : Number(res.toFixed(2));
                   }
                   item.data[targetCol] = g.result;
                });
             });
          }

          if (topReportHeader) finalAOA.push([topReportHeader]);
          columnHeaders = (template.mappings || []).filter(m => m.target).map(m => m.target);
          finalAOA.push(columnHeaders);
          reportData.forEach(item => {
             finalAOA.push(columnHeaders.map(h => {
                const val = item.data[h];
                return (val && typeof val === 'object') ? val : (val === null || val === undefined ? '' : val);
             }));
          });

          // Totals Footer
          const footerCalculations = (template.mappings || []).filter(m => m.totalType && m.totalType !== 'none' && m.target);
          if (footerCalculations.length > 0) {
             const footerRow = new Array(columnHeaders.length).fill('');
             footerCalculations.forEach(m => {
                const idx = columnHeaders.indexOf(m.target);
                if (idx === -1) return;
                const vals = reportData.map(r => parseSafeNum(r.data[m.target])).filter(v => !isNaN(v));
                let res = 0;
                if (m.totalType === 'sum') res = vals.reduce((a, b) => a + b, 0);
                else if (m.totalType === 'avg') res = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                else if (m.totalType === 'count') res = vals.length;
                footerRow[idx] = { v: Number(res.toFixed(2)), t: 'n', s: { font: { bold: true }, fill: { fgColor: { rgb: "F1F5F9" } }, alignment: { horizontal: 'center' } } };
                if (idx > 0 && !footerRow[idx-1]) footerRow[idx-1] = { v: m.totalLabel || 'TOTAL:', t: 's', s: { font: { bold: true }, alignment: { horizontal: 'right' } } };
             });
             finalAOA.push(footerRow);
          }
        }

        // --- EXCEL GENERATION & STYLING (EXPERT VERSION) ---
        if (hasMappingTargets) {
           const ws = XLSX.utils.aoa_to_sheet(finalAOA);
           if (topReportHeader && columnHeaders.length > 1) {
              if (!ws['!merges']) ws['!merges'] = [];
              ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: columnHeaders.length - 1 } });
           }
           
           if (template.type !== 'pivot') {
              // Hierarchical Merging logic (Restored)
              const mergeMappings = (template.mappings || []).filter(m => m.enableMerging && m.target);
              if (mergeMappings.length > 0) {
                 if (!ws['!merges']) ws['!merges'] = [];
                 const parentBreakPoints = new Set();
                 mergeMappings.forEach(m => {
                    const colIdx = columnHeaders.indexOf(m.target);
                    if (colIdx === -1) return;
                    let dataStartRow = topReportHeader ? 2 : 1;
                    let startIdx = dataStartRow;
                    const getVal = (r, c) => {
                       const cell = finalAOA[r] ? finalAOA[r][c] : null;
                       const raw = (cell && typeof cell === 'object') ? cell.v : cell;
                       return String(raw || '').trim();
                    };
                    let lastVal = getVal(startIdx, colIdx);
                    for (let r = dataStartRow + 1; r < finalAOA.length; r++) {
                       const currentVal = getVal(r, colIdx);
                       if (currentVal !== lastVal || parentBreakPoints.has(r)) {
                          if (r - 1 > startIdx) ws['!merges'].push({ s: { r: startIdx, c: colIdx }, e: { r: r - 1, c: colIdx } });
                          lastVal = currentVal; startIdx = r; parentBreakPoints.add(r);
                       }
                    }
                    if (finalAOA.length - 1 > startIdx) ws['!merges'].push({ s: { r: startIdx, c: colIdx }, e: { r: finalAOA.length - 1, c: colIdx } });
                 });
              }
              // Row Heights Guard (Restored)
              const range = XLSX.utils.decode_range(ws['!ref']);
              ws['!rows'] = finalAOA.map((_, rIdx) => ({ hpt: 18, customHeight: true }));
           }

           // Global Guard (Alignment)
           const range = XLSX.utils.decode_range(ws['!ref']);
           for (let r = range.s.r; r <= range.e.r; r++) {
              for (let c = range.s.c; c <= range.e.c; c++) {
                 const addr = XLSX.utils.encode_cell({ r, c });
                 if (!ws[addr]) continue;
                 if (typeof ws[addr] !== 'object') ws[addr] = { v: ws[addr], t: 's' };
                 if (!ws[addr].s) ws[addr].s = {};
                 ws[addr].s.alignment = { vertical: 'center', horizontal: 'center', wrapText: false };
              }
           }
           XLSX.utils.book_append_sheet(wb, ws, 'Report');
        }

        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const fileName = `${template.name.replace(/\s+/g, '_')}.xlsx`;
        if (!isSingle) zip.file(fileName, excelBuffer);
        else saveAs(new Blob([excelBuffer], { type: 'application/octet-stream' }), fileName);
      }
      
      if (!isSingle) saveAs(await zip.generateAsync({ type: 'blob' }), `Synergy_Reports_${Date.now()}.zip`);
      setStatus('Completed!');
      setTimeout(() => setStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setError('Generation failed.');
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
          {/* 1. Upload Section (Expert Design) */}
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
               onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleFileChange({ target: { files: [file] } }); }}
               style={{ padding: masterFile ? '40px' : '60px', border: '2px dashed var(--border)', borderRadius: '24px', textAlign: 'center', cursor: 'pointer', transition: '0.3s' }}
             >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept=".xlsx, .xls, .csv" />
                {masterFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', textAlign: 'left' }}>
                    <div className="login-logo-icon" style={{ width: '56px', height: '56px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}><FileSpreadsheet size={28} /></div>
                    <div style={{ flex: 1 }}><p style={{ fontWeight: '600', fontSize: '16px' }}>{masterFile.name}</p><p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Ready to process</p></div>
                    <CheckCircle2 color="var(--success)" size={24} />
                  </div>
                ) : (
                  <>
                    <div className="upload-icon"><Upload size={32} /></div>
                    <p style={{ fontWeight: '600', fontSize: '16px' }}>Click or drag Excel/CSV file here</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>Security Note: Your data never leaves your browser.</p>
                  </>
                )}
             </div>
             {error && <div className="alert-error" style={{ marginTop: '20px' }}>{error}</div>}
          </div>

          {/* 2. Template Selection Section (Expert Design) */}
          <div className="glass" style={{ padding: '32px' }}>
             <h3 style={{ fontSize: '18px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
               <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>2</span>
               Select Output Templates
             </h3>
             
             {/* Search box (Expert Design) */}
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: 'var(--glass-subtle)', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                <Search size={16} color="var(--text-muted)" />
                <input type="text" placeholder="Search templates..." value={templateSearchTerm} onChange={e => setTemplateSearchTerm(e.target.value)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '14px', flex: 1, outline: 'none' }} />
             </div>

             {/* Select All (Expert Design) */}
             <div onClick={handleSelectAll} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', marginBottom: '12px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: (selectedTemplates.length === filteredTemplates.length && filteredTemplates.length > 0) ? 'var(--primary)' : 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                    {(selectedTemplates.length === filteredTemplates.length && filteredTemplates.length > 0) && <CheckCircle2 size={16} color="white" />}
                </div>
                <span style={{ fontSize: '14px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select All Templates</span>
                <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', background: 'var(--glass-bg)', padding: '2px 8px', borderRadius: '10px' }}>{selectedTemplates.length} / {filteredTemplates.length} Selected</div>
             </div>

             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
               {filteredTemplates.map(template => (
                 <div 
                   key={template.id} 
                   onClick={() => toggleTemplateSelection(template.id)}
                   style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '16px', background: selectedTemplates.includes(template.id) ? 'rgba(99, 102, 241, 0.1)' : 'var(--glass-subtle)', border: '1px solid', borderColor: selectedTemplates.includes(template.id) ? 'var(--primary)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}
                 >
                    <div style={{ width: '20px', height: '20px', borderRadius: '6px', border: '2px solid', borderColor: selectedTemplates.includes(template.id) ? 'var(--primary)' : 'var(--border)', background: selectedTemplates.includes(template.id) ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                      {selectedTemplates.includes(template.id) && <CheckCircle2 size={14} />}
                    </div>
                    <div style={{ flex: 1 }}>
                       <p style={{ fontWeight: '600' }}>{template.name}</p>
                       <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                         {template.type === 'pivot' 
                           ? `${(template.pivotColumns?.length || template.valueFields?.length || 0)} Pivot Columns` 
                           : `${(template.mappings?.length || 0)} Column Mappings`
                         }
                       </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {masterFile && (
                        <button className="btn-link" onClick={(e) => { e.stopPropagation(); processFile(template.id); }} disabled={isGenerating} style={{ color: 'var(--primary)', padding: '8px' }}><Download size={18} /></button>
                      )}
                      <ArrowRight size={16} color="var(--text-muted)" />
                    </div>
                 </div>
               ))}
             </div>
          </div>
        </div>

        {/* Action Sidebar (Expert Design) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
           <div className="glass" style={{ padding: '32px', textAlign: 'center' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 8px 16px rgba(99, 102, 241, 0.2)' }}><FileArchive size={40} /></div>
              <h4 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Execution Hub</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '32px' }}>Ready to generate {selectedTemplates.length} reports in a single ZIP file.</p>
              <button 
                className="btn-primary btn-full" 
                disabled={!masterFile || selectedTemplates.length === 0 || isGenerating} 
                onClick={() => processFile(null)} 
                style={{ height: '56px', fontSize: '16px' }}
              >
                {isGenerating ? <><Loader2 className="spinner" size={20} /> Processing...</> : <><Download size={20} /> Generate & Save ZIP</>}
              </button>
              {status && <p style={{ marginTop: '16px', fontSize: '14px', color: 'var(--primary)', fontWeight: '500' }}>{status}</p>}
           </div>

           <div className="glass" style={{ padding: '24px' }}>
              <h5 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={16} color="var(--warning)" /> Security Standards</h5>
              <ul style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '16px' }}>
                 <li>Data stays 100% local in your browser.</li>
                 <li>Encryption-in-transit for Firestore templates.</li>
                 <li>Zero server-side data persistence.</li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  );
}
