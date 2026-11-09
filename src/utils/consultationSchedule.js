// Daily Doctor Schedule ("consultation_schedule" template type).
//
// For one doctor and one date, shows what the doctor is doing in every time slot of the day:
// C = Consultation, R = Review, T = Treatment, HV = House Visit, FIT = Fitness, or "Free".
// Self-contained: does not touch any other report engine.
import ExcelJS from 'exceljs';

export const DEFAULT_ACTIVITY_TYPES = [
  { id: 'at_c',   code: 'C',   label: 'Consultation', values: [], color: 'FFBBDEFB' },
  { id: 'at_r',   code: 'R',   label: 'Review',       values: [], color: 'FFE1BEE7' },
  { id: 'at_t',   code: 'T',   label: 'Treatment',    values: [], color: 'FFFFE0B2' },
  { id: 'at_hv',  code: 'HV',  label: 'House Visit',  values: [], color: 'FFB2DFDB' },
  { id: 'at_fit', code: 'FIT', label: 'Fitness',      values: [], color: 'FFC8E6C9' },
];

const FREE_COLOR = 'FFF5F5F5';

const clean = (s) => String(s ?? '').trim().replace(/^["'\s]+|["'\s]+$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const getVal = (row, col) => {
  if (!col || !row) return '';
  const c = clean(col);
  if (row[c] !== undefined && row[c] !== null) return row[c];
  const n = norm(c);
  const k = Object.keys(row).find(key => norm(key) === n);
  return k !== undefined ? row[k] : '';
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');

// → 'YYYY-MM-DD' or null
export function parseDateKey(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const fromDate = (d) => (d && !isNaN(d.getTime())) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null;
  if (raw instanceof Date) return fromDate(raw);
  const asNum = typeof raw === 'number' ? raw : (/^\d+(\.\d+)?$/.test(String(raw).trim()) ? parseFloat(raw) : NaN);
  if (!isNaN(asNum)) {
    if (asNum > 20000 && asNum < 100000) {
      const d = new Date(Math.round((asNum - 25569) * 86400000));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    return null;
  }
  const s = String(raw).trim();
  // "Wednesday, Apr 1 - 2026 , 6:15 AM"  /  "Apr 1, 2026"  /  "Apr 1 2026"
  let m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2})\s*[-,–]?\s*(\d{4})/);
  if (m) { const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(parseInt(m[2], 10))}`; }
  // "1 Apr 2026"
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3,9})[\s,.-]+(\d{4})/);
  if (m) { const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(parseInt(m[1], 10))}`; }
  // "01/04/2026" or "1-4-26" → day first (India)
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10); return `${y}-${pad(parseInt(m[2], 10))}-${pad(parseInt(m[1], 10))}`; }
  // ISO "2026-04-01"
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return fromDate(new Date(s));
}

export const formatDateKey = (dk) => {
  if (!dk) return '';
  const [y, m, d] = dk.split('-');
  return `${d}/${m}/${y}`;
};

// → array of minutes-since-midnight found in the value (0, 1 or 2 entries).
// Handles Excel fractions/serials, "6:15 AM", "18:30", and strings like "Wed, Apr 1 - 2026 , 6:15 AM".
export function parseTimesInMinutes(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (raw instanceof Date) return [raw.getHours() * 60 + raw.getMinutes()];
  const asNum = typeof raw === 'number' ? raw : (/^\d+(\.\d+)?$/.test(String(raw).trim()) ? parseFloat(raw) : NaN);
  if (!isNaN(asNum)) {
    // Floor (not round) so 6:29:40 stays in the 6:00–6:30 slot; tiny epsilon absorbs float error (6:30:00 = 0.27083333…)
    const frac = asNum % 1;
    return [Math.floor(frac * 1440 + 1e-4) % 1440];
  }
  const out = [];
  const re = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/gi;
  let m;
  while ((m = re.exec(String(raw))) !== null) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (m[3]) {
      const pm = m[3].toUpperCase() === 'PM';
      if (pm && h !== 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    if (h > 23 || min > 59) continue;
    out.push(h * 60 + min);
  }
  return out;
}

const hhmmToMin = (s, fallback) => {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : fallback;
};

const fmtMin = (mins) => {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ap = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m)} ${ap}`;
};

const classify = (rawType, types) => {
  const canon = (v) => String(v ?? '').replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const t = canon(rawType);
  if (!t) return null;
  // Preferred: exact value picked from the appointment-type column in the designer
  const byValue = types.find(a => (a.values || []).some(v => canon(v) === t));
  if (byValue) return byValue;
  // Legacy templates: keyword "contains" match
  return types.find(a => (a.keywords || []).some(k => k && t.includes(String(k).toLowerCase().trim()))) || null;
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const formatMonthKey = (mk) => {
  if (!mk) return '';
  const [y, m] = mk.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};

// Global filters: keep only rows that satisfy every filter { conditionCol, operator, conditionVals[] }.
// Square brackets are ignored and matching is case-insensitive (same convention as the other reports).
const fnorm = (v) => String(v ?? '').replace(/[[\]]/g, '').toLowerCase().trim();
export function applyGlobalFilters(rows, template) {
  const filters = (template.globalFilters || []).filter(f => f.conditionCol && (f.conditionVals || []).length > 0);
  if (!filters.length) return rows || [];
  return (rows || []).filter(r => filters.every(f => {
    const v = fnorm(getVal(r, f.conditionCol));
    const cvs = f.conditionVals.map(fnorm);
    switch (f.operator) {
      case '!=': return cvs.every(c => v !== c);
      case 'contains': return cvs.some(c => v.includes(c));
      case 'not_contains': return cvs.every(c => !v.includes(c));
      default: return cvs.some(c => v === c);
    }
  }));
}

// Dropdown options from the uploaded file: unique doctors and available months (newest first).
export function getConsultationOptions(allRows, template) {
  const rows = applyGlobalFilters(allRows, template);
  const doctors = new Set();
  const months = new Set();
  const dateSource = template.dateCol || template.timeCol;
  (rows || []).forEach(r => {
    const d = String(getVal(r, template.doctorCol) ?? '').trim();
    if (d) doctors.add(d);
    const dk = parseDateKey(getVal(r, dateSource));
    if (dk) months.add(dk.slice(0, 7));
  });
  return {
    doctors: [...doctors].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    months: [...months].sort().reverse(),
  };
}

// Month grid: one row per calendar day, one column per time slot, each cell = counts per activity type.
export function buildDoctorSchedule(allRows, template, doctor, monthKey) {
  const rows = applyGlobalFilters(allRows, template);
  const types = (template.activityTypes && template.activityTypes.length) ? template.activityTypes : DEFAULT_ACTIVITY_TYPES;
  const step = Math.max(5, parseInt(template.slotMinutes, 10) || 30);
  const startMin = hhmmToMin(template.slotStart, 6 * 60);
  const endMin = hhmmToMin(template.slotEnd, 21 * 60);
  const dateSource = template.dateCol || template.timeCol;

  const slots = [];
  for (let s = startMin; s < endMin; s += step) {
    const to = Math.min(s + step, endMin);
    slots.push({ from: s, to, label: `${fmtMin(s)} - ${fmtMin(to)}` });
  }

  const want = String(doctor ?? '').trim().toLowerCase();
  let usedMonth = monthKey || '';
  if (!usedMonth) {
    rows.forEach(r => {
      if (String(getVal(r, template.doctorCol) ?? '').trim().toLowerCase() !== want) return;
      const dk = parseDateKey(getVal(r, dateSource));
      if (dk && dk.slice(0, 7) > usedMonth) usedMonth = dk.slice(0, 7);
    });
  }

  const [yy, mm] = (usedMonth || '1970-01').split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(Date.UTC(yy, mm - 1, d)).getUTCDay();
    days.push({ day: d, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow], cells: slots.map(() => ({})), total: 0 });
  }

  let outside = 0, unclassified = 0, matched = 0, noTime = 0;
  rows.forEach(r => {
    if (String(getVal(r, template.doctorCol) ?? '').trim().toLowerCase() !== want) return;
    const dk = parseDateKey(getVal(r, dateSource));
    if (!usedMonth || !dk || dk.slice(0, 7) !== usedMonth) return;

    const type = classify(getVal(r, template.typeCol), types);
    if (!type) { unclassified++; return; }

    // Check-in time only: the first time found in the cell. Any check-out time is ignored.
    const times = parseTimesInMinutes(getVal(r, template.timeCol));
    if (!times.length) { noTime++; return; }
    const s = times[0];
    // Each appointment is counted exactly once, in the slot that contains its check-in time.
    const idx = slots.findIndex(sl => s >= sl.from && s < sl.to);
    if (idx < 0) { outside++; return; }
    matched++;
    const day = days[parseInt(dk.slice(8, 10), 10) - 1];
    day.cells[idx][type.code] = (day.cells[idx][type.code] || 0) + 1;
    day.total++;
  });

  return { slots, days, usedMonth, matched, outside, unclassified, noTime, types };
}

export async function buildConsultationScheduleWorkbook(rows, template, doctor, monthKey) {
  const sched = buildDoctorSchedule(rows, template, doctor, monthKey);
  const freeLabel = template.freeLabel ?? 'Free';
  const { slots, days, types } = sched;
  const totalCols = 2 + slots.length + 1; // Day | Date | slots… | Total

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Monthly Schedule', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const thin = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const style = (cell, o) => Object.assign(cell, o);

  const title = `${template.reportTitle || 'Daily Doctor Schedule'} - ${doctor} - ${formatMonthKey(sched.usedMonth)}`;
  const r1 = ws.addRow([title, ...Array(totalCols - 1).fill(null)]);
  ws.mergeCells(1, 1, 1, totalCols);
  r1.height = 28;
  style(r1.getCell(1), { font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: solid('FF1A237E'), border: thin });

  const hdr = ws.addRow(['Day', 'Date', ...slots.map(s => s.label), 'Total']);
  hdr.height = 34;
  for (let c = 1; c <= totalCols; c++) {
    style(hdr.getCell(c), { font: { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: solid('FF2E7D32'), border: thin });
  }

  const colTotals = slots.map(() => 0);
  days.forEach(d => {
    const vals = d.cells.map(cell => {
      const parts = types.filter(t => cell[t.code]).map(t => `${t.code}-${cell[t.code]}`);
      return parts.length ? parts.join(', ') : freeLabel;
    });
    const row = ws.addRow([d.dow, `${pad(d.day)}/${sched.usedMonth.slice(5, 7)}/${sched.usedMonth.slice(0, 4)}`, ...vals, d.total]);
    row.height = 20;
    for (let c = 1; c <= totalCols; c++) {
      const isSlot = c >= 3 && c < totalCols;
      let fill = 'FFFFFFFF';
      if (isSlot) {
        const cell = d.cells[c - 3];
        const first = types.find(t => cell[t.code]);
        fill = first ? (first.color || FREE_COLOR) : FREE_COLOR;
        if (first) colTotals[c - 3] += Object.values(cell).reduce((a, b) => a + b, 0);
      } else if (d.dow === 'Sun') fill = 'FFFFEBEE';
      style(row.getCell(c), { font: { size: 9, bold: !isSlot }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: solid(fill), border: thin });
    }
  });

  const tot = ws.addRow(['Total', '', ...colTotals, colTotals.reduce((a, b) => a + b, 0)]);
  ws.mergeCells(tot.number, 1, tot.number, 2);
  for (let c = 1; c <= totalCols; c++) style(tot.getCell(c), { font: { bold: true, size: 10 }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: solid('FFE8EAF6'), border: thin });

  ws.addRow([]);
  const legend = ws.addRow(['Legend:', '', types.map(t => `${t.code} = ${t.label}`).join('   |   ') + `   |   ${freeLabel} = no work`]);
  legend.getCell(1).font = { bold: true, size: 9 };
  legend.getCell(3).font = { size: 9 };
  const notes = [];
  if (sched.outside > 0) notes.push(`${sched.outside} check-in(s) fall outside ${template.slotStart || '06:00'} - ${template.slotEnd || '21:00'} and are not shown.`);
  if (sched.noTime > 0) notes.push(`${sched.noTime} row(s) have no readable check-in time and are not counted.`);
  if (sched.unclassified > 0) notes.push(`${sched.unclassified} row(s) have an appointment type not assigned to any code and are not counted.`);
  notes.forEach(txt => {
    const n = ws.addRow([`Note: ${txt}`]);
    n.getCell(1).font = { italic: true, size: 9, color: { argb: 'FFB71C1C' } };
  });

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 12;
  slots.forEach((_, i) => { ws.getColumn(3 + i).width = 13; });
  ws.getColumn(totalCols).width = 8;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

  return { buffer: await wb.xlsx.writeBuffer(), schedule: sched };
}
