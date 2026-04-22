import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, getDocs, addDoc } from 'firebase/firestore';
import XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
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
  Search,
  FolderOpen,
  Tag,
  ChevronLeft,
  LayoutGrid,
  AlignLeft
} from 'lucide-react';

export default function GenerateReport() {
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0); // 0 = category selection, 1 = upload & generate
  const [selectedCategory, setSelectedCategory] = useState(null); // null = all templates
  const [masterFile, setMasterFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [tplSnap, catSnap] = await Promise.all([
          getDocs(query(collection(db, 'templates'))),
          getDocs(query(collection(db, 'reportCategories')))
        ]);
        setTemplates(tplSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const handleCategorySelect = (cat) => {
    setSelectedCategory(cat);
    setSelectedTemplates([]);
    setTemplateSearchTerm('');
    setStep(1);
  };

  const handleBackToCategories = () => {
    setStep(0);
    setSelectedCategory(null);
    setSelectedTemplates([]);
    setTemplateSearchTerm('');
    setMasterFile(null);
    setError(null);
    setStatus('');
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

  // Filter by selected category then by search term
  const filteredTemplates = templates
    .filter(t => !selectedCategory || (selectedCategory.templateIds || []).includes(t.id))
    .filter(t =>
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
      const workbook = XLSX.read(data, { type: 'array' });
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
          let fallbackStr = s.replace(/\s+-\s+/, ' ');
          let fallbackStr2 = fallbackStr.replace(/\s+-\s+/, ' '); // handle possible double dashes
          const d2 = new Date(fallbackStr2);
          if (!isNaN(d2.getTime())) return d2;
          const s2 = s.toLowerCase();
          const monthsF = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
          
          if (s2.includes('week')) {
            const m = s.match(/Week\s+(\d+)/i);
            if (m) return new Date(2000, 0, parseInt(m[1])); 
          }

          const mOnlyIdx = monthsF.findIndex(mon => mon === s2.substring(0, 3));
          if (mOnlyIdx >= 0 && s2.length <= 9 && !/\d/.test(s2)) {
             const md = new Date(); md.setMonth(mOnlyIdx); md.setDate(1); return md;
          }

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

      // Parses date strings like "Wednesday, Apr 1 - 2026 , 6:15 AM" → { year, month }
      const parseDateForMonth = (rawVal) => {
        if (!rawVal) return null;
        const s = String(rawVal).trim();
        const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        const m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2})\s*[-–]\s*(\d{4})/);
        if (m) { const idx = months.indexOf(m[1].slice(0,3).toLowerCase()); if (idx >= 0) return { year: parseInt(m[3]), month: idx }; }
        const d = parseReportDate(rawVal);
        if (d && !isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() };
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
         if (t.normalizeWeek && t.colField) dateColumns.add(t.colField);
         if (t.normalizeWeek && t.rowField) dateColumns.add(t.rowField);
         if (t.normalizeMonth && t.colField) dateColumns.add(t.colField);
         if (t.normalizeMonth && t.rowField) dateColumns.add(t.rowField);
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

      // ── Month context: resolve this_month / prev_month relative to data ──────
      const monthContext = {};
      {
        const mfCols = new Set();
        const collectMFC = (filters) => (filters || []).forEach(f => {
          if ((f.operator === 'this_month' || f.operator === 'prev_month') && f.conditionCol) mfCols.add(cleanFieldName(f.conditionCol));
        });
        targetTemplates.forEach(t => {
          collectMFC(t.globalFilters);
          collectMFC(t.outputFilters);
          (t.mappings || []).forEach(m => { collectMFC(m.columnFilters); collectMFC(m.rules); });
        });
        mfCols.forEach(col => {
          let maxYear = -Infinity, maxMonth = -1;
          masterData.forEach(row => {
            const p = parseDateForMonth(getMasterValue(row, col));
            if (p && (p.year > maxYear || (p.year === maxYear && p.month > maxMonth))) { maxYear = p.year; maxMonth = p.month; }
          });
          if (maxYear > -Infinity) {
            monthContext[col] = { endYear: maxYear, endMonth: maxMonth, prevYear: maxMonth === 0 ? maxYear - 1 : maxYear, prevMonth: maxMonth === 0 ? 11 : maxMonth - 1 };
          }
        });
      }

      // ── Not-seen context for not_seen_within_days operator ───────────────────
      const fmtLastVisit = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const notSeenContext = {};
      {
        const nsPairs = [];
        const collectNS = (filters) => (filters || []).forEach(f => {
          if (f.operator === 'not_seen_within_days' && f.conditionCol && f.groupByCol)
            nsPairs.push({ dateCol: cleanFieldName(f.conditionCol), groupByCol: cleanFieldName(f.groupByCol) });
        });
        targetTemplates.forEach(t => {
          collectNS(t.globalFilters);
          (t.mappings || []).forEach(m => {
            collectNS(m.columnFilters); collectNS(m.rules);
            if (m.type === 'last_visit_date' && m.source && m.groupByCol)
              nsPairs.push({ dateCol: cleanFieldName(m.source), groupByCol: cleanFieldName(m.groupByCol) });
          });
          (t.pivotColumns || []).forEach(p => {
            if (p.type === 'last_visit_date' && p.source && p.groupByCol)
              nsPairs.push({ dateCol: cleanFieldName(p.source), groupByCol: cleanFieldName(p.groupByCol) });
          });
          (t.sections || []).forEach(s => (s.pivotColumns || []).forEach(p => {
            if (p.type === 'last_visit_date' && p.source && p.groupByCol)
              nsPairs.push({ dateCol: cleanFieldName(p.source), groupByCol: cleanFieldName(p.groupByCol) });
          }));
        });
        nsPairs.forEach(({ dateCol, groupByCol }) => {
          const key = `${dateCol}__${groupByCol}`;
          if (notSeenContext[key]) return;
          let endDate = null;
          const lastSeen = {};
          masterData.forEach(row => {
            const d = parseReportDate(getMasterValue(row, dateCol));
            if (d && !isNaN(d.getTime())) {
              if (!endDate || d > endDate) endDate = d;
              const gv = String(getMasterValue(row, groupByCol) || '').trim();
              if (gv && (!lastSeen[gv] || d > lastSeen[gv])) lastSeen[gv] = d;
            }
          });
          if (endDate) notSeenContext[key] = { endDate, lastSeen };
        });
      }

      const evaluateCondition = (row, mapping) => {
        if (!mapping) return true;
        const toNum = (s) => parseFloat(String(s || '').replace(/,/g, '').trim());
        const evalRule = (targetVal, operator, conditionVals = [], conditionCol = '', row = null, groupByCol = '') => {
          if (operator === 'not_seen_within_days') {
            const days = parseInt(conditionVals[0]) || 3;
            const gbCol = cleanFieldName(groupByCol || '');
            const key = `${cleanFieldName(conditionCol)}__${gbCol}`;
            const ctx = notSeenContext[key];
            if (!ctx || !row || !gbCol) return false;
            const gv = String(getMasterValue(row, gbCol) || '').trim();
            if (!gv) return false;
            const ls = ctx.lastSeen[gv];
            if (!ls) return true;
            return (ctx.endDate - ls) / 86400000 > days;
          }
          if (operator === 'this_month') {
            const ctx = monthContext[cleanFieldName(conditionCol)];
            if (!ctx) return false;
            const p = parseDateForMonth(targetVal);
            return !!p && p.year === ctx.endYear && p.month === ctx.endMonth;
          }
          if (operator === 'prev_month') {
            const ctx = monthContext[cleanFieldName(conditionCol)];
            if (!ctx) return false;
            const p = parseDateForMonth(targetVal);
            return !!p && p.year === ctx.prevYear && p.month === ctx.prevMonth;
          }
          const tv = String(targetVal ?? '').toLowerCase().trim();
          const tvNum = toNum(tv);
          const evalSingle = (cv) => {
            const c = String(cv ?? '').toLowerCase().trim();
            if (operator === '==') return tv === c;
            if (operator === '!=') return tv !== c;
            if (operator === 'contains') return tv.includes(c);
            if (operator === 'not_contains') return !tv.includes(c);
            if (operator === 'between') {
              const min = toNum(conditionVals[0]);
              const max = toNum(conditionVals[1]);
              return !isNaN(tvNum) && !isNaN(min) && !isNaN(max) && tvNum >= min && tvNum <= max;
            }
            const cNum = toNum(c);
            if (operator === '>') return !isNaN(tvNum) && !isNaN(cNum) && tvNum > cNum;
            if (operator === '<') return !isNaN(tvNum) && !isNaN(cNum) && tvNum < cNum;
            if (operator === '>=') return !isNaN(tvNum) && !isNaN(cNum) && tvNum >= cNum;
            if (operator === '<=') return !isNaN(tvNum) && !isNaN(cNum) && tvNum <= cNum;
            return false;
          };
          if (operator === 'between') return evalSingle(null);
          if (operator === 'unique') return true;
          if (!conditionVals || conditionVals.length === 0) return true;
          if (operator === '!=') return conditionVals.every(c => evalSingle(c));
          return conditionVals.some(c => evalSingle(c));
        };
        if (mapping.rules && mapping.rules.length > 0) return mapping.rules.every(r => r.conditionCol ? evalRule(getMasterValue(row, r.conditionCol), r.operator, r.conditionVals, r.conditionCol, row, r.groupByCol) : true);
        return mapping.conditionCol ? evalRule(getMasterValue(row, mapping.conditionCol), mapping.operator, mapping.conditionVals, mapping.conditionCol, row, mapping.groupByCol) : true;
      };

      const applyColRowFilters = (rows, col) => {
        if (!col || !rows) return rows || [];
        let result = rows;
        if (col.rowFilters && col.rowFilters.length > 0) {
          result = result.filter(r => col.rowFilters.every(f => {
            if (!f.conditionCol) return true;
            if (f.operator === 'unique') return true; // unique handled at global level
            return evaluateCondition(r, f);
          }));
        }
        return result;
      };

      const applyColValueFilters = (rows, col) => {
        if (!col || !rows || !col.valueFilters || col.valueFilters.length === 0) return rows;
        const toNum = (s) => parseFloat(String(s ?? '').replace(/,/g, '').trim());
        return rows.filter(row => col.valueFilters.every(vf => {
          const raw = getMasterValue(row, col.source);
          const tv = String(raw ?? '').toLowerCase().trim();
          const tvNum = toNum(tv);
          const val = String(vf.value ?? '').toLowerCase().trim();
          if (vf.operator === '==') return tv === val;
          if (vf.operator === '!=') return tv !== val;
          if (vf.operator === 'contains') return tv.includes(val);
          if (vf.operator === 'between') {
            const min = toNum(vf.value), max = toNum(vf.valueTo);
            return !isNaN(tvNum) && !isNaN(min) && !isNaN(max) && tvNum >= min && tvNum <= max;
          }
          const cNum = toNum(val);
          if (vf.operator === '>') return !isNaN(tvNum) && !isNaN(cNum) && tvNum > cNum;
          if (vf.operator === '<') return !isNaN(tvNum) && !isNaN(cNum) && tvNum < cNum;
          if (vf.operator === '>=') return !isNaN(tvNum) && !isNaN(cNum) && tvNum >= cNum;
          if (vf.operator === '<=') return !isNaN(tvNum) && !isNaN(cNum) && tvNum <= cNum;
          return true;
        }));
      };

      const cleanValue = (val, config, colName) => {
        const isBlank = val === undefined || val === null || String(val).trim() === '';
        if (isBlank) {
          if (config && config.replaceWith !== undefined && config.replaceWith !== null && String(config.replaceWith).trim() !== '') {
            return String(config.replaceWith).trim();
          }
          return '';
        }
        if (!config) return String(val).trim();
        let cleaned = String(val).trim();
        let dateObj = (config.normalizeMonth || config.normalizeWeek || config.simplifyDate) ? parseReportDate(val) : null;
        if (config.simplifyDate) {
          if (dateObj && !isNaN(dateObj.getTime())) {
            cleaned = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          } else {
            const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) cleaned = parts.length > 2 ? parts[1] : parts[0];
          }
        }
        if (config.simplifyTime) {
          const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
          if (parts.length >= 2) cleaned = parts[parts.length - 1];
        }
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

      const parseTimeValue = (val) => {
        if (val === undefined || val === null || val === '') return null;
        // Excel stores time-only as a fractional day in [0, 1)
        if (typeof val === 'number') {
          if (val >= 0 && val < 1) return val * 24 * 60 * 60 * 1000;
          return val;
        }
        const s = String(val).trim();
        if (s === '') return null;
        const num = Number(s);
        if (!isNaN(num)) {
          if (num >= 0 && num < 1) return num * 24 * 60 * 60 * 1000;
          return num;
        }
        // HH:MM AM/PM or H:MM AM/PM
        const ampm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
        if (ampm) {
          let h = parseInt(ampm[1], 10);
          const m = parseInt(ampm[2], 10);
          const sec = ampm[3] ? parseInt(ampm[3], 10) : 0;
          if (ampm[4].toUpperCase() === 'PM' && h !== 12) h += 12;
          if (ampm[4].toUpperCase() === 'AM' && h === 12) h = 0;
          return h * 3600000 + m * 60000 + sec * 1000;
        }
        // HH:MM or HH:MM:SS (24-hour)
        const parts = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (parts) {
          return parseInt(parts[1], 10) * 3600000 + parseInt(parts[2], 10) * 60000 + (parts[3] ? parseInt(parts[3], 10) * 1000 : 0);
        }
        const date = new Date(s);
        if (!isNaN(date.getTime())) return date.getTime();
        return null;
      };

      const formatDuration = (minutes) => {
        const total = Math.round(minutes);
        const sign = total < 0 ? '-' : '';
        const absMinutes = Math.abs(total);
        const h = Math.floor(absMinutes / 60);
        const m = absMinutes % 60;
        return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      const evaluateReportFormula = (formula, row, rowContext = {}) => {
        if (!formula) return '';
        try {
          let f = formula;
          f = f.replace(/\{([^}]+)\}/g, (match, token) => {
            const key = token.trim();
            const exact = Object.keys(rowContext).find(k => String(k).trim().toLowerCase() === key.toLowerCase());
            const value = exact ? rowContext[exact] : rowContext[key];
            const str = value === undefined || value === null || value === '' ? '0' : String(value);
            return str.replace(/,/g, '');
          });
          f = f.replace(/\[([^\]]+)\]/g, (match, token) => {
            const val = getMasterValue(row, token);
            return val === undefined || val === null || val === '' ? '0' : String(val).replace(/,/g, '');
          });
          const result = new Function('Math', `return (${f})`)(Math);
          return (result === undefined || result === null || isNaN(result)) ? '' : result;
        } catch (err) {
          return '';
        }
      };

      const resolveReportMappingValue = (row, index, mapping, rowContext = {}) => {
        if (!mapping) return '';
        // Column-level conditions: blank this cell if the row fails any condition
        if (mapping.columnFilters && mapping.columnFilters.length > 0) {
          const passes = mapping.columnFilters.every(f => !f.conditionCol || evaluateCondition(row, f));
          if (!passes) return '';
        }
        const type = mapping.type || 'direct';
        const sourceField = mapping.source || mapping.sourceCol || mapping.target || '';
        if (type === 'serial') return index + 1;
        if (type === 'count') {
          return String(getMasterValue(row, sourceField)).trim() ? 1 : 0;
        }
        if (type === 'condition_count') {
          return evaluateCondition(row, mapping) ? 1 : 0;
        }
        if (type === 'math') {
          const value = evaluateReportFormula(mapping.formula, row, rowContext);
          return cleanValue(value, mapping, sourceField);
        }
        if (type === 'time_diff') {
          const start = parseTimeValue(getMasterValue(row, mapping.colB || mapping.colA || sourceField));
          const end = parseTimeValue(getMasterValue(row, mapping.colA || mapping.colB || sourceField));
          if (start === null || end === null) return '';
          const diffMinutes = Math.round((end - start) / 60000);
          const threshold = parseFloat(mapping.threshold) || 0;
          switch (mapping.outType) {
            case 'duration_hhmm': return formatDuration(diffMinutes);
            case 'duration_mins': return diffMinutes;
            case 'exceeds_yn': return diffMinutes > threshold ? 'Yes' : 'No';
            case 'excess_mins': return Math.max(0, diffMinutes - threshold);
            case 'excess_hhmm': return formatDuration(Math.max(0, diffMinutes - threshold));
            case 'remaining_mins': return Math.max(0, threshold - diffMinutes);
            case 'remaining_hhmm': return formatDuration(Math.max(0, threshold - diffMinutes));
            default: return formatDuration(diffMinutes);
          }
        }
        if (type === 'last_visit_date') {
          const dateCol = cleanFieldName(sourceField);
          const gbCol = cleanFieldName(mapping.groupByCol || '');
          const ctx = notSeenContext[`${dateCol}__${gbCol}`];
          if (!ctx || !gbCol) return '';
          const gv = String(getMasterValue(row, mapping.groupByCol || '') || '').trim();
          const ls = gv ? ctx.lastSeen[gv] : null;
          return ls ? fmtLastVisit(ls) : '';
        }
        return cleanValue(getMasterValue(row, sourceField), mapping, sourceField);
      };
      
      const excelJSExport = async (fAOA, colHdrs, tHdr, layouts = [], highlightEmpty = true, mergeColIndices = []) => {
        const workbook = new ExcelJS.Workbook(); const worksheet = workbook.addWorksheet('Report');
        let currR = 1;
        if (tHdr) { const mergeEnd = Math.max(1, colHdrs.length, (fAOA[0] || []).length); worksheet.mergeCells(1, 1, 1, mergeEnd); const c = worksheet.getCell(1, 1); c.value = tHdr; c.font = { bold: true, size: 14 }; c.alignment = { horizontal: 'center' }; currR = 2; }
        if (layouts.length > 0) { layouts.forEach(layout => { if (layout.width > 1) worksheet.mergeCells(currR, layout.startCol, currR, layout.startCol + layout.width - 1); }); }
        const numCols = (fAOA[0] || []).length;
        fAOA.forEach((row, idx) => {
          const excelRow = worksheet.getRow(currR + idx);
          excelRow.values = row.map(v => (v && typeof v === 'object' && v.v !== undefined) ? v.v : v);
          const isHeader = (layouts.length > 0) ? (idx === 0 || idx === 1) : idx === 0;
          for (let col = 1; col <= numCols; col++) {
            const c = excelRow.getCell(col);
            c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            if (layouts.length > 0) {
              if (idx === 1) { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; }
              else if (idx === 0) { c.font = { bold: true, size: 11 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; }
              else if (!isHeader && highlightEmpty && (c.value === '' || c.value === null || c.value === undefined)) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCD5C5C' } }; }
            } else {
              if (idx === 0) { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; }
              else if (!isHeader && highlightEmpty && (c.value === '' || c.value === null || c.value === undefined)) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCD5C5C' } }; }
            }
          }
        });
        // Merge consecutive identical values in columns marked enableMerging
        if (mergeColIndices.length > 0 && fAOA.length > 2) {
          const dataStart = 1; // fAOA index of first data row (0 = header)
          mergeColIndices.forEach(colIdx => {
            const excelCol = colIdx + 1;
            let runStart = dataStart;
            let runVal = fAOA[dataStart] ? fAOA[dataStart][colIdx] : undefined;
            for (let i = dataStart + 1; i < fAOA.length; i++) {
              const val = fAOA[i][colIdx];
              const sameVal = val === runVal && val !== '' && val !== null && val !== undefined;
              if (!sameVal) {
                if (i - runStart > 1) {
                  try { worksheet.mergeCells(currR + runStart, excelCol, currR + i - 1, excelCol); } catch (_) {}
                }
                runStart = i;
                runVal = val;
              }
            }
            // flush last run
            if (fAOA.length - 1 - runStart > 0) {
              try { worksheet.mergeCells(currR + runStart, excelCol, currR + fAOA.length - 1, excelCol); } catch (_) {}
            }
          });
        }
        worksheet.columns.forEach(c => c.width = 25);
        return await workbook.xlsx.writeBuffer();
      };

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
          const result = new Function('return (' + f + ')')();
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
              return { id: col.id, mode: col.displayMode, cur, total, conv, isCalculated: false, isConsultation: !!col.isConsultation };
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

      // ── Multi-table helper: generate AOA for one section ──────────────────
      const generatePivotSectionAOA = (section, sectionData) => {
        const sAOA = [];
        let pCols = [...(section.pivotColumns || [])];
        const rowField = section.rowField || '';
        const colField = section.colField || '';
        const isPG = !!rowField;
        if (colField) pCols = pCols.filter(p => p.type === 'aggregation' || p.type === 'formula' || p.type === 'last_visit_date');
        if (rowField) {
          const rfKey = cleanFieldName(rowField).toLowerCase();
          pCols = pCols.filter(p => !((p.type === 'property' || p.type === 'grouping') && cleanFieldName(p.source || '').toLowerCase() === rfKey));
        }
        const rowTx = section.rowFieldTransforms || {};
        const colTx = section.colFieldTransforms || {};
        const rowsByGroup = {};
        sectionData.forEach(r => {
          const rawGk = isPG ? String(getMasterValue(r, rowField) || '').trim() : '_default';
          const gk = isPG ? (cleanValue(getMasterValue(r, rowField), rowTx, rowField) || rawGk) : '_default';
          if (!rowsByGroup[gk]) rowsByGroup[gk] = { firstRow: r, colGroups: {} };
          const ck = colField ? (cleanValue(getMasterValue(r, colField), colTx, colField) || String(getMasterValue(r, colField) || '').trim()) : '_default';
          if (!rowsByGroup[gk].colGroups[ck]) rowsByGroup[gk].colGroups[ck] = { rows: [] };
          rowsByGroup[gk].colGroups[ck].rows.push(r);
        });
        let allColKs = colField ? Array.from(new Set(sectionData.map(r => cleanValue(getMasterValue(r, colField), colTx, colField) || String(getMasterValue(r, colField) || '').trim()))) : ['_default'];
        if (colField) allColKs.sort((a, b) => { const dA = parseReportDate(a), dB = parseReportDate(b); return (dA && dB) ? dA.getTime() - dB.getTime() : a.localeCompare(b, undefined, { numeric: true }); });
        const rowLabel = section.rowFieldDisplayName || rowField || 'Group';
        const headers = [rowLabel];
        if (colField) allColKs.forEach(ck => pCols.forEach(p => headers.push(`${ck} - ${p.displayName || p.source}`)));
        else pCols.forEach(p => headers.push(p.displayName || p.source || 'Untitled'));
        if (section.isRowTotalEnabled && colField) pCols.forEach(p => headers.push(`Row Total - ${p.displayName || p.source}`));
        sAOA.push(headers);
        const sApplyDedup = (rows, p) => {
          if (!p.isUniqueCount || !p.dedupColumn) return rows;
          const seen = new Set();
          return rows.filter(row => { const k = String(getMasterValue(row, p.dedupColumn) || '').trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
        };
        const sComputeAgg = (fr, p, ctx, isTotal = false) => {
          let v;
          if (p.type === 'formula') { v = evaluateReportFormula(p.formula, fr[0] || {}, ctx); }
          else if (p.type === 'aggregation') {
            if (fr.length === 0) { v = ''; } else {
              v = 0; const op = p.operation;
              if (op === 'count') v = fr.length;
              else if (op === 'count_single') v = fr.filter(r => !String(getMasterValue(r, p.source) || '').includes('/')).length;
              else if (op === 'count_multi') v = fr.filter(r => String(getMasterValue(r, p.source) || '').includes('/')).length;
              else if (op === 'count_unique') { const dc = p.dedupColumn || p.source; const seen = new Set(); fr.forEach(r => { const k = String(getMasterValue(r, dc) || '').trim(); if (k) seen.add(k); }); v = seen.size; }
              else { const vs = fr.map(r => parseSafeNum(getMasterValue(r, p.source))); if (op === 'sum') v = vs.reduce((a, b) => a + b, 0); else if (op === 'avg') v = vs.reduce((a, b) => a + b, 0) / vs.length; else if (op === 'min') v = Math.min(...vs); else if (op === 'max') v = Math.max(...vs); }
            }
          } else if (p.type === 'last_visit_date') {
            let maxD = null;
            fr.forEach(r => { const d = parseReportDate(getMasterValue(r, p.source)); if (d && !isNaN(d.getTime()) && (!maxD || d > maxD)) maxD = d; });
            v = maxD ? fmtLastVisit(maxD) : '';
          } else { v = (!isTotal && fr.length > 0) ? getMasterValue(fr[0], p.source) : ''; }
          const key = p.displayName || p.source || ''; if (key) ctx[key] = v; return v;
        };
        Object.entries(rowsByGroup).forEach(([gk, rg]) => {
          const rr = [gk === '_default' ? '' : gk];
          allColKs.forEach(ck => {
            const cg = rg.colGroups[ck] || { rows: [] }; const ctx = {};
            pCols.forEach(p => { const fr = sApplyDedup(applyColValueFilters(applyColRowFilters(cg.rows, p), p), p); rr.push(sComputeAgg(fr, p, ctx)); });
          });
          if (section.isRowTotalEnabled && colField) {
            const all = Object.values(rg.colGroups).flatMap(cg => cg.rows); const ctx = {};
            pCols.forEach(p => { const fr = sApplyDedup(applyColValueFilters(applyColRowFilters(all, p), p), p); const v = sComputeAgg(fr, p, ctx, true); rr.push(p.showTotal === false ? '' : v); });
          }
          sAOA.push(rr);
        });
        if (section.isOutputFilterEnabled !== false && section.outputFilters?.length > 0) {
          const hdr = sAOA[0];
          const filtered = sAOA.slice(1).filter(row => {
            const rowObj = {}; hdr.forEach((h, i) => { if (h != null) rowObj[h] = row[i]; });
            return section.outputFilters.every(of => {
              if (!of.conditionCol) return true;
              if (rowObj[of.conditionCol] !== undefined) return evaluateCondition(rowObj, of);
              const suffix = ` - ${of.conditionCol}`; const matchKeys = hdr.filter(h => h && h.endsWith(suffix));
              if (matchKeys.length === 0) return true;
              return matchKeys.some(k => evaluateCondition({ [of.conditionCol]: rowObj[k] }, of));
            });
          });
          sAOA.splice(0, sAOA.length, hdr, ...filtered);
        }
        if (section.isPivotSummaryEnabled) {
          const hdrGT = sAOA[0]; const dataRowsGT = sAOA.slice(1); const hdrToPCol = {};
          if (!colField) { pCols.forEach(p => { hdrToPCol[p.displayName || p.source || 'Untitled'] = p; }); }
          else { allColKs.forEach(ck => pCols.forEach(p => { hdrToPCol[`${ck} - ${p.displayName || p.source}`] = p; })); if (section.isRowTotalEnabled) pCols.forEach(p => { hdrToPCol[`Row Total - ${p.displayName || p.source}`] = p; }); }
          const totalRow = hdrGT.map((h, ci) => {
            if (ci === 0) return 'Grand Total'; const p = hdrToPCol[h]; if (p && p.showTotal === false) return '';
            const numVals = dataRowsGT.map(r => r[ci]).filter(v => typeof v === 'number');
            return numVals.length > 0 ? numVals.reduce((a, b) => a + b, 0) : '';
          });
          sAOA.push(totalRow);
        }
        return sAOA;
      };

      // ── Multi-table Excel export ──────────────────────────────────────────
      const exportMultiSectionExcel = async (sectionInfos, topHeader, layout) => {
        const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Report');
        const thin = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        const applyS = (c, opts = {}) => {
          c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = thin;
          if (opts.bold) c.font = { bold: true, size: opts.size || 11 };
          if (opts.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
        };
        let currR = 1;
        if (topHeader) {
          const totalCols = layout === 'horizontal'
            ? sectionInfos.reduce((s, si) => s + ((si.aoa[0] || []).length || 1), 0) + Math.max(0, sectionInfos.length - 1)
            : Math.max(...sectionInfos.map(si => (si.aoa[0] || []).length || 1), 1);
          if (totalCols > 1) try { ws.mergeCells(currR, 1, currR, totalCols); } catch (_) {}
          const c = ws.getCell(currR, 1); c.value = topHeader; applyS(c, { bold: true, size: 14, fill: 'FFF8FAFF' });
          ws.getRow(currR).height = 28; currR++;
        }
        if (layout === 'horizontal') {
          const offsets = []; let off = 1;
          sectionInfos.forEach(si => { offsets.push(off); off += ((si.aoa[0] || []).length || 1) + 1; });
          const titleR = currR; const dataStartR = currR + 1;
          sectionInfos.forEach((si, idx) => {
            const { title, aoa } = si; const numCols = (aoa[0] || []).length || 1; const colStart = offsets[idx];
            if (title) {
              if (numCols > 1) try { ws.mergeCells(titleR, colStart, titleR, colStart + numCols - 1); } catch (_) {}
              const c = ws.getCell(titleR, colStart); c.value = title; applyS(c, { bold: true, size: 12, fill: 'FFE2E8F0' });
            }
            aoa.forEach((row, ri) => {
              const exRow = ws.getRow(dataStartR + ri);
              row.forEach((val, ci) => {
                const c = exRow.getCell(colStart + ci); c.value = (val && typeof val === 'object' && val.v !== undefined) ? val.v : val;
                applyS(c, ri === 0 ? { bold: true, fill: 'FFF1F5F9' } : {});
              });
            });
          });
          let c = 1; sectionInfos.forEach(si => { const n = (si.aoa[0] || []).length || 1; for (let i = 0; i < n; i++) ws.getColumn(c + i).width = 25; c += n + 1; });
        } else {
          sectionInfos.forEach((si, idx) => {
            const { title, aoa } = si; const numCols = (aoa[0] || []).length || 1;
            if (title) {
              if (numCols > 1) try { ws.mergeCells(currR, 1, currR, numCols); } catch (_) {}
              const c = ws.getCell(currR, 1); c.value = title; applyS(c, { bold: true, size: 12, fill: 'FFE2E8F0' });
              ws.getRow(currR).height = 22; currR++;
            }
            aoa.forEach((row, ri) => {
              const exRow = ws.getRow(currR); exRow.values = row.map(v => (v && typeof v === 'object' && v.v !== undefined) ? v.v : v);
              for (let col = 1; col <= numCols; col++) applyS(exRow.getCell(col), ri === 0 ? { bold: true, fill: 'FFF1F5F9' } : {});
              currR++;
            });
            if (idx < sectionInfos.length - 1) currR++;
          });
          ws.columns.forEach(c => c.width = 25);
        }
        return await wb.xlsx.writeBuffer();
      };

      const applyFinalSort = (aoa, sortConfig) => {
        if (!sortConfig?.enabled || !sortConfig.column) return aoa;
        const hdr = aoa[0];
        if (!hdr || aoa.length <= 1) return aoa;
        const colIdx = hdr.indexOf(sortConfig.column);
        if (colIdx < 0) return aoa;
        const dataRows = aoa.slice(1);
        const isDesc = sortConfig.direction === 'desc';
        const type = sortConfig.type || 'auto';
        dataRows.sort((a, b) => {
          const av = a[colIdx], bv = b[colIdx];
          let cmp;
          if (type === 'numeric') {
            cmp = (parseFloat(String(av ?? '').replace(/,/g, '')) || 0) - (parseFloat(String(bv ?? '').replace(/,/g, '')) || 0);
          } else if (type === 'alpha') {
            cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' });
          } else {
            const an = parseFloat(String(av ?? '').replace(/,/g, '')), bn = parseFloat(String(bv ?? '').replace(/,/g, ''));
            const aStr = String(av ?? '').trim(), bStr = String(bv ?? '').trim();
            if (!isNaN(an) && !isNaN(bn) && aStr !== '' && bStr !== '') cmp = an - bn;
            else cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' });
          }
          return isDesc ? -cmp : cmp;
        });
        return [hdr, ...dataRows];
      };

      for (const template of targetTemplates) {
        try {
          setStatus(`Generating ${template.name || 'Untitled'}...`);
          if (template.type === 'scoreboard') {
            const sbBuffer = await generateScoreboardReport(template);
            const sbFileName = `${(template.name || 'ScoreBoard').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
            const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            if (isSingle) saveAs(new Blob([sbBuffer], { type: excelMimeType }), sbFileName);
            else zip.file(sbFileName, sbBuffer);
            continue;
          }

          let topReportHeader = template.isHeaderEnabled && template.headerConfig ? (template.headerConfig.type === 'custom' ? template.headerConfig.text : (masterData.length > 0 ? getMasterValue(masterData[0], template.headerConfig.sourceCol) : '')) : null;
          let finalAOA = [], columnHeaders = [];

          let filteredMD = [...masterData];
          // Collect excluded columns (mode === 'exclude' filters don't filter rows, they exclude columns from output)
          const excludedCols = new Set(
            (template.isGlobalFilterEnabled !== false ? (template.globalFilters || []) : [])
              .filter(gf => gf.mode === 'exclude' && gf.conditionCol)
              .map(gf => cleanFieldName(gf.conditionCol))
          );
          if (template.isGlobalFilterEnabled !== false && template.globalFilters?.length > 0) {
            template.globalFilters.forEach(gf => {
              if (!gf.conditionCol || gf.mode === 'exclude') return;
              if (gf.operator === 'unique') {
                const seen = new Set();
                filteredMD = filteredMD.filter(r => {
                  const k = String(getMasterValue(r, gf.conditionCol) ?? '').trim();
                  if (seen.has(k)) return false;
                  seen.add(k); return true;
                });
              } else if (gf.operator === 'not_seen_within_days' && gf.groupByCol) {
                filteredMD = filteredMD.filter(r => evaluateCondition(r, gf));
                const bestRows = {};
                filteredMD.forEach(r => {
                  const gv = String(getMasterValue(r, gf.groupByCol) || '').trim();
                  if (!gv) return;
                  const d = parseReportDate(getMasterValue(r, gf.conditionCol));
                  if (!bestRows[gv] || (d && (!bestRows[gv].d || d > bestRows[gv].d))) bestRows[gv] = { row: r, d };
                });
                filteredMD = Object.values(bestRows).map(x => x.row);
              } else {
                filteredMD = filteredMD.filter(r => evaluateCondition(r, gf));
              }
            });
          }
          if (template.mappings?.filter(m => m.type === 'condition' && m.conditionCol).length > 0) filteredMD = filteredMD.filter(r => template.mappings.filter(m => m.type === 'condition' && m.conditionCol).every(m => evaluateCondition(r, m)));

          if (template.type === 'pivot') {
            let pCols = [...(template.pivotColumns || [])];
            if (pCols.length === 0 && template.valueFields?.length > 0) pCols = template.valueFields.map((vf, i) => ({ id: `leg-${i}`, type: 'aggregation', ...vf }));
            const rowField = template.rowField, colField = template.colField, isPG = !!rowField;
            // When colField is set (cross-tab mode), property/grouping columns repeat under every
            // column group which duplicates the row label — only aggregation & formula make sense.
            if (colField) pCols = pCols.filter(p => p.type === 'aggregation' || p.type === 'formula' || p.type === 'last_visit_date');
            if (excludedCols.size > 0) pCols = pCols.filter(p => !excludedCols.has(cleanFieldName(p.source || '')));
            // Remove property/grouping columns that duplicate the rowField (row label already shown as first column)
            if (rowField) {
              const rowFieldKey = cleanFieldName(rowField).toLowerCase();
              pCols = pCols.filter(p => !((p.type === 'property' || p.type === 'grouping') && cleanFieldName(p.source || '').toLowerCase() === rowFieldKey));
            }
            const rowTx = template.rowFieldTransforms || {};
            const colTx = template.colFieldTransforms || {};
            const rowsByGroup = {};
            filteredMD.forEach(r => {
              const rawGk = isPG ? String(getMasterValue(r, rowField) || '').trim() : '_default';
              const gk = isPG ? (cleanValue(getMasterValue(r, rowField), rowTx, rowField) || rawGk) : '_default';
              if (!rowsByGroup[gk]) rowsByGroup[gk] = { firstRow: r, colGroups: {} };
              const ck = colField ? (cleanValue(getMasterValue(r, colField), colTx, colField) || String(getMasterValue(r, colField) || '').trim()) : '_default';
              if (!rowsByGroup[gk].colGroups[ck]) rowsByGroup[gk].colGroups[ck] = { rows: [], aggregations: {} };
              rowsByGroup[gk].colGroups[ck].rows.push(r);
            });
            let allColKs = colField ? Array.from(new Set(filteredMD.map(r => cleanValue(getMasterValue(r, colField), colTx, colField) || String(getMasterValue(r, colField) || '').trim()))) : ['_default'];
            if (colField) allColKs.sort((a,b) => { const dA = parseReportDate(a), dB = parseReportDate(b); return (dA && dB) ? dA.getTime() - dB.getTime() : a.localeCompare(b, undefined, { numeric: true }); });
            
            const headers = [rowField || 'Group'];
            if (colField) allColKs.forEach(ck => pCols.forEach(p => headers.push(`${ck} - ${p.displayName || p.source}`)));
            else pCols.forEach(p => headers.push(p.displayName || p.source || 'Untitled'));
            if (template.isRowTotalEnabled && colField) pCols.forEach(p => headers.push(`Row Total - ${p.displayName || p.source}`));
            finalAOA.push(headers);

            const applyDedup = (rows, p) => {
              if (!p.isUniqueCount || !p.dedupColumn) return rows;
              const seen = new Set();
              return rows.filter(row => {
                const k = String(getMasterValue(row, p.dedupColumn) || '').trim();
                if (!k || seen.has(k)) return false;
                seen.add(k); return true;
              });
            };

            // Compute a single pivot column value; updates rowContext so later formula columns can reference it.
            // isTotal=true: property/grouping columns return '' (no first-row value in summary rows)
            const computePivotAgg = (fr, p, rowContext, isTotal = false) => {
              let v;
              if (p.type === 'formula') {
                v = evaluateReportFormula(p.formula, fr[0] || {}, rowContext);
              } else if (p.type === 'aggregation') {
                if (fr.length === 0) { v = ''; }
                else {
                  v = 0;
                  const op = p.operation;
                  if (op === 'count') v = fr.length;
                  else if (op === 'count_single') v = fr.filter(r => !String(getMasterValue(r, p.source) || '').includes('/')).length;
                  else if (op === 'count_multi') v = fr.filter(r => String(getMasterValue(r, p.source) || '').includes('/')).length;
                  else if (op === 'count_unique') {
                    const dedupCol = p.dedupColumn || p.source;
                    const seen = new Set();
                    fr.forEach(r => { const k = String(getMasterValue(r, dedupCol) || '').trim(); if (k) seen.add(k); });
                    v = seen.size;
                  } else {
                    const vs = fr.map(r => parseSafeNum(getMasterValue(r, p.source)));
                    if (op === 'sum') v = vs.reduce((a, b) => a + b, 0);
                    else if (op === 'avg') v = vs.reduce((a, b) => a + b, 0) / vs.length;
                    else if (op === 'min') v = Math.min(...vs);
                    else if (op === 'max') v = Math.max(...vs);
                  }
                }
              } else if (p.type === 'last_visit_date') {
                let maxD = null;
                fr.forEach(r => { const d = parseReportDate(getMasterValue(r, p.source)); if (d && !isNaN(d.getTime()) && (!maxD || d > maxD)) maxD = d; });
                v = maxD ? fmtLastVisit(maxD) : '';
              } else {
                // property / grouping — never show a data value in total rows
                v = (!isTotal && fr.length > 0) ? getMasterValue(fr[0], p.source) : '';
              }
              const key = p.displayName || p.source || '';
              if (key) rowContext[key] = v;
              return v;
            };

            Object.entries(rowsByGroup).forEach(([gk, rg]) => {
              const rr = [gk];
              allColKs.forEach(ck => {
                const cg = rg.colGroups[ck] || { rows: [], aggregations: {} };
                const rowContext = {};
                pCols.forEach(p => {
                  const fr = applyDedup(applyColValueFilters(applyColRowFilters(cg.rows, p), p), p);
                  rr.push(computePivotAgg(fr, p, rowContext));
                });
              });
              if (template.isRowTotalEnabled && colField) {
                const allRowsForGroup = Object.values(rg.colGroups).flatMap(cg => cg.rows);
                const rowTotalContext = {};
                pCols.forEach(p => {
                  const fr = applyDedup(applyColValueFilters(applyColRowFilters(allRowsForGroup, p), p), p);
                  const v = computePivotAgg(fr, p, rowTotalContext, true);
                  rr.push(p.showTotal === false ? '' : v);
                });
              }
              finalAOA.push(rr);
            });

            if (template.isOutputFilterEnabled !== false && template.outputFilters?.length > 0) {
              const hdr = finalAOA[0];
              const filteredRows = finalAOA.slice(1).filter(row => {
                const rowObj = {};
                hdr.forEach((h, i) => { if (h != null) rowObj[h] = row[i]; });
                return template.outputFilters.every(of => {
                  if (!of.conditionCol) return true;
                  if (rowObj[of.conditionCol] !== undefined) return evaluateCondition(rowObj, of);
                  // Cross-tab: match headers ending with " - {conditionCol}"
                  const suffix = ` - ${of.conditionCol}`;
                  const matchKeys = hdr.filter(h => h && h.endsWith(suffix));
                  if (matchKeys.length === 0) return true;
                  return matchKeys.some(k => evaluateCondition({ [of.conditionCol]: rowObj[k] }, of));
                });
              });
              finalAOA = [hdr, ...filteredRows];
            }

            finalAOA = applyFinalSort(finalAOA, template.sortConfig);

            if (template.isPivotSummaryEnabled) {
              // Build grand total by summing the already-filtered data rows in finalAOA.
              // This ensures output-filtered reports (e.g. "Balance > 0") show totals that
              // match what is visible, not totals across the entire master dataset.
              const hdrGT = finalAOA[0];
              const dataRowsGT = finalAOA.slice(1);

              // Map each header position → its pCol (to respect showTotal === false)
              const hdrToPCol = {};
              if (!colField) {
                pCols.forEach(p => { hdrToPCol[p.displayName || p.source || 'Untitled'] = p; });
              } else {
                allColKs.forEach(ck => pCols.forEach(p => { hdrToPCol[`${ck} - ${p.displayName || p.source}`] = p; }));
                if (template.isRowTotalEnabled) pCols.forEach(p => { hdrToPCol[`Row Total - ${p.displayName || p.source}`] = p; });
              }

              const totalRow = hdrGT.map((h, colIdx) => {
                if (colIdx === 0) return 'Grand Total';
                const p = hdrToPCol[h];
                if (p && p.showTotal === false) return '';
                // Sum numeric values from filtered data rows
                const numVals = dataRowsGT.map(r => r[colIdx]).filter(v => typeof v === 'number');
                return numVals.length > 0 ? numVals.reduce((a, b) => a + b, 0) : '';
              });
              finalAOA.push(totalRow);
            }

            columnHeaders = headers;
            const excelBuffer = await excelJSExport(finalAOA, columnHeaders, topReportHeader, [], false);
            let fileName = (template.fileNameFormat || `{name}.xlsx`).replace('{name}', template.name || 'Report').replace('{date}', new Date().toISOString().slice(0, 10));
            if (!fileName.toLowerCase().endsWith('.xlsx')) fileName += '.xlsx';
            const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            if (isSingle) saveAs(new Blob([excelBuffer], { type: excelMimeType }), fileName); else zip.file(fileName, excelBuffer);
          } else if (template.type === 'multi_table') {
            const sectionInfos = [];
            for (const section of (template.sections || [])) {
              let sectionData = [...masterData];
              if (section.isGlobalFilterEnabled !== false && section.globalFilters?.length > 0) {
                section.globalFilters.forEach(gf => {
                  if (!gf.conditionCol || gf.mode === 'exclude') return;
                  if (gf.operator === 'unique') {
                    const seen = new Set();
                    sectionData = sectionData.filter(r => { const k = String(getMasterValue(r, gf.conditionCol) ?? '').trim(); if (seen.has(k)) return false; seen.add(k); return true; });
                  } else if (gf.operator === 'not_seen_within_days' && gf.groupByCol) {
                    sectionData = sectionData.filter(r => evaluateCondition(r, gf));
                    const bestRows = {};
                    sectionData.forEach(r => {
                      const gv = String(getMasterValue(r, gf.groupByCol) || '').trim();
                      if (!gv) return;
                      const d = parseReportDate(getMasterValue(r, gf.conditionCol));
                      if (!bestRows[gv] || (d && (!bestRows[gv].d || d > bestRows[gv].d))) bestRows[gv] = { row: r, d };
                    });
                    sectionData = Object.values(bestRows).map(x => x.row);
                  } else { sectionData = sectionData.filter(r => evaluateCondition(r, gf)); }
                });
              }
              sectionInfos.push({ title: section.title || '', aoa: generatePivotSectionAOA(section, sectionData) });
            }
            const topHdr = template.isHeaderEnabled && template.headerConfig?.text ? template.headerConfig.text : null;
            const mtBuffer = await exportMultiSectionExcel(sectionInfos, topHdr, template.layout || 'vertical');
            let mtFileName = (template.fileNameFormat || `{name}.xlsx`).replace('{name}', template.name || 'Report').replace('{date}', new Date().toISOString().slice(0, 10));
            if (!mtFileName.toLowerCase().endsWith('.xlsx')) mtFileName += '.xlsx';
            const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            if (isSingle) saveAs(new Blob([mtBuffer], { type: excelMimeType }), mtFileName); else zip.file(mtFileName, mtBuffer);
          } else {
            const activeMappings = (template.mappings || [])
              .filter(m => {
                if (!m) return false;
                if (m.type === 'serial') return !!cleanFieldName(m.target || '');
                return !!(cleanFieldName(m.source || '') || cleanFieldName(m.target || '') || m.formula || m.colA || m.colB);
              })
              .filter(m => {
                const colName = cleanFieldName(m.source || m.target || '');
                return !excludedCols.has(colName);
              });
            const useFallback = activeMappings.length === 0 && filteredMD.length > 0;

            let reportData;
            if (useFallback) {
              columnHeaders = Object.keys(filteredMD[0]).filter(k => {
                const cleaned = cleanFieldName(k);
                return cleaned !== '' && !String(k).startsWith('__') && !excludedCols.has(cleaned);
              });
              reportData = filteredMD.map(row => {
                const data = {};
                columnHeaders.forEach(h => { data[h] = row[h] !== undefined ? row[h] : ''; });
                return { data };
              });
            } else {
              reportData = filteredMD.map((row, index) => {
                const nr = {};
                const rowContext = {};
                activeMappings.forEach((m, mappingIndex) => {
                  const rawTarget = m.target || m.source || `Column${mappingIndex + 1}`;
                  const targetKey = String(rawTarget).trim() || `Column${mappingIndex + 1}`;
                  const cleanTargetKey = cleanFieldName(targetKey) || `Column${mappingIndex + 1}`;
                  const value = resolveReportMappingValue(row, index, m, rowContext);
                  nr[cleanTargetKey] = value;
                  rowContext[targetKey] = value;
                  rowContext[cleanTargetKey] = value;
                });
                return { data: nr };
              });
              columnHeaders = activeMappings.map((m, mappingIndex) => {
                const rawTarget = m.target || m.source || `Column${mappingIndex + 1}`;
                return cleanFieldName(rawTarget) || `Column${mappingIndex + 1}`;
              });
            }

            // Strip any empty-string headers that slipped through
            const validHeaders = columnHeaders.filter(h => h !== null && h !== undefined && cleanFieldName(String(h)) !== '');
            columnHeaders = validHeaders;

            // Group-aggregate by merge columns, then sort for contiguous visual merging
            if (!useFallback) {
              const mergeSortKeys = activeMappings
                .filter(m => m.enableMerging)
                .map(m => cleanFieldName(m.target || m.source || '') || '');

              if (mergeSortKeys.length > 0) {
                // Collapse rows sharing the same merge-column values into one row,
                // summing count/condition_count columns across the group.
                const groupMap = new Map();
                const groupOrder = [];
                reportData.forEach(item => {
                  const key = mergeSortKeys
                    .map(k => String(item.data[k] ?? '').toLowerCase().trim())
                    .join('\0');
                  if (!groupMap.has(key)) {
                    groupMap.set(key, { data: { ...item.data } });
                    groupOrder.push(key);
                  } else {
                    const existing = groupMap.get(key).data;
                    activeMappings.forEach((m, mi) => {
                      if (m.type === 'count' || m.type === 'condition_count') {
                        const col = cleanFieldName(m.target || m.source || `Column${mi + 1}`) || `Column${mi + 1}`;
                        existing[col] = (Number(existing[col]) || 0) + (Number(item.data[col]) || 0);
                      }
                    });
                  }
                });

                // Rebuild reportData from groups and reassign serial numbers
                reportData = groupOrder.map((key, idx) => {
                  const item = groupMap.get(key);
                  activeMappings.forEach((m, mi) => {
                    if (m.type === 'serial') {
                      const col = cleanFieldName(m.target || m.source || `Column${mi + 1}`) || `Column${mi + 1}`;
                      item.data[col] = idx + 1;
                    }
                  });
                  return { data: item.data };
                });

                // Sort so primary merge column groups are contiguous
                reportData.sort((a, b) => {
                  for (const key of mergeSortKeys) {
                    const av = String(a.data[key] ?? '').toLowerCase();
                    const bv = String(b.data[key] ?? '').toLowerCase();
                    if (av < bv) return -1;
                    if (av > bv) return 1;
                  }
                  return 0;
                });
              }
            }

            finalAOA.push(columnHeaders);
            reportData.forEach(item => finalAOA.push(columnHeaders.map(h => item.data[h] !== undefined ? item.data[h] : '')));

            if (template.isOutputFilterEnabled !== false && template.outputFilters?.length > 0) {
              const hdr = finalAOA[0];
              const filteredRows = finalAOA.slice(1).filter(row => {
                const rowObj = {};
                hdr.forEach((h, i) => { if (h) rowObj[h] = row[i]; });
                return template.outputFilters.every(of => !of.conditionCol || evaluateCondition(rowObj, of));
              });
              finalAOA = [hdr, ...filteredRows];
            }

            if (!activeMappings.some(m => m.enableMerging)) {
              finalAOA = applyFinalSort(finalAOA, template.sortConfig);
            }

            // Always reassign serial columns last so S.No is 1,2,3... after all sorting/filtering
            if (!useFallback) {
              const serialColIndices = activeMappings.reduce((acc, m, i) => {
                if (m.type === 'serial') {
                  const sh = cleanFieldName(m.target || m.source || `Column${i + 1}`) || `Column${i + 1}`;
                  const si = validHeaders.indexOf(sh);
                  if (si >= 0) acc.push(si);
                }
                return acc;
              }, []);
              if (serialColIndices.length > 0) {
                finalAOA.slice(1).forEach((row, idx) => {
                  serialColIndices.forEach(ci => { row[ci] = idx + 1; });
                });
              }
            }

            // Compute which column indices (0-based in finalAOA) have enableMerging set
            const mergeColIndices = useFallback ? [] : activeMappings.reduce((acc, m, i) => {
              if (m.enableMerging) {
                // map from activeMappings index to validHeaders index
                const hdr = cleanFieldName(m.target || m.source || `Column${i + 1}`) || `Column${i + 1}`;
                const hi = validHeaders.indexOf(hdr);
                if (hi >= 0) acc.push(hi);
              }
              return acc;
            }, []);
            const excelBuffer = await excelJSExport(finalAOA, columnHeaders, topReportHeader, [], !!template.isHighlightEmptyEnabled, mergeColIndices);
            let fileName = (template.fileNameFormat || `{name}.xlsx`).replace('{name}', template.name || 'Report').replace('{date}', new Date().toISOString().slice(0, 10));
            if (!fileName.toLowerCase().endsWith('.xlsx')) fileName += '.xlsx';
            const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            if (isSingle) saveAs(new Blob([excelBuffer], { type: excelMimeType }), fileName);
            else zip.file(fileName, excelBuffer);
          }
        } catch (te) { templateErrors.push(`${template.name}: ${te.message}`); }
      }

      if (!isSingle && Object.keys(zip.files).length > 0) saveAs(await zip.generateAsync({ type: 'blob' }), `Reports_${Date.now()}.zip`);

      const successCount = targetTemplates.length - templateErrors.length;
      if (successCount > 0) {
        try {
          await addDoc(collection(db, 'reportLogs'), {
            timestamp: new Date().toISOString(),
            templateCount: successCount,
            templateNames: targetTemplates.slice(0, successCount).map(t => t.name || 'Untitled'),
            isBatch: !isSingle,
          });
        } catch (_) {}
      }

      if (templateErrors.length > 0) {
        setError(`Processing completed with ${templateErrors.length} errors:\n${templateErrors.join('\n')}`);
        setStatus('Completed with errors');
      } else {
        setStatus('Completed!');
      }
    } catch (err) { setError(`Generation failed: ${err.message}`); } finally { setIsGenerating(false); }
  };


  const getMasterValue = (row, source) => {
    if (!source || !row) return '';
    const s = String(source).trim(); if (row[s] !== undefined) return row[s];
    const n = (st) => String(st || "").toLowerCase().replace(/[^a-z0-9]/g, '');
    const cS = n(s); const mk = Object.keys(row).find(k => n(k) === cS);
    return mk ? row[mk] : '';
  };

  // ── Step 0: Category Selection ──────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="generate-report">
        <header className="page-header">
          <h1 className="page-title">Generate Reports</h1>
          <p className="page-description">Select a report category to get started.</p>
        </header>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
            <Loader2 size={32} className="spinner" style={{ margin: '0 auto 16px', display: 'block' }} />
            Loading categories...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {/* All Templates card */}
            <div
              onClick={() => handleCategorySelect(null)}
              className="glass"
              style={{ padding: '32px', cursor: 'pointer', borderRadius: '20px', transition: 'transform 0.15s, box-shadow 0.15s', border: '1px solid var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <LayoutGrid size={26} color="white" />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', marginBottom: '8px' }}>All Templates</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>Access every available report template.</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', background: 'var(--glass-bg)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '8px', color: 'var(--text-muted)' }}>
                  {templates.length} templates
                </span>
                <ArrowRight size={16} color="var(--primary)" />
              </div>
            </div>

            {/* Category cards */}
            {categories.map(cat => {
              const count = (cat.templateIds || []).length;
              return (
                <div
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat)}
                  className="glass"
                  style={{ padding: '32px', cursor: 'pointer', borderRadius: '20px', transition: 'transform 0.15s, box-shadow 0.15s', border: '1px solid var(--border)' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <Tag size={26} color="var(--primary)" />
                  </div>
                  <h3 style={{ fontSize: '17px', fontWeight: '700', marginBottom: '6px' }}>{cat.name}</h3>
                  {cat.description && (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.5' }}>{cat.description}</p>
                  )}
                  {cat.masterExcelFormatNotes && (
                    <div style={{ background: 'var(--glass-subtle)', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '12px', maxHeight: '72px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                      <AlignLeft size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-top' }} />
                      {cat.masterExcelFormatNotes}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                    <span style={{ fontSize: '12px', background: 'var(--glass-bg)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '8px', color: 'var(--text-muted)' }}>
                      {count} template{count !== 1 ? 's' : ''}
                    </span>
                    <ArrowRight size={16} color="var(--primary)" />
                  </div>
                </div>
              );
            })}

            {categories.length === 0 && templates.length > 0 && (
              <div className="glass" style={{ gridColumn: '1/-1', padding: '40px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '20px' }}>
                <FolderOpen size={32} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.4 }} />
                <p>No categories created yet. <strong>Click "All Templates"</strong> to continue, or ask an admin to set up categories.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="generate-report">
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <button
              onClick={handleBackToCategories}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', padding: '4px 0', fontFamily: 'inherit' }}
            >
              <ChevronLeft size={16} /> Back to Categories
            </button>
          </div>
          <h1 className="page-title">
            {selectedCategory ? selectedCategory.name : 'All Templates'}
          </h1>
          <p className="page-description">
            {selectedCategory?.description || 'Process your master data through multiple templates simultaneously.'}
          </p>
        </div>
        {selectedCategory && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', padding: '8px 14px' }}>
            <Tag size={16} color="var(--primary)" />
            <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: '600' }}>{selectedCategory.name}</span>
          </div>
        )}
      </header>

      {/* Master Excel Format Notes banner */}
      {selectedCategory?.masterExcelFormatNotes && (
        <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '16px', padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <AlignLeft size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Master Excel Format Notes</p>
            <p style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{selectedCategory.masterExcelFormatNotes}</p>
          </div>
        </div>
      )}

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
