import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, getDocs } from 'firebase/firestore';
import XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import { Chart, registerables } from 'chart.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

Chart.register(...registerables);
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

      // --- ROBUST MASTER DATA PARSING ---
      // We let XLSX find the headers automatically (handles titles/empty rows better)
      const masterData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

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
      const templateErrors = [];

      // --- SHARED HELPER FUNCTIONS ---
      const parseSafeNum = (val) => {
         if (val === null || val === undefined || val === '') return 0;
         if (typeof val === 'number') return val;
         const cleaned = String(val).replace(/[^0-9.-]/g, '');
         const num = parseFloat(cleaned);
         return isNaN(num) ? 0 : num;
      };

      const getMasterValue = (row, source) => {
        if (!source || !row) return '';
        if (row[source] !== undefined && row[source] !== null) return row[source];
        
        // Super Aggressive Normalization (Trims, No Quotes, No Special Chars, Lowercase)
        const normalize = (str) => String(str || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const cleanSource = normalize(source);
        const matchingKey = Object.keys(row).find(k => normalize(k) === cleanSource);
        
        return matchingKey ? row[matchingKey] : '';
      };

      // --- PRE-PASS FOR DATE NORMALIZATION ---
      const minDateMap = {};
      const maxDateMap = {};
      const dateColumns = new Set();
      targetTemplates.forEach(t => {
         // Pivot Column settings
         if (t.pivotColumns) t.pivotColumns.forEach(c => { if (c.normalizeWeek) dateColumns.add(c.source); });
         // Pivot Global settings
         if (t.rowFieldTransforms?.normalizeWeek) dateColumns.add(t.rowField);
         if (t.colFieldTransforms?.normalizeWeek) dateColumns.add(t.colField);
         // Visual Mapper settings
         if (t.mappings) t.mappings.forEach(m => { if (m.normalizeWeek) dateColumns.add(m.source); });
      });

      if (dateColumns.size > 0) {
         dateColumns.forEach(col => {
            let min = Infinity;
            let max = -Infinity;
            masterData.forEach(row => {
               const raw = getMasterValue(row, col);
               if (raw === undefined || raw === null || raw === '') return;
               let parsed = NaN;
               if (typeof raw === 'number') {
                  // Excel serial date detection (30000 to 60000 covers 1982 to 2064)
                  if (raw > 30000 && raw < 60000) parsed = (raw - 25569) * 86400 * 1000;
                  else parsed = NaN;
               } else {
                  let cleaned = String(raw).trim();
                  const longMatch = cleaned.match(/.*,\s+(.*?)\s+,\s+.*/);
                  if (longMatch) cleaned = longMatch[1];
                  parsed = Date.parse(cleaned);

                  // Fallback for manual parsing in pre-pass
                  if (isNaN(parsed)) {
                     const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
                     // Strategy 1: "Month DD - YYYY" or "Month DD, YYYY"
                     const mdy = cleaned.match(/([a-z]+)\s+(\d{1,2})\s*[-,]?\s*(\d{4})/i);
                     if (mdy) {
                        const mIdx = months.indexOf(mdy[1].toLowerCase().slice(0, 3));
                        if (mIdx >= 0) parsed = new Date(parseInt(mdy[3]), mIdx, parseInt(mdy[2])).getTime();
                     }
                     // Strategy 2: "DD Month YYYY"
                     if (isNaN(parsed)) {
                        const dmy = cleaned.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
                        if (dmy) {
                           const mIdx = months.indexOf(dmy[2].toLowerCase().slice(0, 3));
                           if (mIdx >= 0) parsed = new Date(parseInt(dmy[3]), mIdx, parseInt(dmy[1])).getTime();
                        }
                     }
                     // Strategy 3: extract month/year and try to find a day number
                     if (isNaN(parsed)) {
                        const foundMonth = months.find(m => cleaned.toLowerCase().includes(m));
                        if (foundMonth) {
                           const yearMatch = cleaned.match(/\d{4}/);
                           const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
                           const noYear = cleaned.replace(/\d{4}/, '');
                           const noMonth = noYear.replace(new RegExp(foundMonth, 'i'), '');
                           const dayMatch = noMonth.match(/\b(\d{1,2})\b/);
                           const day = dayMatch ? parseInt(dayMatch[1]) : 1;
                           parsed = new Date(year, months.indexOf(foundMonth), day).getTime();
                        }
                     }
                  }
               }
               if (!isNaN(parsed)) {
                  if (parsed < min) min = parsed;
                  if (parsed > max) max = parsed;
               }
            });
             if (min !== Infinity) {
               // Snap to local midnight to eliminate timezone-offset interference
               const minLocal = new Date(min);
               minLocal.setHours(0, 0, 0, 0);
               minDateMap[col] = minLocal.getTime();
             }
             if (max !== -Infinity) {
               const maxLocal = new Date(max);
               maxLocal.setHours(0, 0, 0, 0);
               maxDateMap[col] = maxLocal.getTime();
             }
         });
      }
      
      // --- SCOREBOARD GENERATION FUNCTION ---
      const generateScoreboardReport = async (template) => {
        const MONTHS_SB = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

        // Local-date formatter: avoids timezone offset shifting the date
        const toLocalISO = (dateObj) => {
          if (!dateObj || isNaN(dateObj.getTime())) return null;
          const y = dateObj.getFullYear();
          const m = String(dateObj.getMonth() + 1).padStart(2, '0');
          const d = String(dateObj.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        };

        const parseSbDate = (val) => {
          if (!val && val !== 0) return null;
          if (typeof val === 'number') {
            if (val > 20000 && val < 100000) {
              // Excel serial: add 0.5 day to avoid midnight-UTC timezone edge
              const d = new Date(Math.round((val - 25569) * 86400 * 1000));
              return toLocalISO(d);
            }
            return null;
          }
          let s = String(val).trim();
          const longMatch = s.match(/.*,\s+(.*?)\s+,\s+.*/);
          if (longMatch) s = longMatch[1];
          // DD.MM.YYYY or DD/MM/YYYY
          const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
          if (dmy) return toLocalISO(new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1])));
          // MM/DD/YYYY or generic new Date
          let d = new Date(s);
          if (!isNaN(d.getTime())) return toLocalISO(d);
          const foundM = MONTHS_SB.find(m => s.toLowerCase().includes(m));
          if (foundM) {
            const yr = s.match(/\d{4}/);
            const dy = s.match(/\d{1,2}/);
            if (yr && dy) return toLocalISO(new Date(parseInt(yr[0]), MONTHS_SB.indexOf(foundM), parseInt(dy[0])));
          }
          return null;
        };

        // Apply global filters (same logic as pivot engine)
        const sbEvalRule = (targetVal, operator, conditionVals = []) => {
          const tv = String(targetVal ?? '').toLowerCase().trim();
          const evalSingle = (cv) => {
            const c = String(cv ?? '').toLowerCase().trim();
            if (operator === '==') return tv === c;
            if (operator === '!=') return tv !== c;
            if (operator === 'contains') return tv.includes(c);
            if (operator === 'between') {
              const num = parseFloat(tv);
              return !isNaN(num) && num >= parseFloat(conditionVals[0] || '-Infinity') && num <= parseFloat(conditionVals[1] || 'Infinity');
            }
            return false;
          };
          if (operator === 'between') return evalSingle(null);
          if (conditionVals.length === 0) return true;
          if (operator === '!=') return conditionVals.every(c => evalSingle(c));
          return conditionVals.some(c => evalSingle(c));
        };

        let sbMasterData = [...masterData];
        if (template.isGlobalFilterEnabled !== false && template.globalFilters?.length > 0) {
          template.globalFilters.forEach(gf => {
            if (!gf.conditionCol) return;
            sbMasterData = sbMasterData.filter(row =>
              sbEvalRule(getMasterValue(row, gf.conditionCol), gf.operator, gf.conditionVals || [])
            );
          });
        }

        // Collect all distinct dates (last = "current" / target date)
        const dateCol = template.dateColumn;
        const allDatesSet = new Set();
        sbMasterData.forEach(r => {
          const d = parseSbDate(getMasterValue(r, dateCol));
          if (d) allDatesSet.add(d);
        });
        const allDates = [...allDatesSet].sort();
        if (allDates.length === 0) throw new Error(`Scoreboard: No dates found in column "${dateCol}". Check Date Column config.`);

        const targetDate = allDates[allDates.length - 1]; // last date in master = "today"
        const dayN = allDates.length;

        // Collect unique doctors (in order of first appearance)
        const nameCol = template.nameColumn;
        const doctorsOrdered = [];
        const docSeen = new Set();
        sbMasterData.forEach(r => {
          const name = String(getMasterValue(r, nameCol) || '').trim();
          if (name && !docSeen.has(name)) { doctorsOrdered.push(name); docSeen.add(name); }
        });
        if (doctorsOrdered.length === 0) throw new Error(`Scoreboard: No names found in column "${nameCol}". Check Name Column config.`);

        const groups = template.groups || [];
        const aptNoCol = template.aptNoColumn;
        const appNoCol = template.appNoColumn;

        // COMPUTE SCORE ROW DATA
        const scoreRows = doctorsOrdered.map(doctor => {
          const docRows = sbMasterData.filter(r => String(getMasterValue(r, nameCol) || '').trim() === doctor);

          const groupData = groups.map(group => {
            let gRows = docRows;
            if (group.filterColumn && (group.filterValues?.length > 0 || group.filterValue)) {
              const fvs = group.filterValues?.length > 0
                ? group.filterValues.map(v => v.toLowerCase().trim())
                : [String(group.filterValue || '').toLowerCase().trim()];
              gRows = docRows.filter(r => {
                const val = String(getMasterValue(r, group.filterColumn) || '').toLowerCase().trim();
                return fvs.some(fv => val === fv || val.includes(fv));
              });
            }

            const colData = (group.columns || []).map(col => {
              let cRows = gRows;
              if (col.filterColumn && (col.filterValues?.length > 0 || col.filterValue)) {
                const cfvs = col.filterValues?.length > 0
                  ? col.filterValues.map(v => v.toLowerCase().trim())
                  : [String(col.filterValue || '').toLowerCase().trim()];
                cRows = gRows.filter(r => {
                  const val = String(getMasterValue(r, col.filterColumn) || '').toLowerCase().trim();
                  return cfvs.some(fv => val === fv || val.includes(fv));
                });
              }

              const total = cRows.length;
              const cur = cRows.filter(r => parseSbDate(getMasterValue(r, dateCol)) === targetDate).length;

              if (col.displayMode === 'triple') {
                const noConv = cRows.filter(r => {
                  const apt = parseSafeNum(getMasterValue(r, aptNoCol));
                  const app = parseSafeNum(getMasterValue(r, appNoCol));
                  return apt === 1 && app === 1;
                }).length;
                return { mode: 'triple', cur, total, conv: total - noConv, isConsultation: !!col.isConsultationColumn };
              } else if (col.displayMode === 'cumulative') {
                return { mode: 'cumulative', cur, total, isConsultation: !!col.isConsultationColumn };
              }
              return { mode: 'single', cur, isConsultation: !!col.isConsultationColumn };
            });

            return { groupId: group.id, colData };
          });

          // Branch identification
          const docBranchName = docRows.length > 0 ? String(getMasterValue(docRows[0], template.branchColumn) || '').trim() : '';
          const branchCfg = (template.branches || []).find(b =>
            b.nameContains && docBranchName.toLowerCase().includes(b.nameContains.toLowerCase())
          );
          const branchTarget = branchCfg?.target || 0;

          // Per-doctor branch Cur = sum of isConsultation flagged cols for today
          let docBranchCur = 0;
          groupData.forEach(gd => gd.colData.forEach(cd => { if (cd.isConsultation) docBranchCur += cd.cur; }));

          // Branch Actual = target * daysElapsed / daysInPeriod
          let branchActual = 0;
          if (branchTarget > 0 && targetDate) {
            const [tY, tMo, tD] = targetDate.split('-').map(Number);
            const msd = parseInt(template.monthStartDay) || 26;
            const periodStart = tD >= msd ? new Date(tY, tMo - 1, msd) : new Date(tY, tMo - 2, msd);
            const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, msd - 1);
            const daysInPeriod = Math.max(1, Math.round((periodEnd - periodStart) / 864e5) + 1);
            const tdObj = new Date(tY, tMo - 1, tD);
            const daysElapsed = Math.max(1, Math.round((tdObj - periodStart) / 864e5) + 1);
            branchActual = Math.round(branchTarget * daysElapsed / daysInPeriod);
          }

          return { doctor, docBranchName, groupData, docBranchCur, branchActual, branchTarget };
        });

        // BUILD EXCEL with ExcelJS
        const sbWb = new ExcelJS.Workbook();
        const ws = sbWb.addWorksheet('Score Board');

        let subColCount = 0;
        groups.forEach(g => subColCount += (g.columns?.length || 0));
        const totalCols = 2 + subColCount + 1; // S.No + Name + subCols + Branch

        const applyStyle = (cell, s) => {
          if (s.font) cell.font = s.font;
          if (s.alignment) cell.alignment = s.alignment;
          if (s.fill) cell.fill = s.fill;
          if (s.border) cell.border = s.border;
        };
        const thinBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        const medBorder  = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };

        const titleStyle    = { font: { bold: true, size: 13 }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F0E8' } }, border: thinBorder };
        const subtitleStyle = { font: { bold: true, size: 11 }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAEBD7' } }, border: thinBorder };
        const groupHdrStyle = { font: { bold: true, size: 10, color: { argb: 'FF1A1A1A' } }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5DEB3' } }, border: medBorder };
        const subHdrStyle   = { font: { bold: true, size: 9 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } }, border: thinBorder };
        const cellStyle     = { font: { size: 9 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: thinBorder };
        const totalStyle    = { font: { bold: true, size: 9 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD7E8FA' } }, border: thinBorder };
        const nameStyle     = { font: { bold: true, size: 9 }, alignment: { horizontal: 'left', vertical: 'middle' }, border: thinBorder };
        const branchMergStyle = { font: { bold: true, size: 9 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }, border: medBorder };

        // fmtDate: parse YYYY-MM-DD as local components to avoid UTC-timezone day shift
        const fmtDate = (ds) => {
          if (!ds) return '';
          const [y, m, d] = ds.split('-').map(Number);
          return `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`;
        };

        const fmtCell = (cd) => {
          if (!cd) return '0';
          if (cd.mode === 'triple') return `(${cd.cur})(${cd.total})(${cd.conv})`;
          if (cd.mode === 'cumulative') return `${cd.cur}(${cd.total})`;
          return String(cd.cur);
        };

        // ROW 1: Title
        const readMasterCell = (cellRef) => {
          if (!cellRef) return '';
          try {
            const cell = worksheet[String(cellRef).toUpperCase().trim()];
            return cell ? String(cell.v || '').trim() : '';
          } catch { return ''; }
        };

        const resolvedTitle = template.reportTitleSource === 'cell'
          ? (readMasterCell(template.reportTitleCell) || template.reportTitle || 'Score Board')
          : (template.reportTitle || 'Score Board');

        const resolvedSubtitle = template.reportSubtitleSource === 'cell'
          ? (readMasterCell(template.reportSubtitleCell) || template.reportSubtitle || 'SCORE BOARD')
          : (template.reportSubtitle || 'SCORE BOARD');

        ws.addRow([resolvedTitle]);
        ws.mergeCells(1, 1, 1, totalCols);
        applyStyle(ws.getRow(1).getCell(1), titleStyle);
        ws.getRow(1).height = 28;

        // ROW 2: Subtitle with last master date
        ws.addRow([`${resolvedSubtitle} - Date: ${fmtDate(targetDate)} / Day ${dayN}`]);
        ws.mergeCells(2, 1, 2, totalCols);
        applyStyle(ws.getRow(2).getCell(1), subtitleStyle);
        ws.getRow(2).height = 22;

        // ROW 3: Group headers
        const r3Values = [null, null];
        groups.forEach(g => {
          r3Values.push(g.name);
          for (let i = 1; i < (g.columns?.length || 0); i++) r3Values.push(null);
        });
        r3Values.push('Branch\n(Cur/Actual/Target)');
        ws.addRow(r3Values);
        ws.getRow(3).height = 30;

        // ROW 4: Sub-column headers
        const r4Values = ['S.No', 'Name'];
        groups.forEach(g => (g.columns || []).forEach(c => r4Values.push(c.name)));
        r4Values.push('');
        ws.addRow(r4Values);
        ws.getRow(4).height = 36;

        // Merges for rows 3-4
        ws.mergeCells(3, 1, 4, 1);
        ws.mergeCells(3, 2, 4, 2);
        ws.mergeCells(3, totalCols, 4, totalCols);
        let colCursor = 3;
        groups.forEach(g => {
          const n = g.columns?.length || 0;
          if (n > 1) ws.mergeCells(3, colCursor, 3, colCursor + n - 1);
          colCursor += n;
        });

        // Apply header styles
        applyStyle(ws.getRow(3).getCell(1), groupHdrStyle);
        applyStyle(ws.getRow(3).getCell(2), groupHdrStyle);
        applyStyle(ws.getRow(3).getCell(totalCols), groupHdrStyle);
        applyStyle(ws.getRow(4).getCell(1), subHdrStyle);
        applyStyle(ws.getRow(4).getCell(2), subHdrStyle);
        applyStyle(ws.getRow(4).getCell(totalCols), subHdrStyle);

        colCursor = 3;
        groups.forEach(g => {
          applyStyle(ws.getRow(3).getCell(colCursor), groupHdrStyle);
          (g.columns || []).forEach((_, ci) => {
            applyStyle(ws.getRow(4).getCell(colCursor + ci), subHdrStyle);
          });
          colCursor += (g.columns?.length || 0);
        });

        // DATA ROWS — group doctors by branch for vertical merging
        const branchGroups = [];
        scoreRows.forEach(sr => {
          const last = branchGroups[branchGroups.length - 1];
          if (last && last.branchName === sr.docBranchName) {
            last.doctors.push(sr);
          } else {
            branchGroups.push({ branchName: sr.docBranchName, doctors: [sr] });
          }
        });

        let excelRowIdx = 5; // data starts at row 5
        let sNo = 1;

        branchGroups.forEach(bg => {
          const branchStartRow = excelRowIdx;

          // Aggregate branch Cur = sum of docBranchCur across all doctors in this branch
          const branchCur = bg.doctors.reduce((a, sr) => a + (sr.docBranchCur || 0), 0);
          // Use first doctor's actual/target (they share the same branch config)
          const branchActual = bg.doctors[0]?.branchActual || 0;
          const branchTarget = bg.doctors[0]?.branchTarget || 0;
          const branchLabel = bg.branchName || '—';

          bg.doctors.forEach(sr => {
            const rowVals = [sNo++, sr.doctor];
            sr.groupData.forEach(gd => gd.colData.forEach(cd => rowVals.push(fmtCell(cd))));
            rowVals.push(''); // placeholder for merged branch cell
            const dataRow = ws.addRow(rowVals);
            dataRow.height = 18;
            dataRow.eachCell((cell, colNum) => {
              if (colNum === 2) applyStyle(cell, nameStyle);
              else if (colNum !== totalCols) applyStyle(cell, cellStyle);
            });
            excelRowIdx++;
          });

          // Write branch value into the first row of this group's branch cell
          const branchCell = ws.getRow(branchStartRow).getCell(totalCols);
          branchCell.value = `${branchLabel}\n(${branchCur})(${branchActual})(${branchTarget})`;
          applyStyle(branchCell, branchMergStyle);

          // Merge branch column vertically if multiple doctors in branch
          if (bg.doctors.length > 1) {
            ws.mergeCells(branchStartRow, totalCols, excelRowIdx - 1, totalCols);
          }
        });

        // TOTALS ROW
        const totalVals = ['', 'Total'];
        let totalsBranchCur = 0, totalsBranchTotal = 0, totalsBranchConv = 0;

        groups.forEach((g, gi) => {
          (g.columns || []).forEach((col, ci) => {
            let sumCur = 0, sumTotal = 0, sumConv = 0;
            scoreRows.forEach(sr => {
              const cd = sr.groupData[gi]?.colData[ci];
              if (cd) {
                sumCur += cd.cur || 0;
                sumTotal += cd.total || 0;
                sumConv += cd.conv || 0;
                // Accumulate consultation cols for branch totals
                if (cd.isConsultation) {
                  totalsBranchCur += cd.cur || 0;
                  totalsBranchTotal += cd.total || 0;
                  totalsBranchConv += cd.conv || 0;
                }
              }
            });
            if (col.displayMode === 'triple') totalVals.push(`(${sumCur})(${sumTotal})(${sumConv})`);
            else if (col.displayMode === 'cumulative') totalVals.push(`${sumCur}(${sumTotal})`);
            else totalVals.push(String(sumCur));
          });
        });

        // Branch totals: (sumConsultCur)(sumConsultTotal)(sumConsultConv)
        totalVals.push(`(${totalsBranchCur})(${totalsBranchTotal})(${totalsBranchConv})`);

        const totRow = ws.addRow(totalVals);
        totRow.height = 22;
        totRow.eachCell(cell => applyStyle(cell, totalStyle));

        // Column widths
        ws.getColumn(1).width = 6;
        ws.getColumn(2).width = 22;
        for (let i = 3; i <= totalCols - 1; i++) ws.getColumn(i).width = 13;
        ws.getColumn(totalCols).width = 20;

        const buffer = await sbWb.xlsx.writeBuffer();
        return buffer;
      };

      for (const template of targetTemplates) {
       try {
        setStatus(`Generating ${template.name || 'Untitled'}...`);

        // --- DISPATCH SCOREBOARD TEMPLATES ---
        if (template.type === 'scoreboard') {
          try {
            const sbBuffer = await generateScoreboardReport(template);
            if (sbBuffer) {
              const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
              const sbFileName = `${(template.name || 'ScoreBoard').replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.xlsx`;
              if (isSingle) {
                saveAs(new Blob([sbBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), sbFileName);
              } else {
                zip.file(sbFileName, sbBuffer);
              }
            }
          } catch (sbErr) {
            console.error('Scoreboard error:', sbErr);
            setError(`Score Board "${template.name}" failed: ${sbErr.message}`);
          }
          continue; // Skip standard template processing
        }

        // --- TEMPLATE-SPECIFIC HELPERS ---

         const cleanValue = (val, config, colName) => {
           if (val === undefined || val === null || val === '') return '';
           if (!config) return String(val).trim();
           let cleaned = String(val);

           // Robust Date Parsing for normalization
           let dateObj = null;
           const tryParse = (rawVal) => {
              if (rawVal === undefined || rawVal === null || rawVal === '') return null;
              if (typeof rawVal === 'number') {
                 // Standard Excel Date range
                 if (rawVal > 30000 && rawVal < 60000) return new Date((rawVal - 25569) * 86400 * 1000);
                 return null;
              }
              let s = String(rawVal).trim();
              
              // Handle "Friday, Feb 27 - 2026 , 9:30 AM" format (allow variable whitespace)
              const longMatch = s.match(/.*,\s+(.*?)\s+,\s+.*/);
              if (longMatch) s = longMatch[1];
              
              const d = new Date(s);
              if (!isNaN(d.getTime())) return d;

              // Fallback: try manual month extraction if Date.parse fails
              const monthsF = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
              // Strategy 1: "Month DD - YYYY" or "Month DD, YYYY"
              const mdy = s.match(/([a-z]+)\s+(\d{1,2})\s*[-,]?\s*(\d{4})/i);
              if (mdy) {
                 const mIdx = monthsF.indexOf(mdy[1].toLowerCase().slice(0, 3));
                 if (mIdx >= 0) return new Date(parseInt(mdy[3]), mIdx, parseInt(mdy[2]));
              }
              // Strategy 2: "DD Month YYYY"
              const dmy = s.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
              if (dmy) {
                 const mIdx = monthsF.indexOf(dmy[2].toLowerCase().slice(0, 3));
                 if (mIdx >= 0) return new Date(parseInt(dmy[3]), mIdx, parseInt(dmy[1]));
              }
              // Strategy 3: extract month/year and find a day
              const foundMonth = monthsF.find(m => s.toLowerCase().includes(m));
              if (foundMonth) {
                 const yearMatch = s.match(/\d{4}/);
                 const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
                 const noYear = s.replace(/\d{4}/, '');
                 const noMonth = noYear.replace(new RegExp(foundMonth, 'i'), '');
                 const dayMatch = noMonth.match(/\b(\d{1,2})\b/);
                 const day = dayMatch ? parseInt(dayMatch[1]) : 1;
                 return new Date(year, monthsF.indexOf(foundMonth), day);
              }
              return null;
           };

           if (config.normalizeMonth || config.normalizeWeek) {
              dateObj = tryParse(val);
           }

           if (config.simplifyDate) {
             const match = cleaned.match(/.*,\s+(.*?)\s+,\s+.*/);
             if (match) cleaned = match[1];
           }

           if (config.simplifyTime) {
             const match = cleaned.match(/.*,\s+.*?\s+,\s+(.*)/);
             if (match) cleaned = match[1];
           }

           if (config.normalizeMonth && dateObj) {
              cleaned = dateObj.toLocaleString('default', { month: 'short' });
           }

           if (config.normalizeWeek && dateObj && colName && minDateMap[colName]) {
              // Normalize dateObj to local midnight to match the midnight-snapped minDateMap
              const dayLocal = new Date(dateObj);
              dayLocal.setHours(0, 0, 0, 0);
              const diff = dayLocal.getTime() - minDateMap[colName];
              const weekNum = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
              const weekStart = new Date(minDateMap[colName] + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
              let weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
              
              // Cap weekEnd to the actual last date in the master Excel
              if (maxDateMap[colName] && weekEnd.getTime() > maxDateMap[colName]) {
                 weekEnd = new Date(maxDateMap[colName]);
              }

              const fmt = (d) => d.toLocaleString('default', { month: 'short', day: 'numeric' });
              cleaned = `Week ${weekNum} (${fmt(weekStart)} to ${fmt(weekEnd)})`;
           }

           if (config.findText) {
             try {
               cleaned = cleaned.replace(new RegExp(config.findText, 'gi'), config.replaceWith || '');
             } catch (e) {
               console.error("Cleaning Regex Error:", e);
             }
           }

           return cleaned.trim();
         };

         const generateChartImage = async (chartConfig, pivotResults) => {
           if (!chartConfig || !pivotResults || pivotResults.length === 0 || !chartConfig.xAxis) return null;
           
           const canvas = document.createElement('canvas');
           canvas.width = 1200;
           canvas.height = 700;
           const ctx = canvas.getContext('2d');
           
           const firstResult = pivotResults[0].data;
           const allKeys = Object.keys(firstResult);
           
           const resolveMetrics = (requestedMet) => {
              const matches = allKeys.filter(k => k === requestedMet || k.endsWith(' - ' + requestedMet) || k.endsWith('-' + requestedMet));
              return matches.length > 0 ? matches : [requestedMet];
           };

           const targetColumns = (chartConfig.yAxes || []).flatMap(m => resolveMetrics(m));
           const labels = pivotResults.map(r => String(r.data[chartConfig.xAxis] || ''));
           
           const colors = [
              'rgba(99, 102, 241, 0.7)', 'rgba(16, 185, 129, 0.7)', 'rgba(245, 158, 11, 0.7)',
              'rgba(236, 72, 153, 0.7)', 'rgba(14, 165, 233, 0.7)', 'rgba(139, 92, 246, 0.7)',
              'rgba(244, 63, 94, 0.7)', 'rgba(20, 184, 166, 0.7)'
           ];

           const datasets = targetColumns.map((colName, idx) => ({
             label: colName,
             data: pivotResults.map(r => parseSafeNum(r.data[colName])),
             backgroundColor: colors[idx % colors.length],
             borderColor: colors[idx % colors.length].replace('0.7', '1'),
             borderWidth: 1
           }));

           return new Promise((resolve) => {
             new Chart(ctx, {
               type: chartConfig.type || 'bar',
               data: { labels, datasets },
               options: {
                 responsive: false,
                 animation: false,
                 layout: { padding: { top: 40, bottom: 20, left: 20, right: 20 } },
                 plugins: {
                   legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                   title: { display: true, text: `Pivot Analytics Summary`, font: { size: 18, weight: 'bold' }, padding: 20 }
                 },
                 scales: chartConfig.type !== 'pie' ? {
                   y: { 
                      beginAtZero: true,
                      grid: { color: 'rgba(0,0,0,0.05)' },
                      ticks: { font: { size: 10 } }
                   },
                   x: { 
                      grid: { display: false },
                      ticks: { font: { size: 10 } }
                   }
                 } : {}
               },
               plugins: [{
                 id: 'backgroundAndLabels',
                 beforeDraw: (chart) => {
                   const { ctx } = chart;
                   ctx.save();
                   ctx.fillStyle = 'white';
                   ctx.fillRect(0, 0, chart.width, chart.height);
                   ctx.restore();
                 },
                 afterDatasetsDraw: (chart) => {
                   if (chartConfig.type === 'pie') return;
                   const { ctx } = chart;
                   ctx.save();
                   ctx.textAlign = 'center';
                   ctx.textBaseline = 'bottom';
                   ctx.font = 'bold 11px sans-serif';
                   
                   chart.data.datasets.forEach((dataset, i) => {
                     const meta = chart.getDatasetMeta(i);
                     meta.data.forEach((element, index) => {
                       const data = dataset.data[index];
                       if (data === 0 || data === null || data === undefined) return;
                       
                       const displayVal = typeof data === 'number' ? data.toLocaleString() : data;
                       
                       ctx.fillStyle = 'rgba(255,255,255,0.8)';
                       ctx.fillText(displayVal, element.x, element.y - 4);
                       
                       ctx.fillStyle = '#1e293b';
                       ctx.fillText(displayVal, element.x, element.y - 5);
                     });
                   });
                   ctx.restore();
                 }
               }]
             });
             
             setTimeout(() => {
               resolve(canvas.toDataURL('image/png'));
             }, 200);
           });
         };

         const excelJSExport = async (finalAOA, columnHeaders, topReportHeader, chartImage) => {
           const workbook = new ExcelJS.Workbook();
           const worksheet = workbook.addWorksheet('Report');

           let currentRow = 1;
           if (topReportHeader) {
             worksheet.mergeCells(1, 1, 1, columnHeaders.length);
             const titleCell = worksheet.getCell(1, 1);
             titleCell.value = topReportHeader;
             titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E293B' } };
             titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
             currentRow = 2;
           }

           const headerRow = worksheet.getRow(currentRow);
           headerRow.values = columnHeaders;
           headerRow.font = { bold: true, color: { argb: 'FF1E293B' } };
           headerRow.height = 20;
           headerRow.eachCell((cell) => {
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
             cell.alignment = { horizontal: 'center', vertical: 'middle' };
             cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
           });
           currentRow++;

           finalAOA.slice(topReportHeader ? 2 : 1).forEach((row) => {
             const dataRow = worksheet.getRow(currentRow);
             dataRow.values = row.map(v => (v && typeof v === 'object' && v.v !== undefined) ? v.v : v);
             dataRow.eachCell((cell) => {
               cell.alignment = { horizontal: 'center', vertical: 'middle' };
               cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
               if (cell.value === 'GRAND TOTAL') cell.font = { bold: true };
             });
             currentRow++;
           });

           worksheet.columns.forEach(col => {
             col.width = 25;
           });

           if (chartImage) {
             const imageId = workbook.addImage({
               base64: chartImage,
               extension: 'png',
             });
             worksheet.addImage(imageId, {
               tl: { col: 0, row: currentRow + 1 },
               ext: { width: 900, height: 450 }
             });
           }

           return await workbook.xlsx.writeBuffer();
         };

        // --- PER-TEMPLATE STATE (must be reset for each template) ---
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
        let currentChartImage = null;
        let hasMappingTargets = (template.mappings || []).some(m => m.target) || !!template.isHighlightEmptyEnabled;

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
        
        // hasMappingTargets is now declared above per-template

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
          
          // --- PRIMARY GROUP (HIERARCHICAL MERGED) ---
          const primaryGroupField = template.primaryGroupField || '';
          const isPrimaryGrouped = !!primaryGroupField && primaryGroupField !== activeRowField;
          
          if (!activeRowField) {
            console.warn("Pivot template missing rowField/groupingCol", template.name);
          } else {
            const pivotMap = {}; 
            const aggCols = pivotCols.filter(c => c.type === 'aggregation');
            const colField = template.colField;

            // --- CROSS-TAB DATA PREP ---
            let uniqueColVals = [];
            if (colField) {
               uniqueColVals = [...new Set(filteredMasterData.map(r => {
                  let val = getMasterValue(r, colField);
                  val = cleanValue(val, template.colFieldTransforms, colField);
                  return val !== undefined && val !== null && val !== '' ? String(val) : '(Blank)';
               }))].sort();
            }

             filteredMasterData.forEach(row => {
                const rawRowVal = getMasterValue(row, activeRowField);
                let rowVal = cleanValue(rawRowVal, template.rowFieldTransforms, activeRowField);
                if (rowVal === '') rowVal = '(Blank)';
                
                // Compound key for hierarchical grouping
                let primaryVal = '';
                let mapKey = rowVal;
                if (isPrimaryGrouped) {
                   const rawPrimary = getMasterValue(row, primaryGroupField);
                   primaryVal = String(rawPrimary ?? '').trim() || '(Blank)';
                   mapKey = primaryVal + '|||' + rowVal;
                }
                
                if (!pivotMap[mapKey]) {
                   pivotMap[mapKey] = { firstRow: row, colGroups: {}, _primary: primaryVal, _secondary: rowVal };
                }

                const rawColVal = colField ? getMasterValue(row, colField) : '_default';
                let colVal = colField ? cleanValue(rawColVal, template.colFieldTransforms, colField) : '_default';
                if (colField && colVal === '') colVal = '(Blank)';

                if (!pivotMap[mapKey].colGroups[colVal]) {
                   pivotMap[mapKey].colGroups[colVal] = { rows: [], aggregations: {} };
                }
                pivotMap[mapKey].colGroups[colVal].rows.push(row);
             });

            // 1. Inject Top Report Header (Title) if resolved at top of loop
            if (topReportHeader) finalAOA.push([topReportHeader]);

             // 2. Headers assembly
             let headers = [];
             if (colField) {
                const secondaryLabel = pivotCols.find(c => c.type === 'grouping')?.displayName || activeRowField;
                headers = isPrimaryGrouped ? [primaryGroupField, secondaryLabel] : [secondaryLabel];
                uniqueColVals.forEach(cv => {
                   aggCols.forEach(ac => {
                      headers.push(cv + ' - ' + (ac.displayName || ac.operation.toUpperCase() + '(' + ac.source + ')'));
                   });
                });
             } else {
                headers = pivotCols.map(c => c.displayName || (c.type === 'aggregation' ? c.operation.toUpperCase() + '(' + c.source + ')' : c.source || 'Untitled'));
                if (isPrimaryGrouped) headers = [primaryGroupField, ...headers];
             }
             finalAOA.push(headers);

            const pivotResults = [];

            // --- PER-COLUMN ROW FILTER HELPER ---
            const applyColRowFilters = (rows, col) => {
              if (!col.rowFilters || col.rowFilters.length === 0) return rows;
              return rows.filter(row => {
                return col.rowFilters.every(f => {
                  if (!f.conditionCol) return true;
                  const rawVal = getMasterValue(row, f.conditionCol);
                  const tv = String(rawVal ?? '').trim();
                  const numTv = parseFloat(tv);
                  const isNum = !isNaN(numTv) && tv !== '';
                  const vals = f.conditionVals || [];
                  const op = f.operator;
                  if (op === 'between') {
                    const lo = parseFloat(vals[0]);
                    const hi = parseFloat(vals[1]);
                    return isNum && !isNaN(lo) && !isNaN(hi) && numTv >= lo && numTv <= hi;
                  }
                  if (op === 'contains') return tv.toLowerCase().includes(String(vals[0] ?? '').toLowerCase());
                  const cv = String(vals[0] ?? '').trim();
                  const numCv = parseFloat(cv);
                  const bothNum = isNum && !isNaN(numCv);
                  if (op === '==') return bothNum ? numTv === numCv : tv.toLowerCase() === cv.toLowerCase();
                  if (op === '!=') return bothNum ? numTv !== numCv : tv.toLowerCase() !== cv.toLowerCase();
                  if (op === '>') return bothNum ? numTv > numCv : tv > cv;
                  if (op === '<') return bothNum ? numTv < numCv : tv < cv;
                  if (op === '>=') return bothNum ? numTv >= numCv : tv >= cv;
                  if (op === '<=') return bothNum ? numTv <= numCv : tv <= cv;
                  return true;
                });
              });
            };

             // Sort and iterate compound pivotMap
             let pivotEntries = Object.entries(pivotMap);
             if (isPrimaryGrouped) {
                pivotEntries = pivotEntries.sort(([, a], [, b]) => {
                   const pc = String(a._primary || '').localeCompare(String(b._primary || ''));
                   return pc !== 0 ? pc : String(a._secondary || '').localeCompare(String(b._secondary || ''));
                });
             }
             pivotEntries.forEach(([mapKey, rowGroup]) => {
                const rowVal = isPrimaryGrouped ? rowGroup._secondary : mapKey;
                const _primaryVal = rowGroup._primary || '';
                const groupResult = isPrimaryGrouped
                   ? { [headers[0]]: _primaryVal, [headers[1]]: rowVal }
                   : { [headers[0]]: rowVal };
                const reportRow = isPrimaryGrouped ? [_primaryVal, rowVal] : [rowVal];

               if (colField) {
                  // CROSS-TAB MODE
                  uniqueColVals.forEach(cv => {
                     const cg = rowGroup.colGroups[cv] || { rows: [], aggregations: {} };
                     aggCols.forEach(col => {
                        const filteredRows = applyColRowFilters(cg.rows, col);
                         if (col.operation === 'count_unique') {
                            const dedupCol = col.dedupColumn || col.source;
                            const res = new Set(filteredRows.map(r => String(getMasterValue(r, dedupCol) ?? '').trim()).filter(v => v !== '')).size;
                             const headerKey = `${cv} - ${col.displayName || ('Unique(' + dedupCol + ')')}`;
                            groupResult[headerKey] = res;
                            reportRow.push(res);
                            return;
                         }
                        if (col.operation === 'count_single' || col.operation === 'count_multi') {
                           const res = filteredRows.filter(r => {
                             const raw = String(getMasterValue(r, col.source) || '').trim();
                             return col.operation === 'count_single' ? !raw.includes('/') : raw.includes('/');
                           }).length;
                           const headerKey = `${cv} - ${col.displayName || (col.operation === 'count_single' ? 'Single Tx(' + col.source + ')' : 'Multi Tx(' + col.source + ')')}`;
                           groupResult[headerKey] = res;
                           reportRow.push(res);
                           return;
                        }
                        const vals = filteredRows.map(r => {
                           const raw = getMasterValue(r, col.source);
                           const cleaned = cleanValue(raw, col, col.source);
                           return parseSafeNum(cleaned);
                        }).filter(v => v !== undefined);
                        let res = 0;
                        if (col.operation === 'count') res = vals.length;
                        else if (vals.length > 0) {
                           if (col.operation === 'sum') res = vals.reduce((a, b) => a + b, 0);
                           else if (col.operation === 'avg') res = vals.reduce((a, b) => a + b, 0) / vals.length;
                           else if (col.operation === 'min') res = Math.min(...vals);
                           else if (col.operation === 'max') res = Math.max(...vals);
                        }
                        const val = typeof res === 'number' ? Number(res.toFixed(2)) : res;
                        const headerKey = `${cv} - ${col.displayName || col.operation.toUpperCase() + '(' + col.source + ')'}`;
                        groupResult[headerKey] = val;
                        reportRow.push(val);
                     });
                  });
               } else {
                  // STANDARD LIST MODE
                  const cg = rowGroup.colGroups['_default'];
                  // Pre-calculate aggregations for standard mode
                  aggCols.forEach(col => {
                     const filteredRows = applyColRowFilters(cg.rows, col);
                      if (col.operation === 'count_unique') {
                         const dedupCol = col.dedupColumn || col.source;
                         cg.aggregations[col.id] = new Set(filteredRows.map(r => String(getMasterValue(r, dedupCol) ?? '').trim()).filter(v => v !== '')).size;
                         return;
                      }
                     if (col.operation === 'count_single' || col.operation === 'count_multi') {
                        cg.aggregations[col.id] = filteredRows.filter(r => {
                          const raw = String(getMasterValue(r, col.source) || '').trim();
                          return col.operation === 'count_single' ? !raw.includes('/') : raw.includes('/');
                        }).length;
                        return;
                     }
                     const vals = filteredRows.map(r => {
                        const raw = getMasterValue(r, col.source);
                        const cleaned = cleanValue(raw, col, col.source);
                        return parseSafeNum(cleaned);
                     }).filter(v => v !== undefined);
                     let res = 0;
                     if (col.operation === 'count') res = vals.length;
                     else if (vals.length > 0) {
                        if (col.operation === 'sum') res = vals.reduce((a, b) => a + b, 0);
                        else if (col.operation === 'avg') res = vals.reduce((a, b) => a + b, 0) / vals.length;
                        else if (col.operation === 'min') res = Math.min(...vals);
                        else if (col.operation === 'max') res = Math.max(...vals);
                     }
                     cg.aggregations[col.id] = typeof res === 'number' ? Number(res.toFixed(2)) : res;
                  });

                  pivotCols.forEach(col => {
                     if (col.type === 'grouping') return; // Handled by reportRow[0]
                     let val = '';
                     if (col.type === 'property') {
                        val = cleanValue(getMasterValue(rowGroup.firstRow, col.source), col, col.source);
                     } else if (col.type === 'aggregation') val = cg.aggregations[col.id];
                     else if (col.type === 'formula') {
                        let expr = col.formula || '';
                        (expr.match(/\[(.*?)\]/g) || []).forEach(m => expr = expr.split(m).join(parseSafeNum(getMasterValue(rowGroup.firstRow, m.replace(/[\[\]]/g, '')))));
                        (expr.match(/\{(.*?)\}/g) || []).forEach(m => expr = expr.split(m).join(parseSafeNum(groupResult[m.replace(/[\{\}]/g, '')])));
                        try { const res = new Function(`return ${expr}`)(); val = isNaN(res) || !isFinite(res) ? 0 : Number(res.toFixed(4)); } catch(e) { val = 'Err'; }
                     }
                     const colKey = col.displayName || (col.type === 'aggregation' ? (col.operation === 'count_single' ? `Single Tx(${col.source})` : col.operation === 'count_multi' ? `Multi Tx(${col.source})` : `${col.operation.toUpperCase()}(${col.source})`) : col.source || 'Untitled');
                     groupResult[colKey] = val;
                     reportRow.push(val);
                  });
               }
               
               pivotResults.push({ data: groupResult, rawRow: reportRow });
            });

            // Apply Output Filters
            let filteredResults = pivotResults;
            if (template.isOutputFilterEnabled !== false && template.outputFilters && template.outputFilters.length > 0) {
               filteredResults = pivotResults.filter(res => template.outputFilters.every(f => evaluateCondition(res.data, f)));
            }

            filteredResults.forEach(res => finalAOA.push(res.rawRow));

            // --- GRAND TOTAL ROW ---
            if (template.isPivotSummaryEnabled) {
               const colOffset = isPrimaryGrouped ? 2 : 1; // extra leading columns before aggregations
               const totalRow = ['GRAND TOTAL'];
               if (isPrimaryGrouped) totalRow.push(''); // blank for secondary group col
               for (let i = colOffset; i < headers.length; i++) {
                  let shouldSum = true;
                  if (!colField) {
                     const colDef = pivotCols[i - (colOffset - 1)]; // adjust for leading group cols
                     if (!colDef || (colDef.type !== 'aggregation' && colDef.type !== 'formula') || colDef.showTotal === false) shouldSum = false;
                  }
                  if (shouldSum) {
                     const sum = filteredResults.reduce((acc, res) => {
                        const val = res.rawRow[i];
                        return acc + (typeof val === 'number' ? val : 0);
                     }, 0);
                     totalRow.push(Number(sum.toFixed(2)));
                  } else {
                     totalRow.push('');
                  }
               }
               finalAOA.push(totalRow);
            }

            hasMappingTargets = true;
            columnHeaders = headers;
            if (topReportHeader) template._resolvedPivotHeader = topReportHeader;
            if (isPrimaryGrouped) template._isPrimaryGrouped = primaryGroupField;

            // Generate Chart if enabled
            if (template.isChartEnabled && template.chartConfig) {
               currentChartImage = await generateChartImage(template.chartConfig, filteredResults);
            }
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

          // When isHighlightEmptyEnabled with no explicit mappings, auto-build mappings from all master columns
          let effectiveMappings = template.mappings || [];
          if (template.isHighlightEmptyEnabled && effectiveMappings.filter(m => m.target).length === 0 && masterData.length > 0) {
            const allCols = Object.keys(masterData[0] || {});
            effectiveMappings = allCols.map(col => ({ type: 'direct', source: col, target: col }));
          }

          const isSummaryOnly = template.isSummaryMode === true || (hasMappingTargets && effectiveMappings.every(m => m.type === 'condition_count' || !m.target));
          let processData = [...filteredMasterData];
          if (isSummaryOnly && processData.length > 0) processData = [processData[0]];

          let reportData = processData.map((row, index) => {
            const newRow = {};
            let rowHasEmpty = false;
            effectiveMappings.forEach((mapping, mappingIndex) => {
              if (!mapping.target) return;
              let val = '';
              const type = mapping.type || 'direct';
              if (type === 'direct' && mapping.source) val = cleanValue(getMasterValue(row, mapping.source), mapping, mapping.source);
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

              val = cleanValue(val, mapping);

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
          const mergeCols = effectiveMappings.filter(m => m.enableMerging && m.target).map(m => m.target);
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
          const groupAggMappings = effectiveMappings.filter(m => m.groupAggType && m.groupAggType !== 'none' && m.target);
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
          columnHeaders = effectiveMappings.filter(m => m.target).map(m => m.target);
          finalAOA.push(columnHeaders);
          reportData.forEach(item => {
             finalAOA.push(columnHeaders.map(h => {
                const val = item.data[h];
                return (val && typeof val === 'object') ? val : (val === null || val === undefined ? '' : val);
             }));
          });

          // Totals Footer
          const footerCalculations = effectiveMappings.filter(m => m.totalType && m.totalType !== 'none' && m.target);
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
            const hasHeader = !!(topReportHeader || template._resolvedPivotHeader);
            if (hasHeader && columnHeaders.length > 1) {
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
                     let dataStartRow = hasHeader ? 2 : 1;
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
            }
             // --- PRIMARY GROUP MERGE (Pivot Hierarchical) ---
             if (template.type === 'pivot' && template._isPrimaryGrouped) {
                if (!ws['!merges']) ws['!merges'] = [];
                const dataStart = hasHeader ? 2 : 1;
                let mStart = dataStart;
                let lastPG = finalAOA[dataStart] ? String(finalAOA[dataStart][0] || '').trim() : '';
                for (let r = dataStart + 1; r <= finalAOA.length; r++) {
                   const curPG = (r < finalAOA.length && finalAOA[r]) ? String(finalAOA[r][0] || '').trim() : null;
                   if (curPG !== lastPG || r === finalAOA.length) {
                      if (r - 1 > mStart) ws['!merges'].push({ s: { r: mStart, c: 0 }, e: { r: r - 1, c: 0 } });
                      lastPG = curPG; mStart = r;
                   }
                }
             }
              // Row Heights Guard (Restored)
              const range = XLSX.utils.decode_range(ws['!ref']);
              ws['!rows'] = finalAOA.map((_, rIdx) => ({ hpt: 18, customHeight: true }));
           

           // Global Guard (Alignment)
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

        // --- FILENAME RESOLUTION ---
        let rawFileName = template.fileNameFormat || `${template.name.replace(/\s+/g, '_')}.xlsx`;
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0] + "_" + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
        const fileName = rawFileName.replace('{date}', dateStr).replace('.xlsx', '') + '.xlsx';

        let excelBuffer;
        if (currentChartImage) {
           excelBuffer = await excelJSExport(finalAOA, columnHeaders, topReportHeader || template._resolvedPivotHeader, currentChartImage);
        } else {
           excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        }

        if (!isSingle) zip.file(fileName, excelBuffer);
        else saveAs(new Blob([excelBuffer], { type: 'application/octet-stream' }), fileName);
       } catch (templateErr) {
         console.error(`Template "${template.name || 'Untitled'}" failed:`, templateErr);
         templateErrors.push(`${template.name || 'Untitled'}: ${templateErr.message}`);
         if (isSingle) {
           setError(`Report "${template.name || 'Untitled'}" failed: ${templateErr.message}`);
         }
       }
      }
      
      if (!isSingle) {
        const zipFileCount = Object.keys(zip.files).length;
        if (zipFileCount > 0) {
          saveAs(await zip.generateAsync({ type: 'blob' }), `Synergy_Reports_${Date.now()}.zip`);
        }
        if (templateErrors.length > 0) {
          setError(`${templateErrors.length} template(s) failed: ${templateErrors.join('; ')}`);
        }
        if (zipFileCount === 0 && templateErrors.length > 0) {
          setError(`All templates failed: ${templateErrors.join('; ')}`);
        }
      }
      setStatus('Completed!');
      setTimeout(() => setStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setError(`Generation failed: ${err.message}`);
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
