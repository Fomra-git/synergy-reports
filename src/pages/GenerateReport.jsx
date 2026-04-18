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
      const masterData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

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

      const parseSafeNum = (val) => {
         if (val === null || val === undefined || val === '') return 0;
         if (typeof val === 'number') return val;
         const cleaned = String(val).replace(/[^0-9.-]/g, '');
         const num = parseFloat(cleaned);
         return isNaN(num) ? 0 : num;
      };

      const cleanFieldName = (str) =>
         String(str || '')
           .trim()
           .replace(/^["'\s]+|["'\s]+$/g, '')
           .replace(/[\u200B-\u200D\uFEFF]/g, '')
           .trim();

       const parseReportDate = (rawVal) => {
          if (rawVal === undefined || rawVal === null || rawVal === '') return null;
          if (typeof rawVal === 'number') {
             if (rawVal > 20000 && rawVal < 100000) return new Date(Math.round((rawVal - 25569) * 86400 * 1000));
             return null;
          }
          let s = String(rawVal).trim();
          const longMatch = s.match(/.*,\s+(.*?)\s+,\s+.*/);
          if (longMatch) s = longMatch[1];
          const d = new Date(s);
          if (!isNaN(d.getTime())) return d;
          const monthsF = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
          const mdy = s.match(/([a-z]+)\s+(\d\d?)\s*[-,]?\s*(\d\d\d\d)/i);
          if (mdy) {
             const mIdx = monthsF.indexOf(mdy[1].toLowerCase().slice(0, 3));
             if (mIdx >= 0) return new Date(parseInt(mdy[3]), mIdx, parseInt(mdy[2]));
          }
          const dmy = s.match(/(\d\d?)\s+([a-z]+)\s+(\d\d\d\d)/i);
          if (dmy) {
             const mIdx = monthsF.indexOf(dmy[2].toLowerCase().slice(0, 3));
             if (mIdx >= 0) return new Date(parseInt(dmy[3]), mIdx, parseInt(dmy[1]));
          }
          return null;
       };

      if (masterData.length > 0) {
        masterData.forEach(row => {
          Object.keys(row).forEach(key => {
            const cleaned = cleanFieldName(key);
            if (cleaned !== key) {
              row[cleaned] = row[key];
              delete row[key];
            }
          });
        });
      }

      const getMasterValue = (row, source) => {
        if (!source || !row) return '';
        const src = cleanFieldName(source);
        if (row[src] !== undefined && row[src] !== null) return row[src];
        const normalize = (str) => String(str || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanSource = normalize(src);
        const matchingKey = Object.keys(row).find(k => normalize(k) === cleanSource);
        return matchingKey ? row[matchingKey] : '';
      };

      const minDateMap = {};
      const maxDateMap = {};
      const dateColumns = new Set();
      targetTemplates.forEach(t => {
         if (t.pivotColumns) t.pivotColumns.forEach(c => { if (c.normalizeWeek) dateColumns.add(c.source); });
         if (t.rowFieldTransforms?.normalizeWeek) dateColumns.add(t.rowField);
         if (t.colFieldTransforms?.normalizeWeek) dateColumns.add(t.colField);
         if (t.mappings) t.mappings.forEach(m => { if (m.normalizeWeek) dateColumns.add(m.source); });
      });

      if (dateColumns.size > 0) {
         dateColumns.forEach(col => {
            let min = Infinity, max = -Infinity;
            masterData.forEach(row => {
               const raw = getMasterValue(row, col);
               const p = parseReportDate(raw);
               if (p && !isNaN(p.getTime())) {
                  const t = p.getTime();
                  if (t < min) min = t;
                  if (t > max) max = t;
               }
            });
             if (min !== Infinity) {
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
      
      const evaluateSbFormula = (formula, ctx) => {
        if (!formula) return 0;
        try {
          let f = formula;
          f = f.replace(/\{{1,2}\s*SUM_ALL\s*\(([^)]+)\)\s*\}{1,2}/ig, 'SUM_ALL($1)');
          f = f.replace(/SUM_ALL\s*\(([^)]+)\)/ig, (match, inner) => {
             const innerKey = inner.trim().replace(/[{}]/g, '').toLowerCase();
             const targetKey = 'sum:' + innerKey;
             const matchingKey = Object.keys(ctx).find(k => k.toLowerCase() === targetKey);
             return matchingKey ? (ctx[matchingKey] || 0) : 0;
          });
          f = f.replace(/\{{1,2}([^}]+)\}{1,2}/g, (match, token) => {
             const key = token.trim().toLowerCase();
             let matchingKey = Object.keys(ctx).find(k => k.toLowerCase() === key);
             if (!matchingKey) matchingKey = Object.keys(ctx).find(k => k.toLowerCase() === 'sum:' + key);
             return matchingKey ? (ctx[matchingKey] || 0) : 0;
          });
          // eslint-disable-next-line no-eval
          const result = eval(f);
          return isNaN(result) ? 0 : result;
        } catch (err) {
          console.error('Formula Eval Error:', formula, err);
          return 0;
        }
      };

      const generateScoreboardReport = async (template) => {
        const MONTHS_SB = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        const toLocalISO = (dateObj) => {
          if (!dateObj || isNaN(dateObj.getTime())) return null;
          const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0'), d = String(dateObj.getDate()).padStart(2, '0');
          return y + '-' + m + '-' + d;
        };
        const parseSbDate = (val) => {
          if (!val && val !== 0) return null;
          if (typeof val === 'number') {
            if (val > 20000 && val < 100000) return toLocalISO(new Date(Math.round((val - 25569) * 86400 * 1000)));
            return null;
          }
          let s = String(val).trim();
          const longMatch = s.match(/.*,\s+(.*?)\s+,\s+.*/);
          if (longMatch) s = longMatch[1];
          const dmy = s.match(/^(\d\d?)[./](\d\d?)[./](\d\d\d\d)$/);
          if (dmy) return toLocalISO(new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1])));
          const d = new Date(s);
          if (!isNaN(d.getTime())) return toLocalISO(d);
          const foundM = MONTHS_SB.find(m => s.toLowerCase().includes(m));
          if (foundM) {
            const yr = s.match(/\d\d\d\d/), dy = s.match(/\d\d?/);
            if (yr && dy) return toLocalISO(new Date(parseInt(yr[0]), MONTHS_SB.indexOf(foundM), parseInt(dy[0])));
          }
          return null;
        };
        const sbEvalRule = (targetVal, operator, conditionVals = []) => {
          const tv = String(targetVal || '').toLowerCase().trim();
          const evalSingle = (cv) => {
            const c = String(cv || '').toLowerCase().trim();
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
        const fmtCell = (cd) => {
          if (!cd) return '';
          const fCur = Math.round(cd.cur || 0), fTot = Math.round(cd.total || 0), fConv = Math.round(cd.conv || 0);
          if (cd.mode === 'triple') return '(' + fCur + ')(' + fTot + ')(' + fConv + ')';
          if (cd.mode === 'cumulative' || cd.mode === 'target') return fCur + '(' + fTot + ')';
          return String(fCur);
        };
        let sbMasterData = [...masterData];
        if (template.isGlobalFilterEnabled !== false && template.globalFilters && template.globalFilters.length > 0) {
          template.globalFilters.forEach(gf => {
            if (!gf.conditionCol) return;
            sbMasterData = sbMasterData.filter(row => sbEvalRule(getMasterValue(row, gf.conditionCol), gf.operator, gf.conditionVals || []));
          });
        }
        const dateCol = template.dateColumn;
        const allDatesSet = new Set();
        sbMasterData.forEach(r => { const d = parseSbDate(getMasterValue(r, dateCol)); if (d) allDatesSet.add(d); });
        const allDates = [...allDatesSet].sort();
        if (allDates.length === 0) throw new Error('Scoreboard: No dates found');
        const targetDate = allDates[allDates.length - 1];
        const pieces = targetDate.split('-').map(Number);
        const tY = pieces[0], tMo = pieces[1], tD = pieces[2];
        let periodStart, periodEnd;
        if (template.customStartDate && template.customEndDate) {
          periodStart = new Date(template.customStartDate);
          periodEnd = new Date(template.customEndDate);
        } else {
          const msd = parseInt(template.monthStartDay) || 26;
          periodStart = tD >= msd ? new Date(tY, tMo - 1, msd) : new Date(tY, tMo - 2, msd);
          periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, msd - 1);
        }
        const tdObj = new Date(tY, tMo - 1, tD);
        const dayN = Math.max(1, Math.round((tdObj - periodStart) / 864e5) + 1);
        const daysInPeriod = Math.max(1, Math.round((periodEnd - periodStart) / 864e5) + 1);
        const nameCol = template.nameColumn;
        const doctorsOrdered = [];
        const docSeen = new Set();
        sbMasterData.forEach(r => {
          const name = String(getMasterValue(r, nameCol) || '').trim();
          if (name && !docSeen.has(name)) { doctorsOrdered.push(name); docSeen.add(name); }
        });
        const groups = template.groups || [];
        const aptNoCol = template.aptNoColumn;
        const appNoCol = template.appNoColumn;
        const scoreRows = doctorsOrdered.map(doctor => {
          const docRows = sbMasterData.filter(r => String(getMasterValue(r, nameCol) || '').trim() === doctor);
          const rowContext = {};
          const groupData = groups.map(group => {
            let gRows = docRows;
            if (group.filterColumn && (group.filterValues && group.filterValues.length > 0 || group.filterValue)) {
              const fvs = group.filterValues && group.filterValues.length > 0 ? group.filterValues.map(v => v.toLowerCase().trim()) : [String(group.filterValue || '').toLowerCase().trim()];
              gRows = docRows.filter(r => {
                const val = String(getMasterValue(r, group.filterColumn) || '').toLowerCase().trim();
                return fvs.some(fv => val === fv || val.includes(fv));
              });
            }
            const colData = (group.columns || []).map(col => {
              if (col.isCalculated) return { id: col.id, mode: 'cumulative', isCalculated: true, originalCol: col };
              let cRows = gRows;
              if (col.filterColumn && (col.filterValues && col.filterValues.length > 0 || col.filterValue)) {
                const cfvs = col.filterValues && col.filterValues.length > 0 ? col.filterValues.map(v => v.toLowerCase().trim()) : [String(col.filterValue || '').toLowerCase().trim()];
                cRows = gRows.filter(r => {
                  const val = String(getMasterValue(r, col.filterColumn) || '').toLowerCase().trim();
                  return cfvs.some(fv => val === fv || val.includes(fv));
                });
              }
              const total = cRows.length;
              const cur = cRows.filter(r => parseSbDate(getMasterValue(r, dateCol)) === targetDate).length;
              let conv = 0;
              if (col.displayMode === 'triple') {
                const noConv = cRows.filter(r => parseSafeNum(getMasterValue(r, aptNoCol)) === 1 && parseSafeNum(getMasterValue(r, appNoCol)) === 1).length;
                conv = total - noConv;
              }
              rowContext[group.id + ':' + col.id + ':cur'] = cur;
              rowContext[group.id + ':' + col.id + ':total'] = total;
              rowContext[group.id + ':' + col.id + ':conv'] = conv;
              return { id: col.id, mode: col.displayMode, cur, total, conv, isCalculated: false };
            });
            return { groupId: group.id, colData };
          });
          groupData.forEach(gd => {
            gd.colData.forEach(cd => {
              if (!cd.isCalculated) return;
              const col = cd.originalCol;
              cd.cur = evaluateSbFormula(col.formulaCur || col.formula, rowContext);
              cd.total = evaluateSbFormula(col.formula, rowContext);
              cd.conv = evaluateSbFormula(col.formulaConv || col.formula, rowContext);
              rowContext[gd.groupId + ':' + col.id + ':cur'] = cd.cur;
              rowContext[gd.groupId + ':' + col.id + ':total'] = cd.total;
              rowContext[gd.groupId + ':' + col.id + ':conv'] = cd.conv;
            });
          });
          const docBranchName = String(getMasterValue(docRows[0], template.branchColumn) || '').trim();
          let branchTarget = 0;
          if (template.branches && template.branches.length > 0 && docBranchName) {
            const matchedBranch = template.branches.find(b => docBranchName.toLowerCase().includes(String(b.nameContains || '').toLowerCase()));
            if (matchedBranch) branchTarget = parseSafeNum(matchedBranch.target);
          }
          let docBranchCur = template.branchCurFormula ? evaluateSbFormula(template.branchCurFormula, rowContext) : groupData.reduce((acc, gd) => acc + gd.colData.filter(c => c.isConsultation).reduce((a, c) => a + c.total, 0), 0);
          rowContext['B:CUR'] = docBranchCur;
          const branchActual = branchTarget > 0 ? Math.round(branchTarget * dayN / daysInPeriod) : 0;
          rowContext['B:ACT'] = branchActual;
          rowContext['B:TGT'] = branchTarget;
          return { doctor, docBranchName, groupData, docBranchCur, branchActual, branchTarget, rowContext };
        });
        const sbWb = new ExcelJS.Workbook();
        const ws = sbWb.addWorksheet('Score Board');
        let subColCount = 0;
        groups.forEach(g => { subColCount += (g.columns ? g.columns.length : 0); });
        const totalCols = 2 + subColCount + 1;
        const applyStyle = (cell, s) => { if (!s) return; if (s.font) cell.font = s.font; if (s.alignment) cell.alignment = s.alignment; if (s.fill) cell.fill = s.fill; if (s.border) cell.border = s.border; };
        const thinBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        const medBorder  = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
        const subtitleStyle = { font: { bold: true, size: 11 }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAEBD7' } }, border: thinBorder };
        const groupHdrStyle = { font: { bold: true, size: 10 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5DEB3' } }, border: medBorder };
        const subHdrStyle   = { font: { bold: true, size: 9 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } }, border: thinBorder };
        const cellStyle     = { font: { size: 9 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: thinBorder };
        const totalStyle    = { font: { bold: true, size: 9 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD7E8FA' } }, border: thinBorder };
        const nameStyle     = { font: { bold: true, size: 9 }, alignment: { horizontal: 'left', vertical: 'middle' }, border: thinBorder };
        const branchMergStyle = { font: { bold: true, size: 9 }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }, border: medBorder };
        const fmtDate = (ds) => { if (!ds) return ''; const p = ds.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; };
        ws.addRow([template.name || 'Scoreboard']);
        ws.mergeCells(1, 1, 1, totalCols);
        applyStyle(ws.getRow(1).getCell(1), { font: { bold: true, size: 13 }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F0E8' } }, border: thinBorder });
        ws.addRow([(template.subtitle || 'Report') + ' - Date: ' + fmtDate(targetDate) + ' / Day ' + dayN]);
        ws.mergeCells(2, 1, 2, totalCols);
        applyStyle(ws.getRow(2).getCell(1), subtitleStyle);
        const r3Values = [null, null];
        groups.forEach(g => { r3Values.push(g.name); for (let i = 1; i < (g.columns?.length || 0); i++) r3Values.push(null); });
        r3Values.push('Branch\n(Cur/Actual/Target)');
        ws.addRow(r3Values);
        const r4Values = ['S.No', 'Name'];
        groups.forEach(g => { if(g.columns) g.columns.forEach(c => r4Values.push(c.name)); });
        r4Values.push('');
        ws.addRow(r4Values);
        ws.mergeCells(3, 1, 4, 1); ws.mergeCells(3, 2, 4, 2); ws.mergeCells(3, totalCols, 4, totalCols);
        let colCursor = 3;
        groups.forEach(g => { const n = g.columns?.length || 0; if (n > 1) ws.mergeCells(3, colCursor, 3, colCursor + n - 1); colCursor += n; });
        applyStyle(ws.getRow(3).getCell(1), groupHdrStyle); applyStyle(ws.getRow(3).getCell(2), groupHdrStyle); applyStyle(ws.getRow(3).getCell(totalCols), groupHdrStyle);
        applyStyle(ws.getRow(4).getCell(1), subHdrStyle); applyStyle(ws.getRow(4).getCell(2), subHdrStyle); applyStyle(ws.getRow(4).getCell(totalCols), subHdrStyle);
        colCursor = 3;
        groups.forEach(g => { applyStyle(ws.getRow(3).getCell(colCursor), groupHdrStyle); if(g.columns) g.columns.forEach((_, ci) => applyStyle(ws.getRow(4).getCell(colCursor + ci), subHdrStyle)); colCursor += (g.columns?.length || 0); });
        const branchGroups = [];
        scoreRows.forEach(sr => { const last = branchGroups[branchGroups.length - 1]; if (last && last.branchName === sr.docBranchName) last.doctors.push(sr); else branchGroups.push({ branchName: sr.docBranchName, doctors: [sr] }); });
        let excelRowIdx = 5; let sNo = 1;
        branchGroups.forEach(bg => {
          const branchStartRow = excelRowIdx;
          const bCur = bg.doctors.reduce((a, sr) => a + (sr.docBranchCur || 0), 0);
          const bAct = bg.doctors[0]?.branchActual || 0, bTgt = bg.doctors[0]?.branchTarget || 0;
          bg.doctors.forEach(sr => {
            const rowVals = [sNo++, sr.doctor];
            sr.groupData.forEach(gd => gd.colData.forEach(cd => rowVals.push(fmtCell(cd))));
            rowVals.push('');
            const dataRow = ws.addRow(rowVals);
            dataRow.eachCell((cell, colNum) => { if (colNum === 2) applyStyle(cell, nameStyle); else if (colNum !== totalCols) applyStyle(cell, cellStyle); });
            excelRowIdx++;
          });
          const branchCell = ws.getRow(branchStartRow).getCell(totalCols);
          branchCell.value = (bg.branchName || '—') + '\n(' + bCur + ')(' + bAct + ')(' + bTgt + ')';
          applyStyle(branchCell, branchMergStyle);
          if (bg.doctors.length > 1) ws.mergeCells(branchStartRow, totalCols, excelRowIdx - 1, totalCols);
        });
        const totalVals = ['', 'Total'];
        const fCtx = {};
        scoreRows.forEach(sr => {
           Object.keys(sr.rowContext).forEach(k => fCtx['SUM:' + k] = (fCtx['SUM:' + k] || 0) + (sr.rowContext[k] || 0));
           fCtx['SUM:B:CUR'] = (fCtx['SUM:B:CUR'] || 0) + (sr.docBranchCur || 0);
        });
        branchGroups.forEach(bg => {
           fCtx['SUM:B:ACT'] = (fCtx['SUM:B:ACT'] || 0) + (bg.doctors[0]?.branchActual || 0);
           fCtx['SUM:B:TGT'] = (fCtx['SUM:B:TGT'] || 0) + (bg.doctors[0]?.branchTarget || 0);
        });
        groups.forEach(g => { if(g.columns) g.columns.forEach(col => totalVals.push(fmtCell({ mode: col.isCalculated ? 'cumulative' : col.displayMode, cur: fCtx['SUM:'+g.id+':'+col.id+':cur']||0, total: fCtx['SUM:'+g.id+':'+col.id+':total']||0, conv: fCtx['SUM:'+g.id+':'+col.id+':conv']||0 })) ); });
        let fCur = template.branchFooterCurFormula ? evaluateSbFormula(template.branchFooterCurFormula, fCtx) : fCtx['SUM:B:CUR'];
        let fTot = template.branchFooterTotalFormula ? evaluateSbFormula(template.branchFooterTotalFormula, fCtx) : fCtx['SUM:B:ACT'];
        let fConv = template.branchFooterConvFormula ? evaluateSbFormula(template.branchFooterConvFormula, fCtx) : fCtx['SUM:B:TGT'];
        totalVals.push('(' + fCur + ')(' + fTot + ')(' + fConv + ')');
        const totRow = ws.addRow(totalVals); totRow.eachCell(cell => applyStyle(cell, totalStyle));
        ws.getColumn(1).width = 6; ws.getColumn(2).width = 22;
        for (let i = 3; i < totalCols; i++) ws.getColumn(i).width = 13;
        ws.getColumn(totalCols).width = 20;
        return await sbWb.xlsx.writeBuffer();
      };

      for (const template of targetTemplates) {
       try {
        setStatus(`Generating ${template.name || 'Untitled'}...`);
        if (template.type === 'scoreboard') {
          const sbBuffer = await generateScoreboardReport(template);
          const sbFileName = `${(template.name || 'ScoreBoard').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
          if (isSingle) saveAs(new Blob([sbBuffer], { type: 'application/octet-stream' }), sbFileName);
          else zip.file(sbFileName, sbBuffer);
          continue;
        }

         const cleanValue = (val, config, colName) => {
           if (val === undefined || val === null || val === '') return '';
           if (!config) return String(val).trim();
           let cleaned = String(val);
           let dateObj = (config.normalizeMonth || config.normalizeWeek) ? parseReportDate(val) : null;
           if (config.simplifyDate) { const m = cleaned.match(/.*,\s+(.*?)\s+,\s+.*/); if (m) cleaned = m[1]; }
           if (config.simplifyTime) { const m = cleaned.match(/.*,\s+.*?\s+,\s+(.*)/); if (m) cleaned = m[1]; }
           if (config.normalizeMonth && dateObj) cleaned = dateObj.toLocaleString('default', { month: 'short' });
           if (config.normalizeWeek && dateObj && colName && minDateMap[colName]) {
              const dayLocal = new Date(dateObj); dayLocal.setHours(0, 0, 0, 0);
              const weekNum = Math.floor((dayLocal.getTime() - minDateMap[colName]) / (7 * 24 * 60 * 60 * 1000)) + 1;
              const weekStart = new Date(minDateMap[colName] + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
              let weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
              if (maxDateMap[colName] && weekEnd.getTime() > maxDateMap[colName]) weekEnd = new Date(maxDateMap[colName]);
              const f = (d) => d.toLocaleString('default', { month: 'short', day: 'numeric' });
              cleaned = `Week ${weekNum} (${f(weekStart)} to ${f(weekEnd)})`;
           }
           if (config.findText) { try { cleaned = cleaned.replace(new RegExp(config.findText, 'gi'), config.replaceWith || ''); } catch (e) {} }
           return cleaned.trim();
         };

         const generateChartImage = async (chartConfig, pivotResults) => {
           if (!chartConfig || !pivotResults || pivotResults.length === 0 || !chartConfig.xAxis) return null;
           const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 700; const ctx = canvas.getContext('2d');
           const firstResult = pivotResults[0].data; const allKeys = Object.keys(firstResult);
           const resolveMetrics = (rm) => allKeys.filter(k => k === rm || k.endsWith(' - ' + rm) || k.endsWith('-' + rm)) || [rm];
           const targetColumns = (chartConfig.yAxes || []).flatMap(m => resolveMetrics(m));
           const labels = pivotResults.map(r => String(r.data[chartConfig.xAxis] || ''));
           const colors = ['rgba(99, 102, 241, 0.7)', 'rgba(16, 185, 129, 0.7)', 'rgba(245, 158, 11, 0.7)', 'rgba(236, 72, 153, 0.7)', 'rgba(14, 165, 233, 0.7)'];
           const datasets = targetColumns.map((colName, idx) => ({ label: colName, data: pivotResults.map(r => parseSafeNum(r.data[colName])), backgroundColor: colors[idx % colors.length], borderWidth: 1 }));
           return new Promise((resolve) => {
             new Chart(ctx, { type: chartConfig.type || 'bar', data: { labels, datasets }, options: { animation: false, plugins: { legend: { display: true }, title: { display: true, text: `Pivot Analytics Summary` } } } });
             setTimeout(() => resolve(canvas.toDataURL('image/png')), 200);
           });
         };

         const excelJSExport = async (fAOA, colHdrs, tHdr, cImg) => {
           const workbook = new ExcelJS.Workbook(); const worksheet = workbook.addWorksheet('Report');
           let currR = 1;
           if (tHdr) { worksheet.mergeCells(1, 1, 1, colHdrs.length); const c = worksheet.getCell(1, 1); c.value = tHdr; c.font = { bold: true, size: 14 }; c.alignment = { horizontal: 'center' }; currR = 2; }
           const hRow = worksheet.getRow(currR); hRow.values = colHdrs; hRow.font = { bold: true };
           hRow.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; c.alignment = { horizontal: 'center' }; c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
           currR++;
           fAOA.slice(tHdr ? 2 : 1).forEach((r) => { const dr = worksheet.getRow(currR); dr.values = r.map(v => (v && typeof v === 'object' && v.v !== undefined) ? v.v : v); dr.eachCell(c => { c.alignment = { horizontal: 'center' }; c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; }); currR++; });
           worksheet.columns.forEach(c => c.width = 25);
           if (cImg) { const imgId = workbook.addImage({ base64: cImg, extension: 'png' }); worksheet.addImage(imgId, { tl: { col: 0, row: currR + 1 }, ext: { width: 900, height: 450 } }); }
           return await workbook.xlsx.writeBuffer();
         };

        let topReportHeader = template.isHeaderEnabled && template.headerConfig ? (template.headerConfig.type === 'custom' ? template.headerConfig.text : (masterData.length > 0 ? getMasterValue(masterData[0], template.headerConfig.sourceCol) : '')) : null;
        let finalAOA = [], columnHeaders = [], currentChartImage = null, hasMT = (template.mappings || []).some(m => m.target) || !!template.isHighlightEmptyEnabled;

         const evaluateCondition = (row, mapping) => {
           if (!mapping) return true;
           const evalRule = (tVal, op, cVals) => {
             const cv = cVals || [], nMaster = Number(tVal), isNum = !isNaN(nMaster) && tVal !== '' && tVal !== null;
             if (op === 'between') { if (cv.length < 2) return false; const min = Number(cv[0]), max = Number(cv[1]); return isNum && nMaster >= min && nMaster <= max; }
             const es = (cVal) => { const nC = Number(cVal), isN = isNum && !isNaN(nC); if (op === '==') return isN ? nMaster === nC : String(tVal) === String(cVal); if (op === '!=') return isN ? nMaster !== nC : String(tVal) !== String(cVal); if (op === '>') return isN ? nMaster > nC : String(tVal) > String(cVal); if (op === '<') return isN ? nMaster < nC : String(tVal) < String(cVal); if (op === 'contains') return String(tVal || '').toLowerCase().includes(String(cVal || '').toLowerCase()); return false; };
             if (cv.length > 0) return op === '!=' ? cv.every(c => es(c)) : cv.some(c => es(c));
             return true;
           };
           return (mapping.rules && mapping.rules.length > 0) ? mapping.rules.every(r => r.conditionCol ? evalRule(getMasterValue(row, r.conditionCol), r.operator, r.conditionVals) : true) : (mapping.conditionCol ? evalRule(getMasterValue(row, mapping.conditionCol), mapping.operator, mapping.conditionVals) : true);
         };

        let filteredMD = [...masterData];
        if (template.isGlobalFilterEnabled !== false && template.globalFilters?.length > 0) template.globalFilters.forEach(gf => { if (gf.conditionCol) filteredMD = filteredMD.filter(r => evaluateCondition(r, gf)); });
        if (template.mappings?.filter(m => m.type === 'condition' && m.conditionCol).length > 0) filteredMD = filteredMD.filter(r => template.mappings.filter(m => m.type === 'condition' && m.conditionCol).every(m => evaluateCondition(r, m)));

        if (template.type === 'pivot') {
          let pCols = [...(template.pivotColumns || [])];
          if (pCols.length === 0 && template.valueFields?.length > 0) pCols = template.valueFields.map((vf, i) => ({ id: `leg-${i}`, type: 'aggregation', ...vf }));
          const rowField = template.rowField, colField = template.colField, isPG = !!rowField;
          const rowsByGroup = {};
          filteredMD.forEach(r => {
             const gk = isPG ? String(getMasterValue(r, rowField) || '').trim() : '_default';
             if (!rowsByGroup[gk]) rowsByGroup[gk] = { firstRow: r, colGroups: {} };
             const ck = colField ? String(getMasterValue(r, colField) || '').trim() : '_default';
             if (!rowsByGroup[gk].colGroups[ck]) rowsByGroup[gk].colGroups[ck] = { rows: [], aggregations: {} };
             rowsByGroup[gk].colGroups[ck].rows.push(r);
          });
          const allColKs = colField ? Array.from(new Set(filteredMD.map(r => String(getMasterValue(r, colField) || '').trim()))).sort() : ['_default'];
          const headers = [rowField || 'Group'];
          if (colField) allColKs.forEach(ck => pCols.filter(p => p.type === 'aggregation').forEach(p => headers.push(`${ck} - ${p.displayName || p.source}`)));
          else pCols.forEach(p => headers.push(p.displayName || p.source || 'Untitled'));
          if (template.isRowTotalEnabled) headers.push('TOTAL');
          finalAOA.push(headers);
          Object.entries(rowsByGroup).forEach(([gk, rg]) => {
             const rr = [gk]; let rSum = 0; const gRes = { [rowField || 'Group']: gk };
             allColKs.forEach(ck => {
                const cg = rg.colGroups[ck] || { rows: [], aggregations: {} };
                pCols.forEach(p => {
                   if (p.type === 'aggregation') {
                      const fr = applyColRowFilters(cg.rows, p);
                      let v = 0; if (p.operation === 'count') v = fr.length; else if (fr.length > 0) { const vs = fr.map(f => parseSafeNum(getMasterValue(f, p.source))); if (p.operation==='sum') v = vs.reduce((a,b)=>a+b,0); else if (p.operation==='avg') v = vs.reduce((a,b)=>a+b,0)/vs.length; }
                      rr.push(v); rSum += v; gRes[`${ck} - ${p.displayName || p.source}`] = v;
                   }
                });
             });
             finalAOA.push(rr);
          });
          hasMT = true; columnHeaders = headers;
        } else {
          let reportData = filteredMD.map((row, index) => {
            const nr = {};
            (template.mappings || []).forEach(m => {
              if (!m.target) return;
              let v = ''; if (m.type === 'serial') v = index + 1; else v = cleanValue(getMasterValue(row, m.source), m, m.source);
              nr[m.target] = v;
            });
            return { data: nr };
          });
          columnHeaders = (template.mappings || []).filter(m => m.target).map(m => cleanFieldName(m.target));
          finalAOA.push(columnHeaders);
          reportData.forEach(item => finalAOA.push(columnHeaders.map(h => item.data[h])));
        }

        const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(finalAOA);
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        const excelBuffer = currentChartImage ? await excelJSExport(finalAOA, columnHeaders, topReportHeader, currentChartImage) : XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const fileName = (template.fileNameFormat || `${template.name}.xlsx`).replace('{date}', new Date().toISOString().slice(0,10));
        if (isSingle) saveAs(new Blob([excelBuffer], { type: 'application/octet-stream' }), fileName); else zip.file(fileName, excelBuffer);
       } catch (te) { templateErrors.push(`${template.name}: ${te.message}`); }
      }

      if (!isSingle && Object.keys(zip.files).length > 0) saveAs(await zip.generateAsync({ type: 'blob' }), `Reports_${Date.now()}.zip`);
      setStatus('Completed!');
    } catch (err) { setError(`Generation failed: ${err.message}`); } finally { setIsGenerating(false); }
  };

  const applyColRowFilters = (rows, col) => {
    if (!col.filterColumn || (!col.filterValues?.length && !col.filterValue)) return rows;
    const fvs = col.filterValues?.length ? col.filterValues.map(v => String(v).toLowerCase().trim()) : [String(col.filterValue).toLowerCase().trim()];
    return rows.filter(r => { const v = String(getMasterValue(r, col.filterColumn) || '').toLowerCase().trim(); return fvs.some(fv => v === fv || v.includes(fv)); });
  };

  const getMasterValue = (row, source) => {
    if (!source || !row) return '';
    const s = String(source).trim(); if (row[s] !== undefined) return row[s];
    const n = (st) => String(st || "").toLowerCase().replace(/[^a-z0-9]/g, '');
    const cS = n(s); const mk = Object.keys(row).find(k => n(k) === cS);
    return mk ? row[mk] : '';
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
