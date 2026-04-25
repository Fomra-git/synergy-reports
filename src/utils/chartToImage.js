import { buildChartData } from '../components/ReportChart';

const THEMES = {
  steel:  { colors: ['#818cf8','#6366f1','#60a5fa','#4f46e5','#3b82f6','#c7d2fe'], bg: '#161a35' },
  ocean:  { colors: ['#38bdf8','#0ea5e9','#0284c7','#7dd3fc','#0369a1','#bae6fd'], bg: '#0c1d2e' },
  fire:   { colors: ['#f97316','#ef4444','#fbbf24','#f59e0b','#dc2626','#fed7aa'], bg: '#2a1010' },
  forest: { colors: ['#22c55e','#10b981','#84cc16','#4ade80','#059669','#bbf7d0'], bg: '#0c1f14' },
  violet: { colors: ['#a78bfa','#8b5cf6','#c084fc','#7c3aed','#d946ef','#e9d5ff'], bg: '#160e30' },
  sunset: { colors: ['#fb923c','#f43f5e','#fbbf24','#e11d48','#ec4899','#fed7aa'], bg: '#281020' },
};

const VW = 560, VH = 260;
const ML = 50, MR = 12, MT = 10, MB = 60;
const CW = VW - ML - MR;
const CH = VH - MT - MB;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtVal(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}
function niceMax(v) {
  if (v <= 0) return 10;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / e) * e;
}

function cartesianSVGStr(data, yKeys, colors, type) {
  const maxVal = niceMax(Math.max(...data.flatMap(d => yKeys.map(k => d[k] || 0)), 1));
  const n = data.length;
  const xStep = CW / Math.max(n, 1);
  const getX = i => ML + i * xStep + xStep / 2;
  const getY = v => MT + CH * (1 - Math.min(v, maxVal) / maxVal);

  let defs = '';
  if (type === 'area') {
    defs = '<defs>' + yKeys.map((k, i) =>
      `<linearGradient id="ag${i}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${colors[i % colors.length]}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${colors[i % colors.length]}" stop-opacity="0.02"/>
      </linearGradient>`
    ).join('') + '</defs>';
  }

  const grid = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const y = MT + CH * (1 - t);
    return `<line x1="${ML}" y1="${y}" x2="${ML + CW}" y2="${y}" stroke="rgba(255,255,255,0.07)"/>` +
      `<text x="${ML - 5}" y="${y + 3}" text-anchor="end" fill="rgba(255,255,255,0.45)" font-size="9" font-family="system-ui,sans-serif">${fmtVal(maxVal * t)}</text>`;
  }).join('');

  const axes = `<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + CH}" stroke="rgba(255,255,255,0.18)"/>` +
    `<line x1="${ML}" y1="${MT + CH}" x2="${ML + CW}" y2="${MT + CH}" stroke="rgba(255,255,255,0.18)"/>`;

  let areas = '';
  if (type === 'area' && n >= 2) {
    areas = yKeys.map((k, ki) => {
      const pts = data.map((d, i) => [getX(i), getY(d[k] || 0)]);
      const path = `M${pts[0][0]},${getY(0)} L${pts[0][0]},${pts[0][1]} ` +
        pts.slice(1).map(p => `L${p[0]},${p[1]}`).join(' ') +
        ` L${pts[n - 1][0]},${getY(0)} Z`;
      return `<path d="${path}" fill="url(#ag${ki})"/>`;
    }).join('');
  }

  let bars = '';
  if (type === 'bar') {
    bars = data.map((d, i) => {
      const gw = xStep * 0.78;
      const bw = gw / yKeys.length;
      const gx = getX(i) - gw / 2;
      return yKeys.map((k, ki) => {
        const val = d[k] || 0;
        const bh = Math.max(0, (val / maxVal) * CH);
        return `<rect x="${gx + ki * bw + 1}" y="${MT + CH - bh}" width="${Math.max(1, bw - 3)}" height="${bh}" fill="${colors[ki % colors.length]}" rx="3" opacity="0.88"/>`;
      }).join('');
    }).join('');
  }

  let lines = '';
  if (type === 'line' || type === 'area') {
    lines = yKeys.map((k, ki) => {
      const c = colors[ki % colors.length];
      const pts = data.map((d, i) => `${getX(i)},${getY(d[k] || 0)}`).join(' ');
      const dots = data.map((d, i) =>
        `<circle cx="${getX(i)}" cy="${getY(d[k] || 0)}" r="4" fill="${c}" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>`
      ).join('');
      return `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>${dots}`;
    }).join('');
  }

  const xLabels = data.map((d, i) => {
    const x = getX(i), y = MT + CH + 14;
    return `<text x="${x}" y="${y}" text-anchor="end" fill="rgba(255,255,255,0.55)" font-size="9" font-family="system-ui,sans-serif" transform="rotate(-38,${x},${y})">${esc(d.name.slice(0, 18))}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}">
    ${defs}${grid}${axes}${areas}${bars}${lines}${xLabels}
  </svg>`;
}

function pieSVGStr(data, yKey, colors, donut) {
  const total = data.reduce((s, d) => s + (d[yKey] || 0), 0);
  if (!total) return null;
  const cx = VW / 2, cy = VH / 2, R = 95, IR = donut ? 44 : 0;
  let angle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const v = d[yKey] || 0;
    const frac = v / total;
    const sweep = frac * 2 * Math.PI;
    const a1 = angle, a2 = angle + sweep;
    angle = a2;
    const large = sweep > Math.PI ? 1 : 0;
    const [cos1, sin1, cos2, sin2] = [Math.cos(a1), Math.sin(a1), Math.cos(a2), Math.sin(a2)];
    const path = donut
      ? `M${cx + R * cos1},${cy + R * sin1} A${R},${R} 0 ${large} 1 ${cx + R * cos2},${cy + R * sin2} L${cx + IR * cos2},${cy + IR * sin2} A${IR},${IR} 0 ${large} 0 ${cx + IR * cos1},${cy + IR * sin1} Z`
      : `M${cx},${cy} L${cx + R * cos1},${cy + R * sin1} A${R},${R} 0 ${large} 1 ${cx + R * cos2},${cy + R * sin2} Z`;
    const midA = a1 + sweep / 2;
    const lr = donut ? (R + IR) / 2 : R * 0.62;
    const label = frac > 0.04
      ? `<text x="${cx + lr * Math.cos(midA)}" y="${cy + lr * Math.sin(midA)}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="11" font-weight="700" font-family="system-ui,sans-serif">${Math.round(frac * 100)}%</text>`
      : '';
    return `<path d="${path}" fill="${colors[i % colors.length]}" opacity="0.9" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>${label}`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}">${slices}</svg>`;
}

function radarSVGStr(data, yKey, colors) {
  const n = Math.min(data.length, 12);
  const pts = data.slice(0, n);
  const maxVal = niceMax(Math.max(...pts.map(d => d[yKey] || 0), 1));
  const cx = VW / 2, cy = VH / 2, R = 90;
  const aStep = (2 * Math.PI) / n;
  const pt = (i, v) => {
    const a = i * aStep - Math.PI / 2;
    const r = (v / maxVal) * R;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  const rings = [0.25, 0.5, 0.75, 1].map(t =>
    `<polygon points="${Array.from({ length: n }, (_, i) => pt(i, maxVal * t).join(',')).join(' ')}" fill="none" stroke="rgba(255,255,255,0.1)"/>`
  ).join('');

  const spokes = Array.from({ length: n }, (_, i) => {
    const [x, y] = pt(i, maxVal);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,0.1)"/>`;
  }).join('');

  const polyPts = pts.map((d, i) => pt(i, d[yKey] || 0).join(',')).join(' ');

  const dots = pts.map((d, i) => {
    const [x, y] = pt(i, d[yKey] || 0);
    return `<circle cx="${x}" cy="${y}" r="4" fill="${colors[0]}" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>`;
  }).join('');

  const labels = pts.map((d, i) => {
    const [x, y] = pt(i, maxVal * 1.18);
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.6)" font-size="10" font-family="system-ui,sans-serif">${esc(d.name.slice(0, 10))}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}">
    ${rings}${spokes}<polygon points="${polyPts}" fill="${colors[0]}" fill-opacity="0.22" stroke="${colors[0]}" stroke-width="2.5"/>
    ${dots}${labels}
  </svg>`;
}

function buildChartSVGString(config, aoa) {
  const { type = 'bar', xColumn, yColumns = [], colorTheme = 'steel', maxItems = 50 } = config;
  const theme = THEMES[colorTheme] || THEMES.steel;
  const { data, yKeys } = buildChartData(aoa, xColumn, yColumns, maxItems);
  if (!data.length || !yKeys.length) return null;
  if (type === 'pie' || type === 'donut') return pieSVGStr(data, yKeys[0], theme.colors, type === 'donut');
  if (type === 'radar') return radarSVGStr(data, yKeys[0], theme.colors);
  return cartesianSVGStr(data, yKeys, theme.colors, type);
}

function svgStringToBuffer(svgString, bgColor) {
  return new Promise((resolve, reject) => {
    const SCALE = 2;
    const canvas = document.createElement('canvas');
    canvas.width = VW * SCALE;
    canvas.height = VH * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, VW, VH);

    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, VW, VH);
      URL.revokeObjectURL(url);
      canvas.toBlob(pngBlob => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(pngBlob);
      }, 'image/png');
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export async function chartConfigToImageBuffer(config, aoa) {
  const theme = THEMES[(config || {}).colorTheme] || THEMES.steel;
  const svgStr = buildChartSVGString(config, aoa);
  if (!svgStr) return null;
  return svgStringToBuffer(svgStr, theme.bg);
}
