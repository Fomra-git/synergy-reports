import React, { useMemo } from 'react';

// ── Themes ──────────────────────────────────────────────────────────────────
const THEMES = {
  steel:  { colors: ['#818cf8','#6366f1','#60a5fa','#4f46e5','#3b82f6','#c7d2fe'], card: 'linear-gradient(145deg,rgba(99,102,241,0.12) 0%,rgba(79,70,229,0.06) 100%)', border: 'rgba(129,140,248,0.35)', glow: '#818cf8' },
  ocean:  { colors: ['#38bdf8','#0ea5e9','#0284c7','#7dd3fc','#0369a1','#bae6fd'], card: 'linear-gradient(145deg,rgba(14,165,233,0.12) 0%,rgba(2,132,199,0.06) 100%)',  border: 'rgba(56,189,248,0.35)',   glow: '#38bdf8' },
  fire:   { colors: ['#f97316','#ef4444','#fbbf24','#f59e0b','#dc2626','#fed7aa'], card: 'linear-gradient(145deg,rgba(249,115,22,0.12) 0%,rgba(239,68,68,0.06) 100%)',   border: 'rgba(249,115,22,0.35)',   glow: '#f97316' },
  forest: { colors: ['#22c55e','#10b981','#84cc16','#4ade80','#059669','#bbf7d0'], card: 'linear-gradient(145deg,rgba(34,197,94,0.12) 0%,rgba(16,185,129,0.06) 100%)',   border: 'rgba(34,197,94,0.35)',    glow: '#22c55e' },
  violet: { colors: ['#a78bfa','#8b5cf6','#c084fc','#7c3aed','#d946ef','#e9d5ff'], card: 'linear-gradient(145deg,rgba(139,92,246,0.12) 0%,rgba(124,58,237,0.06) 100%)', border: 'rgba(167,139,250,0.35)',  glow: '#a78bfa' },
  sunset: { colors: ['#fb923c','#f43f5e','#fbbf24','#e11d48','#ec4899','#fed7aa'], card: 'linear-gradient(145deg,rgba(251,146,60,0.12) 0%,rgba(244,63,94,0.06) 100%)',   border: 'rgba(251,146,60,0.35)',   glow: '#fb923c' },
};
const ICONS = { bar: '▊', line: '↗', area: '◿', pie: '◕', donut: '◎', radar: '⬡' };

// ── Data builder ─────────────────────────────────────────────────────────────
export function buildChartData(aoa, xColumn, yColumns, maxItems = 50) {
  if (!aoa || aoa.length < 2) return { data: [], yKeys: [] };
  const headers = aoa[0].map(h => String(h ?? ''));
  const xIdx = headers.findIndex(h => h === xColumn);
  const validY = (yColumns || []).filter(Boolean);
  const yIdxs = validY.map(y => headers.findIndex(h => h === y)).filter(i => i >= 0);
  const yKeys = yIdxs.map(i => headers[i]);
  if (xIdx < 0 || !yIdxs.length) return { data: [], yKeys: [] };
  const data = aoa.slice(1, maxItems + 1).map(row => {
    const label = String(row[xIdx] ?? '').trim().slice(0, 25);
    if (!label) return null;
    const item = { name: label };
    yIdxs.forEach((yi, i) => {
      const n = parseFloat(String(row[yi] ?? '').replace(/,/g, ''));
      item[yKeys[i]] = isNaN(n) ? 0 : n;
    });
    return item;
  }).filter(Boolean);
  return { data, yKeys };
}

// ── SVG layout constants ──────────────────────────────────────────────────────
const VW = 560, VH = 260;
const ML = 50, MR = 12, MT = 10, MB = 60;
const CW = VW - ML - MR;   // 498
const CH = VH - MT - MB;   // 190

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

// ── Cartesian chart (bar / line / area) ──────────────────────────────────────
function CartesianSVG({ data, yKeys, colors, type }) {
  const maxVal = niceMax(Math.max(...data.flatMap(d => yKeys.map(k => d[k] || 0)), 1));
  const n = data.length;
  const xStep = CW / Math.max(n, 1);
  const getX = i => ML + i * xStep + xStep / 2;
  const getY = v => MT + CH * (1 - Math.min(v, maxVal) / maxVal);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }} aria-hidden="true">
      <defs>
        {type === 'area' && yKeys.map((k, i) => (
          <linearGradient key={k} id={`ag${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={colors[i % colors.length]} stopOpacity="0.45" />
            <stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity="0.02" />
          </linearGradient>
        ))}
      </defs>

      {/* Grid + Y labels */}
      {yTicks.map(t => {
        const y = MT + CH * (1 - t);
        return (
          <g key={t}>
            <line x1={ML} y1={y} x2={ML + CW} y2={y} stroke="rgba(255,255,255,0.07)" />
            <text x={ML - 5} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.45)" fontSize="9" fontFamily="system-ui,sans-serif">
              {fmtVal(maxVal * t)}
            </text>
          </g>
        );
      })}

      {/* Axes */}
      <line x1={ML} y1={MT} x2={ML} y2={MT + CH} stroke="rgba(255,255,255,0.18)" />
      <line x1={ML} y1={MT + CH} x2={ML + CW} y2={MT + CH} stroke="rgba(255,255,255,0.18)" />

      {/* Area fills */}
      {type === 'area' && yKeys.map((k, ki) => {
        if (n < 2) return null;
        const pts = data.map((d, i) => [getX(i), getY(d[k] || 0)]);
        const d = `M${pts[0][0]},${getY(0)} L${pts[0][0]},${pts[0][1]} ` +
          pts.slice(1).map(p => `L${p[0]},${p[1]}`).join(' ') +
          ` L${pts[n - 1][0]},${getY(0)} Z`;
        return <path key={k} d={d} fill={`url(#ag${ki})`} />;
      })}

      {/* Bars */}
      {type === 'bar' && data.map((d, i) => {
        const gw = xStep * 0.78;
        const bw = gw / yKeys.length;
        const gx = getX(i) - gw / 2;
        return yKeys.map((k, ki) => {
          const val = d[k] || 0;
          const bh = Math.max(0, (val / maxVal) * CH);
          const c = colors[ki % colors.length];
          return (
            <rect key={k}
              x={gx + ki * bw + 1} y={MT + CH - bh}
              width={Math.max(1, bw - 3)} height={bh}
              fill={c} rx="3" opacity="0.88"
            />
          );
        });
      })}

      {/* Lines + dots */}
      {(type === 'line' || type === 'area') && yKeys.map((k, ki) => {
        const c = colors[ki % colors.length];
        const pts = data.map((d, i) => `${getX(i)},${getY(d[k] || 0)}`);
        return (
          <g key={k}>
            <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth="2.5" strokeLinejoin="round" />
            {data.map((d, i) => (
              <circle key={i} cx={getX(i)} cy={getY(d[k] || 0)} r="4" fill={c} stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
            ))}
          </g>
        );
      })}

      {/* X labels */}
      {data.map((d, i) => {
        const x = getX(i);
        const y = MT + CH + 14;
        return (
          <text key={i} x={x} y={y} textAnchor="end" fill="rgba(255,255,255,0.55)"
            fontSize="9" fontFamily="system-ui,sans-serif"
            transform={`rotate(-38,${x},${y})`}
          >
            {d.name.slice(0, 18)}
          </text>
        );
      })}
    </svg>
  );
}

// ── Pie / Donut chart ─────────────────────────────────────────────────────────
function PieSVG({ data, yKey, colors, donut }) {
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
    const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
    const cos2 = Math.cos(a2), sin2 = Math.sin(a2);
    // Donut arc path
    const path = donut
      ? `M${cx + R * cos1},${cy + R * sin1} A${R},${R} 0 ${large} 1 ${cx + R * cos2},${cy + R * sin2} L${cx + IR * cos2},${cy + IR * sin2} A${IR},${IR} 0 ${large} 0 ${cx + IR * cos1},${cy + IR * sin1} Z`
      : `M${cx},${cy} L${cx + R * cos1},${cy + R * sin1} A${R},${R} 0 ${large} 1 ${cx + R * cos2},${cy + R * sin2} Z`;
    const midA = a1 + sweep / 2;
    const lr = donut ? (R + IR) / 2 : R * 0.62;
    return { path, midA, lr, frac, color: colors[i % colors.length], name: d.name };
  });

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }} aria-hidden="true">
      {slices.map((s, i) => (
        <g key={i}>
          <path d={s.path} fill={s.color} opacity="0.9" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
          {s.frac > 0.04 && (
            <text
              x={cx + s.lr * Math.cos(s.midA)} y={cy + s.lr * Math.sin(s.midA)}
              textAnchor="middle" dominantBaseline="middle"
              fill="white" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif"
            >
              {Math.round(s.frac * 100)}%
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Radar chart ───────────────────────────────────────────────────────────────
function RadarSVG({ data, yKey, colors }) {
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
  const outerPt = i => pt(i, maxVal);
  const polyPts = pts.map((d, i) => pt(i, d[yKey] || 0).join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }} aria-hidden="true">
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map(t => {
        const ring = Array.from({ length: n }, (_, i) => {
          const [x, y] = pt(i, maxVal * t); return `${x},${y}`;
        }).join(' ');
        return <polygon key={t} points={ring} fill="none" stroke="rgba(255,255,255,0.1)" />;
      })}
      {/* Spokes */}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = outerPt(i);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.1)" />;
      })}
      {/* Data */}
      <polygon points={polyPts} fill={colors[0]} fillOpacity="0.22" stroke={colors[0]} strokeWidth="2.5" />
      {pts.map((d, i) => {
        const [x, y] = pt(i, d[yKey] || 0);
        return <circle key={i} cx={x} cy={y} r="4" fill={colors[0]} stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />;
      })}
      {/* Labels */}
      {pts.map((d, i) => {
        const [x, y] = pt(i, maxVal * 1.18);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.6)" fontSize="10" fontFamily="system-ui,sans-serif"
          >
            {d.name.slice(0, 10)}
          </text>
        );
      })}
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReportChart({ config, aoa }) {
  const {
    type = 'bar', title = '', xColumn, yColumns = [],
    colorTheme = 'steel', showLegend = true, maxItems = 50,
  } = config || {};
  const theme = THEMES[colorTheme] || THEMES.steel;
  const { data, yKeys } = useMemo(
    () => buildChartData(aoa, xColumn, yColumns, maxItems),
    [aoa, xColumn, yColumns, maxItems],
  );
  const isEmpty = !data.length || !yKeys.length;

  const chartBody = isEmpty ? (
    <div style={{ height: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'rgba(255,255,255,0.35)', fontSize: '13px', fontFamily: 'system-ui,sans-serif' }}>
      <span style={{ fontSize: '30px' }}>{ICONS[type] || '▊'}</span>
      No data — check X / Y column settings
    </div>
  ) : type === 'pie' || type === 'donut' ? (
    <PieSVG data={data} yKey={yKeys[0]} colors={theme.colors} donut={type === 'donut'} />
  ) : type === 'radar' ? (
    <RadarSVG data={data} yKey={yKeys[0]} colors={theme.colors} />
  ) : (
    <CartesianSVG data={data} yKeys={yKeys} colors={theme.colors} type={type} />
  );

  return (
    <div style={{
      background: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '20px',
      padding: '20px',
      boxShadow: `0 8px 32px rgba(0,0,0,0.3), 0 0 40px ${theme.glow}22`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow orb */}
      <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '130px', height: '130px', borderRadius: '50%', background: theme.glow, opacity: 0.08, filter: 'blur(32px)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: `linear-gradient(135deg,${theme.colors[0]},${theme.colors[1] || theme.colors[0]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0, boxShadow: `0 4px 12px ${theme.glow}55` }}>
          {ICONS[type] || '▊'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: 'rgba(255,255,255,0.92)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title || `${type.charAt(0).toUpperCase() + type.slice(1)} Chart`}
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
            {data.length} rows{yKeys.length ? ` · ${yKeys.slice(0, 2).join(', ')}${yKeys.length > 2 ? '…' : ''}` : ''}
          </div>
        </div>
      </div>

      {chartBody}

      {/* Legend */}
      {showLegend && !isEmpty && type !== 'pie' && type !== 'donut' && yKeys.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
          {yKeys.map((k, i) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: theme.colors[i % theme.colors.length] }} />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>{k}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
