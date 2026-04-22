import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase/config';
import { collection, query, getDocs } from 'firebase/firestore';
import XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Download,
  ArrowRight, ChevronLeft, FolderOpen, Tag, AlignLeft, LayoutGrid,
  BarChart4, Eye, Table2, Search, ExternalLink, Filter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── Core helpers (mirrored from GenerateReport, self-contained) ───────────────

function parseSafeNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function cleanFieldName(str) {
  return String(str || '').trim().replace(/^["'\s]+|["'\s]+$/g, '').replace(/[​-‍﻿]/g, '').trim();
}

function parseReportDatePure(rawVal) {
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
  const d2 = new Date(s.replace(/\s+-\s+/, ' ').replace(/\s+-\s+/, ' '));
  if (!isNaN(d2.getTime())) return d2;
  const s2 = s.toLowerCase();
  const monthsF = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  if (s2.includes('week')) { const m = s.match(/Week\s+(\d+)/i); if (m) return new Date(2000, 0, parseInt(m[1])); }
  const mOnlyIdx = monthsF.findIndex(mon => mon === s2.substring(0, 3));
  if (mOnlyIdx >= 0 && s2.length <= 9 && !/\d/.test(s2)) { const md = new Date(); md.setMonth(mOnlyIdx); md.setDate(1); return md; }
  const mdy = s.match(/([a-z]+)\s+(\d\d?)\s*[-,]?\s*(\d\d\d\d)/i);
  if (mdy) { const mIdx = monthsF.indexOf(mdy[1].toLowerCase().slice(0, 3)); if (mIdx >= 0) return new Date(parseInt(mdy[3]), mIdx, parseInt(mdy[2])); }
  const dmy = s.match(/(\d\d?)\s+([a-z]+)\s+(\d\d\d\d)/i);
  if (dmy) { const mIdx = monthsF.indexOf(dmy[2].toLowerCase().slice(0, 3)); if (mIdx >= 0) return new Date(parseInt(dmy[3]), mIdx, parseInt(dmy[1])); }
  return null;
}

function parseDateForMonth(rawVal) {
  if (!rawVal) return null;
  const s = String(rawVal).trim();
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2})\s*[-–]\s*(\d{4})/);
  if (m) { const idx = months.indexOf(m[1].slice(0,3).toLowerCase()); if (idx >= 0) return { year: parseInt(m[3]), month: idx }; }
  const d = parseReportDatePure(rawVal);
  if (d && !isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() };
  return null;
}

function applyFinalSort(aoa, sortConfig) {
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
}

// ── Main processing function (builds AOA from template + master data) ─────────

async function processTemplateForView(template, masterFile) {
  const data = await masterFile.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  let masterData = XLSX.utils.sheet_to_json(ws, { defval: '' });

  // Propagate merged cells
  if (ws['!merges'] && masterData.length > 0) {
    const headers = Object.keys(masterData[0]);
    ws['!merges'].forEach(range => {
      const { s, e } = range;
      for (let c = s.c; c <= e.c; c++) {
        const headerName = headers[c]; if (!headerName) continue;
        const firstDataRowIdx = s.r - 1; if (firstDataRowIdx < 0) continue;
        const sourceRow = masterData[firstDataRowIdx]; if (!sourceRow) return;
        const val = sourceRow[headerName];
        if (val === undefined || val === null || val === '') return;
        for (let r = s.r; r <= e.r; r++) {
          const ti = r - 1;
          if (ti >= 0 && ti < masterData.length && masterData[ti][headerName] === '') masterData[ti][headerName] = val;
        }
      }
    });
  }

  // Clean field names
  if (masterData.length > 0) {
    masterData.forEach(row => {
      Object.keys(row).forEach(key => {
        const cleaned = cleanFieldName(key);
        if (cleaned !== key) { row[cleaned] = row[key]; delete row[key]; }
      });
    });
  }

  // Build date maps for week normalization
  const minDateMap = {}, maxDateMap = {};
  const dateColumns = new Set();
  if (template.pivotColumns) template.pivotColumns.forEach(c => { if (c.normalizeWeek) dateColumns.add(c.source); });
  if (template.rowFieldTransforms?.normalizeWeek) dateColumns.add(template.rowField);
  if (template.colFieldTransforms?.normalizeWeek) dateColumns.add(template.colField);
  if (template.mappings) template.mappings.forEach(m => { if (m.normalizeWeek) dateColumns.add(m.source); });
  if (template.normalizeWeek && template.colField) dateColumns.add(template.colField);
  if (template.normalizeWeek && template.rowField) dateColumns.add(template.rowField);
  if (template.normalizeMonth && template.colField) dateColumns.add(template.colField);
  if (template.normalizeMonth && template.rowField) dateColumns.add(template.rowField);

  if (dateColumns.size > 0) {
    dateColumns.forEach(col => {
      let min = Infinity, max = -Infinity;
      masterData.forEach(row => {
        const raw = getMV(row, col);
        const p = parseReportDatePure(raw);
        if (p && !isNaN(p.getTime())) {
          const t = p.getTime();
          if (t < min) min = t;
          if (t > max) max = t;
        }
      });
      if (min !== Infinity) { const ml = new Date(min); ml.setHours(0,0,0,0); minDateMap[col] = ml.getTime(); }
      if (max !== -Infinity) { const ml = new Date(max); ml.setHours(0,0,0,0); maxDateMap[col] = ml.getTime(); }
    });
  }

  // ── Month context for this_month / prev_month operators ─────────────────────
  const monthContext = {};
  {
    const mfCols = new Set();
    const collectMFC = (filters) => (filters || []).forEach(f => {
      if ((f.operator === 'this_month' || f.operator === 'prev_month') && f.conditionCol) mfCols.add(cleanFieldName(f.conditionCol));
    });
    collectMFC(template.globalFilters);
    collectMFC(template.outputFilters);
    (template.mappings || []).forEach(m => { collectMFC(m.columnFilters); collectMFC(m.rules); });
    mfCols.forEach(col => {
      let maxYear = -Infinity, maxMonth = -1;
      masterData.forEach(row => {
        const val = row[col] !== undefined ? row[col] : Object.entries(row).find(([k]) => k.toLowerCase().replace(/[^a-z0-9]/g,'') === col.toLowerCase().replace(/[^a-z0-9]/g,''))?.[1] ?? '';
        const p = parseDateForMonth(val);
        if (p && (p.year > maxYear || (p.year === maxYear && p.month > maxMonth))) { maxYear = p.year; maxMonth = p.month; }
      });
      if (maxYear > -Infinity) {
        monthContext[col] = { endYear: maxYear, endMonth: maxMonth, prevYear: maxMonth === 0 ? maxYear - 1 : maxYear, prevMonth: maxMonth === 0 ? 11 : maxMonth - 1 };
      }
    });
  }

  // ── Not-seen context for not_seen_within_days operator ───────────────────────
  const fmtLastVisit = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const notSeenContext = {};
  {
    const nsPairs = [];
    const collectNS = (filters) => (filters || []).forEach(f => {
      if (f.operator === 'not_seen_within_days' && f.conditionCol && f.groupByCol)
        nsPairs.push({ dateCol: cleanFieldName(f.conditionCol), groupByCol: cleanFieldName(f.groupByCol) });
    });
    collectNS(template.globalFilters);
    (template.mappings || []).forEach(m => {
      collectNS(m.columnFilters); collectNS(m.rules);
      if (m.type === 'last_visit_date' && m.source && m.groupByCol)
        nsPairs.push({ dateCol: cleanFieldName(m.source), groupByCol: cleanFieldName(m.groupByCol) });
    });
    (template.pivotColumns || []).forEach(p => {
      if (p.type === 'last_visit_date' && p.source && p.groupByCol)
        nsPairs.push({ dateCol: cleanFieldName(p.source), groupByCol: cleanFieldName(p.groupByCol) });
    });
    (template.sections || []).forEach(s => (s.pivotColumns || []).forEach(p => {
      if (p.type === 'last_visit_date' && p.source && p.groupByCol)
        nsPairs.push({ dateCol: cleanFieldName(p.source), groupByCol: cleanFieldName(p.groupByCol) });
    }));
    nsPairs.forEach(({ dateCol, groupByCol }) => {
      const key = `${dateCol}__${groupByCol}`;
      if (notSeenContext[key]) return;
      let endDate = null;
      const lastSeen = {};
      masterData.forEach(row => {
        const raw = row[dateCol] !== undefined ? row[dateCol] : Object.entries(row).find(([k]) => cleanFieldName(k) === dateCol)?.[1] ?? '';
        const d = parseReportDatePure(raw);
        if (d && !isNaN(d.getTime())) {
          if (!endDate || d > endDate) endDate = d;
          const gbRaw = row[groupByCol] !== undefined ? row[groupByCol] : Object.entries(row).find(([k]) => cleanFieldName(k) === groupByCol)?.[1] ?? '';
          const gv = String(gbRaw || '').trim();
          if (gv && (!lastSeen[gv] || d > lastSeen[gv])) lastSeen[gv] = d;
        }
      });
      if (endDate) notSeenContext[key] = { endDate, lastSeen };
    });
  }

  // ── Helpers that close over masterData / date maps ──────────────────────────

  function getMV(row, source) {
    if (!source || !row) return '';
    const src = cleanFieldName(source);
    if (row[src] !== undefined && row[src] !== null) return row[src];
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const nSrc = norm(src);
    const mk = Object.keys(row).find(k => norm(k) === nSrc);
    return mk ? row[mk] : '';
  }

  function cleanVal(val, config, colName) {
    const isBlank = val === undefined || val === null || String(val).trim() === '';
    if (isBlank) {
      if (config?.replaceWith !== undefined && config.replaceWith !== null && String(config.replaceWith).trim() !== '') return String(config.replaceWith).trim();
      return '';
    }
    if (!config) return String(val).trim();
    let cleaned = String(val).trim();
    let dateObj = (config.normalizeMonth || config.normalizeWeek || config.simplifyDate) ? parseReportDatePure(val) : null;
    if (config.simplifyDate) {
      if (dateObj && !isNaN(dateObj.getTime())) cleaned = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      else { const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean); if (parts.length >= 2) cleaned = parts.length > 2 ? parts[1] : parts[0]; }
    }
    if (config.simplifyTime) { const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean); if (parts.length >= 2) cleaned = parts[parts.length - 1]; }
    if (config.normalizeMonth && dateObj) cleaned = dateObj.toLocaleString('default', { month: 'short' });
    if (config.normalizeWeek && dateObj && colName && minDateMap[colName]) {
      const dayLocal = new Date(dateObj); dayLocal.setHours(0,0,0,0);
      const weekNum = Math.floor((dayLocal.getTime() - minDateMap[colName]) / (7*24*60*60*1000)) + 1;
      const weekStart = new Date(minDateMap[colName] + (weekNum-1)*7*24*60*60*1000);
      let weekEnd = new Date(weekStart.getTime() + 6*24*60*60*1000);
      if (maxDateMap[colName] && weekEnd.getTime() > maxDateMap[colName]) weekEnd = new Date(maxDateMap[colName]);
      const f = d => d.toLocaleString('default', { month: 'short', day: 'numeric' });
      cleaned = `Week ${weekNum} (${f(weekStart)} to ${f(weekEnd)})`;
    }
    if (config.findText) { try { cleaned = cleaned.replace(new RegExp(config.findText, 'gi'), config.replaceWith || ''); } catch (e) {} }
    return cleaned.trim();
  }

  function applyRound(v, config) {
    if (!config || !config.roundOff) return v;
    const n = parseFloat(String(v));
    if (isNaN(n)) return v;
    const dec = Math.max(0, parseInt(config.roundDecimals) || 0);
    return Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec);
  }

  function evalCond(row, mapping) {
    if (!mapping) return true;
    const toNum = s => parseFloat(String(s || '').replace(/,/g, '').trim());
    const evalRule = (targetVal, operator, conditionVals = [], conditionCol = '', row = null, groupByCol = '') => {
      if (operator === 'not_seen_within_days') {
        const days = parseInt(conditionVals[0]) || 3;
        const gbCol = cleanFieldName(groupByCol || '');
        const key = `${cleanFieldName(conditionCol)}__${gbCol}`;
        const ctx = notSeenContext[key];
        if (!ctx || !row || !gbCol) return false;
        const gv = String(getMV(row, gbCol) || '').trim();
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
      const evalSingle = cv => {
        const c = String(cv ?? '').toLowerCase().trim();
        if (operator === '==') return tv === c;
        if (operator === '!=') return tv !== c;
        if (operator === 'contains') return tv.includes(c);
        if (operator === 'not_contains') return !tv.includes(c);
        if (operator === 'between') { const min = toNum(conditionVals[0]), max = toNum(conditionVals[1]); return !isNaN(tvNum) && !isNaN(min) && !isNaN(max) && tvNum >= min && tvNum <= max; }
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
    if (mapping.rules && mapping.rules.length > 0) return mapping.rules.every(r => r.conditionCol ? evalRule(getMV(row, r.conditionCol), r.operator, r.conditionVals, r.conditionCol, row, r.groupByCol) : true);
    return mapping.conditionCol ? evalRule(getMV(row, mapping.conditionCol), mapping.operator, mapping.conditionVals, mapping.conditionCol, row, mapping.groupByCol) : true;
  }

  function parseTimeValue(val) {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') { if (val >= 0 && val < 1) return val * 24 * 60 * 60 * 1000; return val; }
    const s = String(val).trim(); if (s === '') return null;
    const num = Number(s); if (!isNaN(num)) { if (num >= 0 && num < 1) return num * 24 * 60 * 60 * 1000; return num; }
    const ampm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (ampm) { let h = parseInt(ampm[1]); const m = parseInt(ampm[2]); const sec = ampm[3] ? parseInt(ampm[3]) : 0; if (ampm[4].toUpperCase() === 'PM' && h !== 12) h += 12; if (ampm[4].toUpperCase() === 'AM' && h === 12) h = 0; return h * 3600000 + m * 60000 + sec * 1000; }
    const parts = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (parts) return parseInt(parts[1]) * 3600000 + parseInt(parts[2]) * 60000 + (parts[3] ? parseInt(parts[3]) * 1000 : 0);
    const date = new Date(s); if (!isNaN(date.getTime())) return date.getTime();
    return null;
  }

  function formatDuration(minutes) {
    const total = Math.round(minutes); const sign = total < 0 ? '-' : ''; const abs = Math.abs(total);
    return `${sign}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`;
  }

  function evalFormula(formula, row, rowContext = {}) {
    if (!formula) return '';
    try {
      let f = formula;
      f = f.replace(/\{([^}]+)\}/g, (_, token) => { const key = token.trim(); const exact = Object.keys(rowContext).find(k => String(k).trim().toLowerCase() === key.toLowerCase()); const v = exact ? rowContext[exact] : rowContext[key]; return (v === undefined || v === null || v === '') ? '0' : String(v).replace(/,/g, ''); });
      f = f.replace(/\[([^\]]+)\]/g, (_, token) => { const val = getMV(row, token); return (val === undefined || val === null || val === '') ? '0' : String(val).replace(/,/g, ''); });
      const result = new Function('Math', `return (${f})`)(Math);
      return (result === undefined || result === null || isNaN(result)) ? '' : result;
    } catch { return ''; }
  }

  function resolveMappingValue(row, index, mapping, rowContext = {}) {
    if (!mapping) return '';
    if (mapping.columnFilters?.length > 0) { if (!mapping.columnFilters.every(f => !f.conditionCol || evalCond(row, f))) return ''; }
    const type = mapping.type || 'direct';
    const src = mapping.source || mapping.sourceCol || mapping.target || '';
    if (type === 'serial') return index + 1;
    if (type === 'count') return String(getMV(row, src)).trim() ? 1 : 0;
    if (type === 'condition_count') return evalCond(row, mapping) ? 1 : 0;
    if (type === 'math') return applyRound(cleanVal(evalFormula(mapping.formula, row, rowContext), mapping, src), mapping);
    if (type === 'time_diff') {
      const start = parseTimeValue(getMV(row, mapping.colB || mapping.colA || src));
      const end = parseTimeValue(getMV(row, mapping.colA || mapping.colB || src));
      if (start === null || end === null) return '';
      const diff = Math.round((end - start) / 60000); const thr = parseFloat(mapping.threshold) || 0;
      switch (mapping.outType) {
        case 'duration_hhmm': return formatDuration(diff);
        case 'duration_mins': return diff;
        case 'exceeds_yn': return diff > thr ? 'Yes' : 'No';
        case 'excess_mins': return Math.max(0, diff - thr);
        case 'excess_hhmm': return formatDuration(Math.max(0, diff - thr));
        case 'remaining_mins': return Math.max(0, thr - diff);
        case 'remaining_hhmm': return formatDuration(Math.max(0, thr - diff));
        default: return formatDuration(diff);
      }
    }
    if (type === 'last_visit_date') {
      const dateCol = cleanFieldName(src);
      const gbCol = cleanFieldName(mapping.groupByCol || '');
      const ctx = notSeenContext[`${dateCol}__${gbCol}`];
      if (!ctx || !gbCol) return '';
      const gv = String(getMV(row, mapping.groupByCol || '') || '').trim();
      const ls = gv ? ctx.lastSeen[gv] : null;
      return ls ? fmtLastVisit(ls) : '';
    }
    return applyRound(cleanVal(getMV(row, src), mapping, src), mapping);
  }

  function applyColRowFilters(rows, col) {
    if (!col || !rows) return rows || [];
    if (!col.rowFilters?.length) return rows;
    return rows.filter(r => col.rowFilters.every(f => !f.conditionCol || f.operator === 'unique' || evalCond(r, f)));
  }

  function applyColValueFilters(rows, col) {
    if (!col?.valueFilters?.length) return rows;
    const toNum = s => parseFloat(String(s ?? '').replace(/,/g, '').trim());
    return rows.filter(row => col.valueFilters.every(vf => {
      const raw = getMV(row, col.source); const tv = String(raw ?? '').toLowerCase().trim(); const tvNum = toNum(tv); const val = String(vf.value ?? '').toLowerCase().trim();
      if (vf.operator === '==') return tv === val;
      if (vf.operator === '!=') return tv !== val;
      if (vf.operator === 'contains') return tv.includes(val);
      if (vf.operator === 'between') { const min = toNum(vf.value), max = toNum(vf.valueTo); return !isNaN(tvNum) && !isNaN(min) && !isNaN(max) && tvNum >= min && tvNum <= max; }
      const cNum = toNum(val);
      if (vf.operator === '>') return !isNaN(tvNum) && !isNaN(cNum) && tvNum > cNum;
      if (vf.operator === '<') return !isNaN(tvNum) && !isNaN(cNum) && tvNum < cNum;
      if (vf.operator === '>=') return !isNaN(tvNum) && !isNaN(cNum) && tvNum >= cNum;
      if (vf.operator === '<=') return !isNaN(tvNum) && !isNaN(cNum) && tvNum <= cNum;
      return true;
    }));
  }

  function applyDedup(rows, p) {
    if (!p.isUniqueCount || !p.dedupColumn) return rows;
    const seen = new Set();
    return rows.filter(row => { const k = String(getMV(row, p.dedupColumn) || '').trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  }

  // ── Apply global filters ────────────────────────────────────────────────────
  const excludedCols = new Set(
    (template.isGlobalFilterEnabled !== false ? (template.globalFilters || []) : [])
      .filter(gf => gf.mode === 'exclude' && gf.conditionCol)
      .map(gf => cleanFieldName(gf.conditionCol))
  );

  let filteredMD = [...masterData];
  if (template.isGlobalFilterEnabled !== false && template.globalFilters?.length) {
    template.globalFilters.forEach(gf => {
      if (!gf.conditionCol || gf.mode === 'exclude') return;
      if (gf.operator === 'unique') {
        const seen = new Set();
        filteredMD = filteredMD.filter(r => { const k = String(getMV(r, gf.conditionCol) ?? '').trim(); if (seen.has(k)) return false; seen.add(k); return true; });
      } else if (gf.operator === 'not_seen_within_days' && gf.groupByCol) {
        filteredMD = filteredMD.filter(r => evalCond(r, gf));
        const bestRows = {};
        filteredMD.forEach(r => {
          const gv = String(getMV(r, gf.groupByCol) || '').trim();
          if (!gv) return;
          const d = parseReportDatePure(getMV(r, gf.conditionCol));
          if (!bestRows[gv] || (d && (!bestRows[gv].d || d > bestRows[gv].d))) bestRows[gv] = { row: r, d };
        });
        filteredMD = Object.values(bestRows).map(x => x.row);
      } else {
        filteredMD = filteredMD.filter(r => evalCond(r, gf));
      }
    });
  }
  if (template.mappings?.filter(m => m.type === 'condition' && m.conditionCol).length > 0) {
    filteredMD = filteredMD.filter(r => template.mappings.filter(m => m.type === 'condition' && m.conditionCol).every(m => evalCond(r, m)));
  }

  // ── PIVOT ───────────────────────────────────────────────────────────────────
  if (template.type === 'pivot') {
    let pCols = [...(template.pivotColumns || [])];
    if (pCols.length === 0 && template.valueFields?.length) pCols = template.valueFields.map((vf, i) => ({ id: `leg-${i}`, type: 'aggregation', ...vf }));
    const rowField = template.rowField, colField = template.colField;
    if (colField) pCols = pCols.filter(p => p.type === 'aggregation' || p.type === 'formula' || p.type === 'last_visit_date');
    if (excludedCols.size) pCols = pCols.filter(p => !excludedCols.has(cleanFieldName(p.source || '')));
    if (rowField) { const rfk = cleanFieldName(rowField).toLowerCase(); pCols = pCols.filter(p => !((p.type === 'property' || p.type === 'grouping') && cleanFieldName(p.source || '').toLowerCase() === rfk)); }
    const rowTx = template.rowFieldTransforms || {}, colTx = template.colFieldTransforms || {};
    const rowsByGroup = {};
    filteredMD.forEach(r => {
      const rawGk = rowField ? String(getMV(r, rowField) || '').trim() : '_default';
      const gk = rowField ? (cleanVal(getMV(r, rowField), rowTx, rowField) || rawGk) : '_default';
      if (!rowsByGroup[gk]) rowsByGroup[gk] = { firstRow: r, colGroups: {} };
      const ck = colField ? (cleanVal(getMV(r, colField), colTx, colField) || String(getMV(r, colField) || '').trim()) : '_default';
      if (!rowsByGroup[gk].colGroups[ck]) rowsByGroup[gk].colGroups[ck] = { rows: [] };
      rowsByGroup[gk].colGroups[ck].rows.push(r);
    });
    let allColKs = colField ? Array.from(new Set(filteredMD.map(r => cleanVal(getMV(r, colField), colTx, colField) || String(getMV(r, colField) || '').trim()))) : ['_default'];
    if (colField) allColKs.sort((a, b) => { const dA = parseReportDatePure(a), dB = parseReportDatePure(b); return (dA && dB) ? dA.getTime() - dB.getTime() : a.localeCompare(b, undefined, { numeric: true }); });

    function computeAgg(fr, p, rowContext, isTotal = false) {
      let v;
      if (p.type === 'formula') { v = evalFormula(p.formula, fr[0] || {}, rowContext); }
      else if (p.type === 'aggregation') {
        if (!fr.length) { v = ''; }
        else {
          const op = p.operation;
          if (op === 'count') v = fr.length;
          else if (op === 'count_single') v = fr.filter(r => !String(getMV(r, p.source) || '').includes('/')).length;
          else if (op === 'count_multi') v = fr.filter(r => String(getMV(r, p.source) || '').includes('/')).length;
          else if (op === 'count_unique') { const dc = p.dedupColumn || p.source; const seen = new Set(); fr.forEach(r => { const k = String(getMV(r, dc) || '').trim(); if (k) seen.add(k); }); v = seen.size; }
          else { const vs = fr.map(r => parseSafeNum(getMV(r, p.source))); if (op === 'sum') v = vs.reduce((a, b) => a+b, 0); else if (op === 'avg') v = vs.reduce((a,b)=>a+b,0)/vs.length; else if (op === 'min') v = Math.min(...vs); else if (op === 'max') v = Math.max(...vs); }
        }
      } else { v = (!isTotal && fr.length > 0) ? getMV(fr[0], p.source) : ''; }
      v = applyRound(v, p);
      const key = p.displayName || p.source || ''; if (key) rowContext[key] = v;
      return v;
    }

    const headers = [rowField || 'Group'];
    if (colField) allColKs.forEach(ck => pCols.forEach(p => headers.push(`${ck} - ${p.displayName || p.source}`)));
    else pCols.forEach(p => headers.push(p.displayName || p.source || 'Untitled'));
    if (template.isRowTotalEnabled && colField) pCols.forEach(p => headers.push(`Row Total - ${p.displayName || p.source}`));
    let finalAOA = [headers];

    Object.entries(rowsByGroup).forEach(([gk, rg]) => {
      const rr = [gk === '_default' ? '' : gk];
      allColKs.forEach(ck => {
        const cg = rg.colGroups[ck] || { rows: [] }; const ctx = {};
        pCols.forEach(p => { const fr = applyDedup(applyColValueFilters(applyColRowFilters(cg.rows, p), p), p); rr.push(computeAgg(fr, p, ctx)); });
      });
      if (template.isRowTotalEnabled && colField) {
        const all = Object.values(rg.colGroups).flatMap(cg => cg.rows); const ctx = {};
        pCols.forEach(p => { const fr = applyDedup(applyColValueFilters(applyColRowFilters(all, p), p), p); const v = computeAgg(fr, p, ctx, true); rr.push(p.showTotal === false ? '' : v); });
      }
      finalAOA.push(rr);
    });

    if (template.isOutputFilterEnabled !== false && template.outputFilters?.length) {
      const hdr = finalAOA[0];
      const filtered = finalAOA.slice(1).filter(row => {
        const rowObj = {}; hdr.forEach((h, i) => { if (h != null) rowObj[h] = row[i]; });
        return template.outputFilters.every(of => {
          if (!of.conditionCol) return true;
          if (rowObj[of.conditionCol] !== undefined) return evalCond(rowObj, of);
          const suffix = ` - ${of.conditionCol}`; const matchKeys = hdr.filter(h => h && h.endsWith(suffix));
          if (!matchKeys.length) return true;
          return matchKeys.some(k => evalCond({ [of.conditionCol]: rowObj[k] }, of));
        });
      });
      finalAOA = [hdr, ...filtered];
    }

    finalAOA = applyFinalSort(finalAOA, template.sortConfig);

    if (template.isPivotSummaryEnabled) {
      const hdrGT = finalAOA[0]; const dataRowsGT = finalAOA.slice(1); const hdrToPCol = {};
      if (!colField) pCols.forEach(p => { hdrToPCol[p.displayName || p.source || 'Untitled'] = p; });
      else { allColKs.forEach(ck => pCols.forEach(p => { hdrToPCol[`${ck} - ${p.displayName || p.source}`] = p; })); if (template.isRowTotalEnabled) pCols.forEach(p => { hdrToPCol[`Row Total - ${p.displayName || p.source}`] = p; }); }
      const totalRow = hdrGT.map((h, ci) => {
        if (ci === 0) return 'Grand Total'; const p = hdrToPCol[h]; if (p && p.showTotal === false) return '';
        const numVals = dataRowsGT.map(r => r[ci]).filter(v => typeof v === 'number');
        return numVals.length ? numVals.reduce((a,b) => a+b, 0) : '';
      });
      finalAOA.push(totalRow);
    }

    return { aoa: finalAOA, sections: null, topHeader: template.isHeaderEnabled && template.headerConfig ? (template.headerConfig.type === 'custom' ? template.headerConfig.text : (masterData.length > 0 ? getMV(masterData[0], template.headerConfig.sourceCol) : '')) : null };
  }

  // ── MULTI-TABLE (type === 'multi_table', from MultiTableDesigner) ────────────
  if (template.type === 'multi_table') {
    function buildSectionAOA(section, sectionData) {
      let pCols = [...(section.pivotColumns || [])];
      const rowField = section.rowField || '';
      const colField = section.colField || '';
      if (colField) pCols = pCols.filter(p => p.type === 'aggregation' || p.type === 'formula' || p.type === 'last_visit_date');
      if (rowField) {
        const rfk = cleanFieldName(rowField).toLowerCase();
        pCols = pCols.filter(p => !((p.type === 'property' || p.type === 'grouping') && cleanFieldName(p.source || '').toLowerCase() === rfk));
      }
      const rowTx = section.rowFieldTransforms || {};
      const colTx = section.colFieldTransforms || {};
      const rowsByGroup = {};
      sectionData.forEach(r => {
        const rawGk = rowField ? String(getMV(r, rowField) || '').trim() : '_default';
        const gk = rowField ? (cleanVal(getMV(r, rowField), rowTx, rowField) || rawGk) : '_default';
        if (!rowsByGroup[gk]) rowsByGroup[gk] = { firstRow: r, colGroups: {} };
        const ck = colField ? (cleanVal(getMV(r, colField), colTx, colField) || String(getMV(r, colField) || '').trim()) : '_default';
        if (!rowsByGroup[gk].colGroups[ck]) rowsByGroup[gk].colGroups[ck] = { rows: [] };
        rowsByGroup[gk].colGroups[ck].rows.push(r);
      });
      let allColKs = colField
        ? Array.from(new Set(sectionData.map(r => cleanVal(getMV(r, colField), colTx, colField) || String(getMV(r, colField) || '').trim())))
        : ['_default'];
      if (colField) allColKs.sort((a, b) => { const dA = parseReportDatePure(a), dB = parseReportDatePure(b); return (dA && dB) ? dA.getTime() - dB.getTime() : a.localeCompare(b, undefined, { numeric: true }); });

      const rowLabel = section.rowFieldDisplayName || rowField || 'Group';
      const headers = [rowLabel];
      if (colField) allColKs.forEach(ck => pCols.forEach(p => headers.push(`${ck} - ${p.displayName || p.source}`)));
      else pCols.forEach(p => headers.push(p.displayName || p.source || 'Untitled'));
      if (section.isRowTotalEnabled && colField) pCols.forEach(p => headers.push(`Row Total - ${p.displayName || p.source}`));

      const sAOA = [headers];

      function sComputeAgg(fr, p, ctx, isTotal = false) {
        let v;
        if (p.type === 'formula') { v = evalFormula(p.formula, fr[0] || {}, ctx); }
        else if (p.type === 'aggregation') {
          if (!fr.length) { v = ''; } else {
            const op = p.operation;
            if (op === 'count') v = fr.length;
            else if (op === 'count_single') v = fr.filter(r => !String(getMV(r, p.source) || '').includes('/')).length;
            else if (op === 'count_multi') v = fr.filter(r => String(getMV(r, p.source) || '').includes('/')).length;
            else if (op === 'count_unique') { const dc = p.dedupColumn || p.source; const seen = new Set(); fr.forEach(r => { const k = String(getMV(r, dc) || '').trim(); if (k) seen.add(k); }); v = seen.size; }
            else { const vs = fr.map(r => parseSafeNum(getMV(r, p.source))); if (op === 'sum') v = vs.reduce((a,b)=>a+b,0); else if (op === 'avg') v = vs.reduce((a,b)=>a+b,0)/vs.length; else if (op === 'min') v = Math.min(...vs); else if (op === 'max') v = Math.max(...vs); }
          }
        } else if (p.type === 'last_visit_date') {
          let maxD = null;
          fr.forEach(r => { const d = parseReportDatePure(getMV(r, p.source)); if (d && !isNaN(d.getTime()) && (!maxD || d > maxD)) maxD = d; });
          v = maxD ? fmtLastVisit(maxD) : '';
        } else { v = (!isTotal && fr.length > 0) ? getMV(fr[0], p.source) : ''; }
        v = applyRound(v, p);
        const key = p.displayName || p.source || ''; if (key) ctx[key] = v;
        return v;
      }

      Object.entries(rowsByGroup).forEach(([gk, rg]) => {
        const rr = [gk === '_default' ? '' : gk];
        allColKs.forEach(ck => {
          const cg = rg.colGroups[ck] || { rows: [] }; const ctx = {};
          pCols.forEach(p => { const fr = applyDedup(applyColValueFilters(applyColRowFilters(cg.rows, p), p), p); rr.push(sComputeAgg(fr, p, ctx)); });
        });
        if (section.isRowTotalEnabled && colField) {
          const all = Object.values(rg.colGroups).flatMap(cg => cg.rows); const ctx = {};
          pCols.forEach(p => { const fr = applyDedup(applyColValueFilters(applyColRowFilters(all, p), p), p); const v = sComputeAgg(fr, p, ctx, true); rr.push(p.showTotal === false ? '' : v); });
        }
        sAOA.push(rr);
      });

      // Output filters
      if (section.isOutputFilterEnabled !== false && section.outputFilters?.length > 0) {
        const hdr = sAOA[0];
        const filtered = sAOA.slice(1).filter(row => {
          const rowObj = {}; hdr.forEach((h, i) => { if (h != null) rowObj[h] = row[i]; });
          return section.outputFilters.every(of => {
            if (!of.conditionCol) return true;
            if (rowObj[of.conditionCol] !== undefined) return evalCond(rowObj, of);
            const suffix = ` - ${of.conditionCol}`; const matchKeys = hdr.filter(h => h && h.endsWith(suffix));
            if (!matchKeys.length) return true;
            return matchKeys.some(k => evalCond({ [of.conditionCol]: rowObj[k] }, of));
          });
        });
        sAOA.splice(0, sAOA.length, hdr, ...filtered);
      }

      // Grand total row
      if (section.isPivotSummaryEnabled) {
        const hdrGT = sAOA[0]; const dataRowsGT = sAOA.slice(1); const hdrToPCol = {};
        if (!colField) pCols.forEach(p => { hdrToPCol[p.displayName || p.source || 'Untitled'] = p; });
        else { allColKs.forEach(ck => pCols.forEach(p => { hdrToPCol[`${ck} - ${p.displayName || p.source}`] = p; })); if (section.isRowTotalEnabled) pCols.forEach(p => { hdrToPCol[`Row Total - ${p.displayName || p.source}`] = p; }); }
        const totalRow = hdrGT.map((h, ci) => {
          if (ci === 0) return 'Grand Total';
          const p = hdrToPCol[h]; if (p && p.showTotal === false) return '';
          const numVals = dataRowsGT.map(r => r[ci]).filter(v => typeof v === 'number');
          return numVals.length ? numVals.reduce((a,b) => a+b, 0) : '';
        });
        sAOA.push(totalRow);
      }

      return sAOA;
    }

    const sections = (template.sections || []).map(section => {
      // Apply each section's own global filters independently from master data
      let sectionData = [...masterData];
      if (section.isGlobalFilterEnabled !== false && section.globalFilters?.length > 0) {
        section.globalFilters.forEach(gf => {
          if (!gf.conditionCol || gf.mode === 'exclude') return;
          if (gf.operator === 'unique') {
            const seen = new Set();
            sectionData = sectionData.filter(r => { const k = String(getMV(r, gf.conditionCol) ?? '').trim(); if (seen.has(k)) return false; seen.add(k); return true; });
          } else if (gf.operator === 'not_seen_within_days' && gf.groupByCol) {
            sectionData = sectionData.filter(r => evalCond(r, gf));
            const bestRows = {};
            sectionData.forEach(r => {
              const gv = String(getMV(r, gf.groupByCol) || '').trim();
              if (!gv) return;
              const d = parseReportDatePure(getMV(r, gf.conditionCol));
              if (!bestRows[gv] || (d && (!bestRows[gv].d || d > bestRows[gv].d))) bestRows[gv] = { row: r, d };
            });
            sectionData = Object.values(bestRows).map(x => x.row);
          } else {
            sectionData = sectionData.filter(r => evalCond(r, gf));
          }
        });
      }
      return { title: section.title || '', aoa: buildSectionAOA(section, sectionData) };
    });

    const topHeader = template.isHeaderEnabled && template.headerConfig
      ? (template.headerConfig.type === 'column'
          ? (masterData.length > 0 ? getMV(masterData[0], template.headerConfig.sourceCol) : '') || null
          : template.headerConfig.text || null)
      : null;
    return { aoa: null, sections, topHeader };
  }

  // ── VISUAL MAPPER (direct / default) ────────────────────────────────────────
  const activeMappings = (template.mappings || []).filter(m => m.type !== 'condition');
  const validHeaders = activeMappings.map((m, i) => {
    const h = cleanFieldName(m.target || m.source || `Column${i+1}`) || `Column${i+1}`;
    return excludedCols.has(cleanFieldName(m.source || '')) ? null : h;
  }).filter(Boolean);

  // Build rows
  let reportData = filteredMD.map((row, index) => {
    const rowContext = {};
    return activeMappings.map((mapping, i) => {
      if (excludedCols.has(cleanFieldName(mapping.source || ''))) return null;
      const v = resolveMappingValue(row, index, mapping, rowContext);
      const key = mapping.target || mapping.source || '';
      if (key) rowContext[key] = v;
      return v;
    }).filter((_, i) => !excludedCols.has(cleanFieldName(activeMappings[i]?.source || '')));
  });

  let finalAOA = [validHeaders, ...reportData];

  // Group-aggregate if merging
  const hasMerge = activeMappings.some(m => m.enableMerging);
  if (hasMerge) {
    const mergeColIdx = activeMappings.findIndex(m => m.enableMerging);
    const sorted = reportData.slice().sort((a, b) => String(a[mergeColIdx] || '').localeCompare(String(b[mergeColIdx] || '')));
    finalAOA = [validHeaders, ...sorted];
  }

  // Output filters
  if (template.isOutputFilterEnabled !== false && template.outputFilters?.length) {
    const hdr = finalAOA[0];
    const filtered = finalAOA.slice(1).filter(row => {
      const rowObj = {}; hdr.forEach((h, i) => { if (h) rowObj[h] = row[i]; });
      return template.outputFilters.every(of => !of.conditionCol || evalCond(rowObj, of));
    });
    finalAOA = [hdr, ...filtered];
  }

  // Custom sort (only when no merge columns)
  if (!hasMerge) finalAOA = applyFinalSort(finalAOA, template.sortConfig);

  // Reassign serial columns last
  const serialColIndices = activeMappings.reduce((acc, m, i) => {
    if (m.type === 'serial') {
      const sh = cleanFieldName(m.target || m.source || `Column${i+1}`) || `Column${i+1}`;
      const si = validHeaders.indexOf(sh);
      if (si >= 0) acc.push(si);
    }
    return acc;
  }, []);
  if (serialColIndices.length) {
    finalAOA.slice(1).forEach((row, idx) => { serialColIndices.forEach(ci => { row[ci] = idx + 1; }); });
  }

  const topHeader = template.isHeaderEnabled && template.headerConfig ? (template.headerConfig.type === 'custom' ? template.headerConfig.text : (masterData.length > 0 ? getMV(masterData[0], template.headerConfig.sourceCol) : '')) : null;
  return { aoa: finalAOA, sections: null, topHeader };
}

// ── Download helper (converts AOA to styled Excel) ────────────────────────────

async function downloadAsExcel(aoa, sections, templateName, topHeader) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  const thin = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
  const styleCell = (c, opts = {}) => {
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = thin;
    if (opts.bold) c.font = { bold: true, size: opts.size || 11 };
    if (opts.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  };

  let currR = 1;
  const writeAOA = (dataAOA, tHeader) => {
    const numCols = (dataAOA[0] || []).length;
    if (tHeader) {
      if (numCols > 1) try { ws.mergeCells(currR, 1, currR, numCols); } catch (_) {}
      const c = ws.getCell(currR, 1); c.value = tHeader; styleCell(c, { bold: true, size: 14, fill: 'FFF8FAFF' }); ws.getRow(currR).height = 28; currR++;
    }
    dataAOA.forEach((row, ri) => {
      const exRow = ws.getRow(currR);
      exRow.values = row.map(v => (v && typeof v === 'object' && v.v !== undefined) ? v.v : v);
      for (let col = 1; col <= numCols; col++) styleCell(exRow.getCell(col), ri === 0 ? { bold: true, fill: 'FFF1F5F9' } : {});
      currR++;
    });
    ws.columns.forEach(c => c.width = 25);
  };

  if (sections) {
    sections.forEach((sec, idx) => {
      if (sec.title) {
        const nc = (sec.aoa[0] || []).length;
        if (nc > 1) try { ws.mergeCells(currR, 1, currR, nc); } catch (_) {}
        const c = ws.getCell(currR, 1); c.value = sec.title; styleCell(c, { bold: true, size: 12, fill: 'FFE2E8F0' }); ws.getRow(currR).height = 22; currR++;
      }
      writeAOA(sec.aoa, null);
      if (idx < sections.length - 1) currR++;
    });
  } else {
    writeAOA(aoa, topHeader);
  }

  const buf = await wb.xlsx.writeBuffer();
  const fileName = `${(templateName || 'Report').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.xlsx`;
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}

// ── Table renderer component ──────────────────────────────────────────────────

function ReportTable({ aoa }) {
  const [findText, setFindText] = useState('');
  const [colFilters, setColFilters] = useState({});
  const [openFilterCol, setOpenFilterCol] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [filterSearch, setFilterSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (openFilterCol === null) return;
    const onMouseDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenFilterCol(null);
        setFilterSearch('');
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [openFilterCol]);

  if (!aoa || aoa.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No data to display.</div>;
  }

  const headers = aoa[0];
  const allRows = aoa.slice(1);
  const isNum = v => typeof v === 'number' || (!isNaN(parseFloat(v)) && String(v).trim() !== '' && !/^0\d/.test(String(v)));

  const getUniqueVals = (colIdx) => {
    const seen = new Set();
    allRows.forEach(row => seen.add(String(row[colIdx] ?? '')));
    return Array.from(seen).sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  };

  const filteredRows = allRows.filter(row =>
    Object.entries(colFilters).every(([ci, allowed]) => {
      if (!allowed || allowed.size === 0) return true;
      return allowed.has(String(row[parseInt(ci)] ?? ''));
    })
  );

  const findLower = findText.trim().toLowerCase();
  const matchCount = findLower
    ? filteredRows.reduce((cnt, row) =>
        cnt + headers.filter((_, ci) => String(row[ci] ?? '').toLowerCase().includes(findLower)).length, 0)
    : 0;

  const highlight = (val) => {
    const str = String(val ?? '');
    if (!findLower || !str.toLowerCase().includes(findLower)) return str;
    try {
      const escaped = findText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const parts = str.split(new RegExp(`(${escaped})`, 'gi'));
      return parts.map((p, i) =>
        i % 2 === 1
          ? <mark key={i} style={{ background: '#fef08a', color: '#1e293b', borderRadius: '2px', padding: '0 1px' }}>{p}</mark>
          : p
      );
    } catch { return str; }
  };

  const activeFilterCount = Object.keys(colFilters).length;

  const toggleFilterValue = (colIdx, val, allVals) => {
    setColFilters(prev => {
      const currentAllowed = prev[colIdx] ? new Set(prev[colIdx]) : new Set(allVals);
      if (currentAllowed.has(val)) currentAllowed.delete(val);
      else currentAllowed.add(val);
      if (currentAllowed.size >= allVals.length) {
        const next = { ...prev };
        delete next[colIdx];
        return next;
      }
      return { ...prev, [colIdx]: currentAllowed };
    });
  };

  const openFilterDropdown = (e, colIdx) => {
    e.stopPropagation();
    if (openFilterCol === colIdx) { setOpenFilterCol(null); setFilterSearch(''); return; }
    const th = e.currentTarget.closest('th') || e.currentTarget;
    const rect = th.getBoundingClientRect();
    const dropdownWidth = 230;
    // Use scrollX/scrollY to convert from viewport to page coords for the portal
    let left = rect.left + window.scrollX;
    const top = rect.bottom + window.scrollY + 4;
    if (left + dropdownWidth > window.innerWidth + window.scrollX - 8) left = rect.right + window.scrollX - dropdownWidth;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    setDropdownPos({ top, left });
    setOpenFilterCol(colIdx);
    setFilterSearch('');
  };

  const clearAll = () => { setColFilters({}); setFindText(''); setOpenFilterCol(null); setFilterSearch(''); };

  const dropdownVals = openFilterCol !== null ? getUniqueVals(openFilterCol) : [];
  const filteredDropdownVals = filterSearch.trim()
    ? dropdownVals.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
    : dropdownVals;
  const activeAllowed = openFilterCol !== null && colFilters[openFilterCol]
    ? colFilters[openFilterCol]
    : new Set(dropdownVals);

  return (
    <div style={{ position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 12px', flex: '1', minWidth: '160px', maxWidth: '280px' }}>
          <Search size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Find in table..."
            value={findText}
            onChange={e => setFindText(e.target.value)}
            style={{ background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '13px', flex: 1, outline: 'none', minWidth: 0 }}
          />
          {findText && (
            <button onClick={() => setFindText('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', lineHeight: 1 }}>✕</button>
          )}
        </div>
        {findLower && (
          <span style={{ fontSize: '12px', color: matchCount > 0 ? 'var(--primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {matchCount} match{matchCount !== 1 ? 'es' : ''}
          </span>
        )}
        {activeFilterCount > 0 && (
          <span style={{ fontSize: '12px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', padding: '3px 9px', borderRadius: '8px', fontWeight: '600', whiteSpace: 'nowrap' }}>
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
          </span>
        )}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {filteredRows.length.toLocaleString()} / {allRows.length.toLocaleString()} rows
        </span>
        {(findText || activeFilterCount > 0) && (
          <button onClick={clearAll} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            Clear All
          </button>
        )}
      </div>

      {/* Scrollable table */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh' }}>
        <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: '13px', fontFamily: 'inherit' }}>
          <thead>
            <tr>
              {headers.map((h, ci) => {
                const hasFilter = !!colFilters[ci];
                return (
                  <th key={ci} style={{
                    padding: '10px 14px', background: 'var(--bg-dark)', color: 'var(--text-main)', fontWeight: '700', fontSize: '12px',
                    textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2,
                    borderBottom: '2px solid var(--border)', borderRight: ci < headers.length - 1 ? '1px solid var(--border)' : 'none',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}>
                      <span>{h ?? ''}</span>
                      <button
                        onClick={e => openFilterDropdown(e, ci)}
                        title={`Filter by ${h ?? ''}`}
                        style={{
                          background: hasFilter ? 'rgba(99,102,241,0.15)' : 'none',
                          border: hasFilter ? '1px solid rgba(99,102,241,0.3)' : 'none',
                          borderRadius: '4px', cursor: 'pointer', padding: '2px 3px',
                          color: hasFilter ? 'var(--primary)' : 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', lineHeight: 1, flexShrink: 0
                        }}
                      >
                        <Filter size={10} />
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, ri) => {
              const isGrandTotal = String(row[0] || '').toLowerCase().includes('grand total') || String(row[0] || '').toLowerCase().includes('total');
              const isLast = ri === filteredRows.length - 1;
              return (
                <tr key={ri} style={{ background: isGrandTotal ? 'rgba(99,102,241,0.06)' : ri % 2 === 0 ? 'transparent' : 'var(--glass-subtle)' }}>
                  {headers.map((_, ci) => {
                    const val = row[ci] ?? '';
                    const numeric = isNum(val);
                    const displayVal = typeof val === 'number' ? val.toLocaleString() : String(val);
                    return (
                      <td key={ci} style={{
                        padding: '8px 14px',
                        textAlign: numeric ? 'right' : (ci === 0 ? 'left' : 'center'),
                        borderBottom: isLast ? 'none' : '1px solid var(--border)',
                        borderRight: ci < headers.length - 1 ? '1px solid var(--border)' : 'none',
                        color: val === '' || val === null || val === undefined ? 'var(--text-muted)' : (isGrandTotal ? 'var(--primary)' : 'var(--text-main)'),
                        fontWeight: isGrandTotal ? '700' : '400',
                        whiteSpace: 'nowrap'
                      }}>
                        {highlight(displayVal)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr><td colSpan={headers.length} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                {activeFilterCount > 0 || findText ? 'No rows match the current filters.' : 'No rows to display.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Filter dropdown — portal-rendered on body to escape backdrop-filter containing block */}
      {openFilterCol !== null && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999,
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)', width: '230px', overflow: 'hidden'
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
              {headers[openFilterCol] ?? ''}
            </span>
            <button onClick={() => { setOpenFilterCol(null); setFilterSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>

          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text"
              placeholder="Search values..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              autoFocus
              style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 10px', color: 'var(--input-text)', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => setColFilters(prev => { const n = { ...prev }; delete n[openFilterCol]; return n; })}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'inherit' }}
            >All</button>
            <button
              onClick={() => setColFilters(prev => ({ ...prev, [openFilterCol]: new Set() }))}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'inherit' }}
            >None</button>
            {colFilters[openFilterCol] && (
              <button
                onClick={() => { setColFilters(prev => { const n = { ...prev }; delete n[openFilterCol]; return n; }); setOpenFilterCol(null); setFilterSearch(''); }}
                style={{ background: 'none', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: 'var(--primary)', fontFamily: 'inherit' }}
              >Clear</button>
            )}
          </div>

          <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '4px 0' }}>
            {filteredDropdownVals.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No values</div>
            ) : filteredDropdownVals.map((val, i) => {
              const checked = activeAllowed.has(val);
              return (
                <label
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-main)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-subtle)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFilterValue(openFilterCol, val, dropdownVals)}
                    style={{ width: '14px', height: '14px', accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {val === '' ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>(empty)</span> : val}
                  </span>
                </label>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ViewReport() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [masterFile, setMasterFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [reportResult, setReportResult] = useState(null); // { aoa, sections, topHeader }
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
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
      } catch (err) { console.error('Error:', err); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  const categoryTemplates = templates
    .filter(t => !selectedCategory || (selectedCategory.templateIds || []).includes(t.id))
    .filter(t =>
      !templateSearch.trim() ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(templateSearch.toLowerCase())
    );

  const handleCategorySelect = (cat) => {
    setSelectedCategory(cat);
    setTemplateSearch('');
    setStep(1);
  };

  const handleFileChange = (file) => {
    if (file && (file.type === 'text/csv' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setMasterFile(file);
      setError(null);
      setStep(2);
    } else {
      setError('Please upload a valid Excel or CSV file.');
    }
  };

  const handleTemplateSelect = async (template) => {
    setSelectedTemplate(template);
    setIsProcessing(true);
    setError(null);
    try {
      const result = await processTemplateForView(template, masterFile);
      setReportResult(result);
      setStep(3);
    } catch (err) {
      console.error('Processing error:', err);
      setError(`Failed to process report: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Download directly from card without entering preview (for all previewable templates)
  const handleCardDownload = async (e, template) => {
    e.stopPropagation();
    setSelectedTemplate(template);
    setIsProcessing(true);
    setError(null);
    try {
      const result = await processTemplateForView(template, masterFile);
      await downloadAsExcel(result.aoa, result.sections, template.name, result.topHeader);
    } catch (err) {
      setError(`Download failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setSelectedTemplate(null);
    }
  };

  const handleDownload = async () => {
    if (!reportResult) return;
    setIsDownloading(true);
    try {
      await downloadAsExcel(reportResult.aoa, reportResult.sections, selectedTemplate?.name, reportResult.topHeader);
    } catch (err) {
      setError(`Download failed: ${err.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const goBackToTemplates = () => {
    setStep(2);
    setSelectedTemplate(null);
    setReportResult(null);
    setError(null);
  };

  const goBackToCategories = () => {
    setStep(0);
    setSelectedCategory(null);
    setMasterFile(null);
    setSelectedTemplate(null);
    setReportResult(null);
    setError(null);
  };

  const goBackToUpload = () => {
    setStep(1);
    setMasterFile(null);
    setSelectedTemplate(null);
    setReportResult(null);
    setError(null);
  };

  // ── Step 0: Category Selection ─────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="generate-report">
        <header className="page-header">
          <h1 className="page-title">View Report</h1>
          <p className="page-description">Select a category to preview reports directly in the app.</p>
        </header>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
            <Loader2 size={32} className="spinner" style={{ display: 'block', margin: '0 auto 16px' }} />
            Loading categories...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            <div
              onClick={() => handleCategorySelect(null)}
              className="glass"
              style={{ padding: '32px', cursor: 'pointer', borderRadius: '20px', border: '1px solid var(--border)', transition: 'transform 0.15s, box-shadow 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <LayoutGrid size={26} color="white" />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: '700', marginBottom: '8px' }}>All Templates</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>Access every available report template.</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', background: 'var(--glass-bg)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '8px', color: 'var(--text-muted)' }}>{templates.length} templates</span>
                <ArrowRight size={16} color="var(--primary)" />
              </div>
            </div>
            {categories.map(cat => {
              const count = (cat.templateIds || []).length;
              return (
                <div
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat)}
                  className="glass"
                  style={{ padding: '32px', cursor: 'pointer', borderRadius: '20px', border: '1px solid var(--border)', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                >
                  <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <Tag size={26} color="var(--primary)" />
                  </div>
                  <h3 style={{ fontSize: '17px', fontWeight: '700', marginBottom: '6px' }}>{cat.name}</h3>
                  {cat.description && <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.5' }}>{cat.description}</p>}
                  {cat.masterExcelFormatNotes && (
                    <div style={{ background: 'var(--glass-subtle)', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '12px', maxHeight: '72px', overflow: 'hidden' }}>
                      <AlignLeft size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-top' }} />{cat.masterExcelFormatNotes}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                    <span style={{ fontSize: '12px', background: 'var(--glass-bg)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '8px', color: 'var(--text-muted)' }}>{count} template{count !== 1 ? 's' : ''}</span>
                    <ArrowRight size={16} color="var(--primary)" />
                  </div>
                </div>
              );
            })}
            {categories.length === 0 && templates.length > 0 && (
              <div className="glass" style={{ gridColumn: '1/-1', padding: '40px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '20px' }}>
                <FolderOpen size={32} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.4 }} />
                <p>No categories created yet. <strong>Click "All Templates"</strong> to continue.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Step 1: Upload Master Excel ────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="generate-report">
        <header className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <button onClick={goBackToCategories} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', padding: '4px 0', fontFamily: 'inherit' }}>
              <ChevronLeft size={16} /> Back to Categories
            </button>
          </div>
          <h1 className="page-title">{selectedCategory ? selectedCategory.name : 'All Templates'}</h1>
          <p className="page-description">Upload your master Excel file to preview reports.</p>
        </header>

        {selectedCategory?.masterExcelFormatNotes && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '16px', padding: '16px 20px', marginBottom: '28px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <AlignLeft size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>
              <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Master Excel Format Notes</p>
              <p style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{selectedCategory.masterExcelFormatNotes}</p>
            </div>
          </div>
        )}

        <div className="glass" style={{ padding: '48px', maxWidth: '600px', margin: '0 auto', borderRadius: '24px' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>1</span>
            Upload Master Excel File
          </h3>
          <div
            className={`upload-zone ${isDragging ? 'dragging' : ''}`}
            onClick={() => fileInputRef.current.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handleFileChange(e.dataTransfer.files[0]); }}
            style={{ padding: '60px', border: '2px dashed var(--border)', borderRadius: '24px', textAlign: 'center', cursor: 'pointer', transition: '0.3s' }}
          >
            <input type="file" ref={fileInputRef} onChange={e => handleFileChange(e.target.files[0])} style={{ display: 'none' }} accept=".xlsx,.xls,.csv" />
            <div className="upload-icon"><Upload size={32} /></div>
            <p style={{ fontWeight: '600', fontSize: '16px' }}>Click or drag Excel/CSV file here</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>Your data stays 100% in your browser.</p>
          </div>
          {error && <div className="alert-error" style={{ marginTop: '20px' }}>{error}</div>}
        </div>
      </div>
    );
  }

  // ── Step 2: Report Card Selection ──────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="generate-report">
        <header className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <button onClick={goBackToUpload} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', padding: '4px 0', fontFamily: 'inherit' }}>
              <ChevronLeft size={16} /> Change File
            </button>
            <span style={{ color: 'var(--border)' }}>|</span>
            <button onClick={goBackToCategories} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', padding: '4px 0', fontFamily: 'inherit' }}>
              <FolderOpen size={14} /> {selectedCategory ? selectedCategory.name : 'All Templates'}
            </button>
          </div>
          <h1 className="page-title">Select Report to View</h1>
          <p className="page-description">
            File: <strong style={{ color: 'var(--primary)' }}>{masterFile?.name}</strong>
            {' · '}Choose a report template to preview.
          </p>
        </header>

        {error && <div className="alert-error" style={{ marginBottom: '20px' }}>{error}</div>}

        {/* Search bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: 'var(--glass-bg)', border: '1px solid var(--border)', borderRadius: '14px', marginBottom: '20px' }}>
          <Search size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search reports..."
            value={templateSearch}
            onChange={e => setTemplateSearch(e.target.value)}
            style={{ background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '14px', flex: 1, outline: 'none' }}
          />
          {templateSearch && (
            <button
              onClick={() => setTemplateSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px', lineHeight: 1 }}
            >
              ✕
            </button>
          )}
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {categoryTemplates.length} result{categoryTemplates.length !== 1 ? 's' : ''}
          </span>
        </div>

        {categoryTemplates.length === 0 ? (
          <div className="glass" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '20px' }}>
            <Table2 size={36} style={{ display: 'block', margin: '0 auto 16px', opacity: 0.4 }} />
            <p>{templateSearch ? `No reports match "${templateSearch}".` : 'No templates in this category.'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {categoryTemplates.map(t => {
              const isLoading = isProcessing && selectedTemplate?.id === t.id;
              const isScoreboard = t.type === 'scoreboard';
              const typeLabel = t.type === 'pivot' ? 'Pivot' : t.type === 'multi_table' ? 'Multi-Table' : isScoreboard ? 'Scoreboard' : 'Direct Mapping';
              const typeColor = t.type === 'pivot' ? 'var(--secondary)' : isScoreboard ? 'var(--warning)' : 'var(--primary)';
              return (
                <div
                  key={t.id}
                  onClick={() => !isProcessing && !isScoreboard && handleTemplateSelect(t)}
                  className="glass"
                  style={{
                    padding: '24px', cursor: isScoreboard ? 'default' : isProcessing ? 'wait' : 'pointer',
                    borderRadius: '16px', border: '1px solid var(--border)',
                    transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                    display: 'flex', flexDirection: 'column'
                  }}
                  onMouseEnter={e => { if (!isProcessing && !isScoreboard) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.15)'; e.currentTarget.style.borderColor = 'var(--primary)'; } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  {/* Card header: icon + type badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--glass-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isLoading ? <Loader2 size={22} className="spinner" color="var(--primary)" /> : t.type === 'pivot' ? <BarChart4 size={22} color={typeColor} /> : <Table2 size={22} color={typeColor} />}
                    </div>
                    <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '6px', background: 'var(--glass-bg)', border: '1px solid var(--border)', color: typeColor, fontWeight: '600' }}>{typeLabel}</span>
                  </div>

                  {/* Name + description */}
                  <p style={{ fontWeight: '700', fontSize: '15px', marginBottom: '6px' }}>{t.name}</p>
                  {t.description && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.5' }}>{t.description}</p>}

                  {/* Scoreboard: explain + redirect button */}
                  {isScoreboard ? (
                    <div style={{ marginTop: 'auto' }}>
                      <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px' }}>
                        <p style={{ fontSize: '11px', color: 'var(--warning)', fontWeight: '600', marginBottom: '3px' }}>Not available for in-app preview</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                          Scoreboard reports use complex Excel cell merges and custom layouts that can only be rendered as a styled Excel file.
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); navigate('/generate'); }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                          padding: '9px 14px', borderRadius: '10px', border: '1px solid var(--warning)',
                          background: 'rgba(245,158,11,0.08)', color: 'var(--warning)', cursor: 'pointer',
                          fontSize: '13px', fontWeight: '600', fontFamily: 'inherit'
                        }}
                      >
                        <ExternalLink size={14} /> Go to Generate Reports
                      </button>
                    </div>
                  ) : (
                    /* Previewable: column count + Preview + Download buttons */
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '12px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {t.type === 'pivot' ? `${(t.pivotColumns?.length || 0)} pivot columns` : `${(t.mappings?.length || 0)} columns`}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Download directly without preview */}
                        <button
                          onClick={e => handleCardDownload(e, t)}
                          disabled={isProcessing}
                          title="Download without preview"
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px',
                            borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--glass-bg)',
                            color: 'var(--text-muted)', cursor: isProcessing ? 'wait' : 'pointer',
                            fontSize: '12px', fontWeight: '500', fontFamily: 'inherit'
                          }}
                        >
                          {isLoading ? <Loader2 size={12} className="spinner" /> : <Download size={12} />}
                          Download
                        </button>
                        {/* Preview */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontSize: '12px', fontWeight: '600' }}>
                          <Eye size={13} /> Preview
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Step 3: Report View ────────────────────────────────────────────────────
  const { aoa, sections, topHeader } = reportResult || {};
  const totalRows = aoa ? aoa.length - 1 : sections ? sections.reduce((s, sec) => s + sec.aoa.length - 1, 0) : 0;

  return (
    <div className="generate-report">
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <button onClick={goBackToTemplates} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', padding: '4px 0', fontFamily: 'inherit' }}>
              <ChevronLeft size={16} /> Back to Reports
            </button>
          </div>
          <h1 className="page-title">{selectedTemplate?.name || 'Report'}</h1>
          <p className="page-description" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FileSpreadsheet size={13} /> {masterFile?.name}
            </span>
            <span style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '8px', fontSize: '12px' }}>
              {totalRows.toLocaleString()} rows
            </span>
            {selectedCategory && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontSize: '12px' }}>
                <Tag size={11} /> {selectedCategory.name}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', flexShrink: 0 }}
        >
          {isDownloading ? <><Loader2 size={16} className="spinner" /> Downloading...</> : <><Download size={16} /> Download Excel</>}
        </button>
      </header>

      {error && <div className="alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

      {topHeader && (
        <div style={{ background: 'var(--glass-subtle)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 20px', marginBottom: '20px', textAlign: 'center', fontWeight: '700', fontSize: '16px' }}>
          {topHeader}
        </div>
      )}

      {sections ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {sections.map((sec, i) => (
            <div key={i} className="glass" style={{ borderRadius: '16px' }}>
              {sec.title && (
                <div style={{ padding: '14px 20px', background: 'var(--glass-subtle)', borderBottom: '1px solid var(--border)', fontWeight: '700', fontSize: '14px', borderRadius: '16px 16px 0 0' }}>
                  {sec.title}
                </div>
              )}
              <ReportTable aoa={sec.aoa} />
            </div>
          ))}
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: '16px', padding: '0' }}>
          <ReportTable aoa={aoa} />
        </div>
      )}
    </div>
  );
}
