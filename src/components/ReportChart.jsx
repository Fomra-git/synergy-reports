import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';

// ── Theme Definitions ───────────────────────────────────────────────────────
const THEMES = {
  ocean:  { colors: ['#38bdf8','#0ea5e9','#0284c7','#7dd3fc','#0369a1','#bae6fd'], glow: '0 0 40px rgba(14,165,233,0.25)', card: 'linear-gradient(145deg,rgba(14,165,233,0.08) 0%,rgba(2,132,199,0.04) 100%)', border: 'rgba(56,189,248,0.25)' },
  fire:   { colors: ['#f97316','#ef4444','#fbbf24','#f59e0b','#dc2626','#fed7aa'], glow: '0 0 40px rgba(249,115,22,0.25)', card: 'linear-gradient(145deg,rgba(249,115,22,0.08) 0%,rgba(239,68,68,0.04) 100%)', border: 'rgba(249,115,22,0.25)' },
  forest: { colors: ['#22c55e','#10b981','#84cc16','#4ade80','#059669','#bbf7d0'], glow: '0 0 40px rgba(34,197,94,0.25)', card: 'linear-gradient(145deg,rgba(34,197,94,0.08) 0%,rgba(16,185,129,0.04) 100%)', border: 'rgba(34,197,94,0.25)' },
  violet: { colors: ['#a78bfa','#8b5cf6','#c084fc','#7c3aed','#d946ef','#e9d5ff'], glow: '0 0 40px rgba(139,92,246,0.25)', card: 'linear-gradient(145deg,rgba(139,92,246,0.08) 0%,rgba(124,58,237,0.04) 100%)', border: 'rgba(167,139,250,0.25)' },
  sunset: { colors: ['#fb923c','#f43f5e','#fbbf24','#e11d48','#ec4899','#fed7aa'], glow: '0 0 40px rgba(251,146,60,0.25)', card: 'linear-gradient(145deg,rgba(251,146,60,0.08) 0%,rgba(244,63,94,0.04) 100%)', border: 'rgba(251,146,60,0.25)' },
  steel:  { colors: ['#818cf8','#6366f1','#60a5fa','#4f46e5','#3b82f6','#c7d2fe'], glow: '0 0 40px rgba(99,102,241,0.25)', card: 'linear-gradient(145deg,rgba(99,102,241,0.08) 0%,rgba(79,70,229,0.04) 100%)', border: 'rgba(129,140,248,0.25)' },
};

const CHART_ICONS = {
  bar:    '▊',
  line:   '↗',
  area:   '◿',
  pie:    '◕',
  donut:  '◎',
  radar:  '⬡',
};

// ── Build chart-ready data from AOA ────────────────────────────────────────
export function buildChartData(aoa, xColumn, yColumns, maxItems = 50) {
  if (!aoa || aoa.length < 2) return { data: [], yKeys: [] };
  const headers = aoa[0].map(h => String(h ?? ''));
  const xIdx = headers.findIndex(h => h === xColumn);
  const validYCols = (yColumns || []).filter(Boolean);
  const yIdxs = validYCols.map(y => headers.findIndex(h => h === y)).filter(i => i >= 0);
  const yKeys = yIdxs.map(i => headers[i]);
  if (xIdx < 0 || yIdxs.length === 0) return { data: [], yKeys: [] };

  const data = aoa.slice(1, maxItems + 1).map(row => {
    const label = String(row[xIdx] ?? '').trim().slice(0, 30);
    if (!label) return null;
    const item = { name: label };
    yIdxs.forEach((yi, i) => {
      const raw = row[yi];
      const n = parseFloat(String(raw ?? '').replace(/,/g, ''));
      item[yKeys[i]] = isNaN(n) ? 0 : n;
    });
    return item;
  }).filter(Boolean);

  return { data, yKeys };
}

// ── Custom tooltip ──────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, theme }) => {
  if (!active || !payload?.length) return null;
  const t = THEMES[theme] || THEMES.steel;
  return (
    <div style={{
      background: 'rgba(10,10,20,0.92)', border: `1px solid ${t.border}`,
      borderRadius: '12px', padding: '12px 16px', boxShadow: `0 8px 32px rgba(0,0,0,0.5), ${t.glow}`,
      backdropFilter: 'blur(20px)', minWidth: '140px',
    }}>
      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>{p.name}:</span>
          <span style={{ fontSize: '13px', color: '#fff', fontWeight: '700' }}>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Custom bar shape (3D gradient effect) ───────────────────────────────────
const Bar3D = (colorIdx, themeColors) => {
  const color = themeColors[colorIdx % themeColors.length];
  return (props) => {
    const { x, y, width, height, fill } = props;
    if (!width || !height || height < 0) return null;
    const gradId = `bar3d_${colorIdx}_${Math.round(x)}`;
    const lighter = color;
    const darker = color;
    return (
      <g>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lighter} stopOpacity="1" />
            <stop offset="100%" stopColor={darker} stopOpacity="0.6" />
          </linearGradient>
          <filter id={`shadow_${gradId}`} x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={color} floodOpacity="0.35" />
          </filter>
        </defs>
        {/* Main bar with gradient */}
        <rect
          x={x} y={y} width={width} height={height}
          fill={`url(#${gradId})`}
          rx={Math.min(4, width / 3)}
          filter={`url(#shadow_${gradId})`}
        />
        {/* Top highlight strip */}
        <rect
          x={x + 1} y={y} width={Math.max(0, width - 2)} height={Math.min(6, height)}
          fill="rgba(255,255,255,0.25)"
          rx={Math.min(4, width / 3)}
        />
      </g>
    );
  };
};

// ── Custom dot for Line chart ───────────────────────────────────────────────
const GlowDot = (color) => (props) => {
  const { cx, cy } = props;
  if (!cx || !cy) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity="0.15" />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} />
    </g>
  );
};

// ── RADIAN helper for pie labels ────────────────────────────────────────────
const RADIAN = Math.PI / 180;
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }) => {
  if (percent < 0.04) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" style={{ fontSize: '11px', fontWeight: '700' }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// ── Axis tick styling ───────────────────────────────────────────────────────
const tickStyle = { fill: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600 };

// ── Main ReportChart component ──────────────────────────────────────────────
export default function ReportChart({ config, aoa }) {
  const { type = 'bar', title = '', xColumn, yColumns = [], colorTheme = 'steel', showLegend = true, maxItems = 50 } = config || {};
  const theme = THEMES[colorTheme] || THEMES.steel;
  const colors = theme.colors;

  const { data, yKeys } = useMemo(() => buildChartData(aoa, xColumn, yColumns, maxItems), [aoa, xColumn, yColumns, maxItems]);

  const isEmpty = !data.length || !yKeys.length;

  const gradientDefs = (
    <defs>
      {yKeys.map((key, i) => {
        const c = colors[i % colors.length];
        return (
          <React.Fragment key={key}>
            <linearGradient id={`areaGrad_${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={c} stopOpacity="0.7" />
              <stop offset="95%" stopColor={c} stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id={`lineGlow_${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={c} stopOpacity="0.4" />
              <stop offset="50%" stopColor={c} stopOpacity="1" />
              <stop offset="100%" stopColor={c} stopOpacity="0.4" />
            </linearGradient>
          </React.Fragment>
        );
      })}
    </defs>
  );

  const tooltipComp = <Tooltip content={<CustomTooltip theme={colorTheme} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />;
  const legendComp = showLegend ? (
    <Legend wrapperStyle={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', paddingTop: '8px' }} />
  ) : null;
  const gridComp = <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />;

  const renderChart = () => {
    if (isEmpty) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'rgba(255,255,255,0.3)', fontSize: '13px', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '28px', opacity: 0.4 }}>{CHART_ICONS[type] || '▊'}</span>
        <span>No data — check X / Y column settings</span>
      </div>
    );

    if (type === 'bar') return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 40, left: 0 }} barCategoryGap="25%">
          {gradientDefs}
          {gridComp}
          <XAxis dataKey="name" tick={tickStyle} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} angle={-35} textAnchor="end" interval="preserveStartEnd" />
          <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={45} />
          {tooltipComp}{legendComp}
          {yKeys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={colors[i % colors.length]} shape={Bar3D(i, colors)} radius={[4, 4, 0, 0]} maxBarSize={60} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );

    if (type === 'line') return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 40, left: 0 }}>
          {gradientDefs}
          {gridComp}
          <XAxis dataKey="name" tick={tickStyle} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} angle={-35} textAnchor="end" interval="preserveStartEnd" />
          <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={45} />
          {tooltipComp}{legendComp}
          {yKeys.map((key, i) => {
            const c = colors[i % colors.length];
            return (
              <Line key={key} type="monotone" dataKey={key} stroke={c} strokeWidth={3}
                dot={GlowDot(c)} activeDot={{ r: 7, fill: c, stroke: '#fff', strokeWidth: 2 }}
                style={{ filter: `drop-shadow(0 0 6px ${c})` }} />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    );

    if (type === 'area') return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 40, left: 0 }}>
          {gradientDefs}
          {gridComp}
          <XAxis dataKey="name" tick={tickStyle} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} angle={-35} textAnchor="end" interval="preserveStartEnd" />
          <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={45} />
          {tooltipComp}{legendComp}
          {yKeys.map((key, i) => {
            const c = colors[i % colors.length];
            return (
              <Area key={key} type="monotone" dataKey={key}
                stroke={c} strokeWidth={2.5} fill={`url(#areaGrad_${i})`}
                dot={false} activeDot={{ r: 6, fill: c, stroke: '#fff', strokeWidth: 2 }} />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    );

    if (type === 'pie' || type === 'donut') {
      const pieKey = yKeys[0];
      const pieData = data.map((d, i) => ({ name: d.name, value: d[pieKey] || 0 }));
      const inner = type === 'donut' ? '45%' : 0;
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <defs>
              {pieData.map((_, i) => {
                const c = colors[i % colors.length];
                return (
                  <radialGradient key={i} id={`pieGrad_${i}`} cx="30%" cy="30%">
                    <stop offset="0%" stopColor={c} stopOpacity="1" />
                    <stop offset="100%" stopColor={c} stopOpacity="0.65" />
                  </radialGradient>
                );
              })}
              <filter id="pieShadow">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.4" />
              </filter>
            </defs>
            <Pie data={pieData} cx="50%" cy="50%" outerRadius="70%" innerRadius={inner}
              dataKey="value" labelLine={false} label={renderPieLabel}
              filter="url(#pieShadow)" strokeWidth={2} stroke="rgba(0,0,0,0.3)">
              {pieData.map((_, i) => (
                <Cell key={i} fill={`url(#pieGrad_${i})`} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip theme={colorTheme} />} />
            {legendComp}
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (type === 'radar') {
      const radarKey = yKeys[0];
      return (
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={data.slice(0, 12)}>
            <defs>
              <linearGradient id="radarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors[0]} stopOpacity="0.6" />
                <stop offset="100%" stopColor={colors[0]} stopOpacity="0.1" />
              </linearGradient>
            </defs>
            <PolarGrid stroke="rgba(255,255,255,0.1)" />
            <PolarAngleAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 600 }} />
            {yKeys.map((key, i) => {
              const c = colors[i % colors.length];
              return (
                <Radar key={key} dataKey={key} stroke={c} strokeWidth={2}
                  fill={c} fillOpacity={0.2} dot={{ r: 3, fill: c }} />
              );
            })}
            {tooltipComp}{legendComp}
          </RadarChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  return (
    <div style={{
      background: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: '20px',
      padding: '24px',
      boxShadow: `0 24px 64px rgba(0,0,0,0.35), ${theme.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
      backdropFilter: 'blur(20px)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow orb */}
      <div style={{
        position: 'absolute', top: '-40px', right: '-40px',
        width: '160px', height: '160px', borderRadius: '50%',
        background: colors[0], opacity: 0.06, filter: 'blur(40px)',
        pointerEvents: 'none',
      }} />
      {/* Chart type badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: `linear-gradient(135deg, ${colors[0]}, ${colors[1] || colors[0]})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', boxShadow: `0 4px 12px ${colors[0]}55`,
        }}>
          {CHART_ICONS[type] || '▊'}
        </div>
        <div>
          <h3 style={{
            margin: 0, fontSize: '15px', fontWeight: '700',
            background: `linear-gradient(90deg, ${colors[0]}, ${colors[1] || colors[0]})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {title || `${type.charAt(0).toUpperCase() + type.slice(1)} Chart`}
          </h3>
          <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
            {data.length} data points · {yKeys.join(', ')}
          </p>
        </div>
      </div>
      {renderChart()}
    </div>
  );
}
