import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, BarChart2, LineChart, TrendingUp, PieChart, Activity, Edit2 } from 'lucide-react';
import SearchableDropdown from './SearchableDropdown';
import MultiSelectDropdown from './MultiSelectDropdown';

const CHART_TYPES = [
  { id: 'bar',   label: 'Bar',    Icon: BarChart2 },
  { id: 'line',  label: 'Line',   Icon: LineChart },
  { id: 'area',  label: 'Area',   Icon: TrendingUp },
  { id: 'pie',   label: 'Pie',    Icon: PieChart },
  { id: 'donut', label: 'Donut',  Icon: PieChart },
  { id: 'radar', label: 'Radar',  Icon: Activity },
];

const THEMES = [
  { id: 'steel',  label: 'Steel',  swatch: ['#818cf8','#6366f1'] },
  { id: 'ocean',  label: 'Ocean',  swatch: ['#38bdf8','#0284c7'] },
  { id: 'fire',   label: 'Fire',   swatch: ['#f97316','#ef4444'] },
  { id: 'forest', label: 'Forest', swatch: ['#22c55e','#059669'] },
  { id: 'violet', label: 'Violet', swatch: ['#a78bfa','#7c3aed'] },
  { id: 'sunset', label: 'Sunset', swatch: ['#fb923c','#f43f5e'] },
];

const emptyChart = () => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  type: 'bar',
  title: '',
  xColumn: '',
  yColumns: [],
  colorTheme: 'steel',
  showLegend: true,
  maxItems: 30,
  sectionIndex: 0,
});

function ChartCard({ chart, onEdit, onRemove, isEditing }) {
  const theme = THEMES.find(t => t.id === chart.colorTheme) || THEMES[0];
  const typeInfo = CHART_TYPES.find(t => t.id === chart.type) || CHART_TYPES[0];
  const Icon = typeInfo.Icon;
  return (
    <div style={{
      background: `linear-gradient(135deg, rgba(${isEditing ? '99,102,241' : '255,255,255'},0.07) 0%, transparent 100%)`,
      border: `1px solid ${isEditing ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
      borderRadius: '12px', padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
    }} onClick={onEdit}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
        background: `linear-gradient(135deg, ${theme.swatch[0]}, ${theme.swatch[1]})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 4px 12px ${theme.swatch[0]}55`,
      }}>
        <Icon size={16} color="white" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {chart.title || `${typeInfo.label} Chart`}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {chart.xColumn ? `X: ${chart.xColumn}` : 'No X column'} · {chart.yColumns.length ? `Y: ${chart.yColumns.slice(0,2).join(', ')}${chart.yColumns.length > 2 ? '…' : ''}` : 'No Y columns'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button type="button" onClick={e => { e.stopPropagation(); onEdit(); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '4px' }}>
          <Edit2 size={13} />
        </button>
        <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }} style={{ background: 'none', border: 'none', color: 'var(--error, #ef4444)', cursor: 'pointer', padding: '4px' }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function ChartEditor({ chart, onChange, availableHeaders, sectionNames, onClose }) {
  const update = (key, val) => onChange({ ...chart, [key]: val });

  return (
    <div style={{
      background: 'var(--glass-subtle)', border: '1px solid rgba(99,102,241,0.3)',
      borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px',
    }}>
      {/* Chart Type picker */}
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>Chart Type</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
          {CHART_TYPES.map(({ id, label, Icon }) => {
            const active = chart.type === id;
            return (
              <button key={id} type="button" onClick={() => update('type', id)} style={{
                padding: '8px 4px', borderRadius: '8px', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                background: active ? 'rgba(99,102,241,0.15)' : 'transparent', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: '0.15s',
              }}>
                <Icon size={16} color={active ? 'var(--primary)' : 'var(--text-muted)'} />
                <span style={{ fontSize: '9px', fontWeight: '700', color: active ? 'var(--primary)' : 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Title */}
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>Chart Title</label>
        <input type="text" value={chart.title} onChange={e => update('title', e.target.value)}
          placeholder="e.g. Patients by Doctor" style={{ width: '100%', padding: '8px 10px', fontSize: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--glass-bg)', color: 'var(--text)', boxSizing: 'border-box' }} />
      </div>

      {/* Section selector (only for multi-table) */}
      {sectionNames && sectionNames.length > 0 && (
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>Section</label>
          <select value={chart.sectionIndex ?? 0} onChange={e => update('sectionIndex', Number(e.target.value))}
            style={{ width: '100%', padding: '8px 10px', fontSize: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--glass-bg)', color: 'var(--text)' }}>
            {sectionNames.map((name, i) => <option key={i} value={i}>{name || `Section ${i + 1}`}</option>)}
          </select>
        </div>
      )}

      {/* X Column */}
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>X Axis (Labels)</label>
        <SearchableDropdown options={availableHeaders} value={chart.xColumn} onChange={v => update('xColumn', v)} placeholder="Select label column..." />
      </div>

      {/* Y Columns */}
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
          {chart.type === 'pie' || chart.type === 'donut' ? 'Value Column (first selected)' : 'Y Axis (Values)'}
        </label>
        <MultiSelectDropdown options={availableHeaders} selectedValues={chart.yColumns} onChange={vals => update('yColumns', vals)} placeholder="Select value columns..." />
      </div>

      {/* Color Theme */}
      <div>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>Color Theme</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {THEMES.map(t => {
            const active = chart.colorTheme === t.id;
            return (
              <button key={t.id} type="button" onClick={() => update('colorTheme', t.id)} title={t.label} style={{
                width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer', padding: 0,
                background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})`,
                border: active ? '3px solid white' : '2px solid transparent',
                boxShadow: active ? `0 0 12px ${t.swatch[0]}88` : 'none',
                outline: 'none', transition: '0.15s',
              }} />
            );
          })}
        </div>
      </div>

      {/* Options row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>Max Rows</label>
          <input type="number" min="5" max="200" value={chart.maxItems || 30} onChange={e => update('maxItems', Number(e.target.value))}
            style={{ width: '100%', padding: '8px 10px', fontSize: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--glass-bg)', color: 'var(--text)', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: '600' }}>
            <input type="checkbox" checked={chart.showLegend !== false} onChange={e => update('showLegend', e.target.checked)} style={{ width: '14px', height: '14px' }} />
            Show Legend
          </label>
        </div>
      </div>

      <button type="button" onClick={onClose} style={{
        padding: '8px', borderRadius: '8px', border: '1px solid var(--border)',
        background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
      }}>
        Done
      </button>
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────
export default function ChartConfigPanel({ chartConfigs = [], onChange, availableHeaders = [], sectionNames = null }) {
  const [editingId, setEditingId] = useState(null);
  const [open, setOpen] = useState(true);

  const addChart = () => {
    const nc = emptyChart();
    onChange([...chartConfigs, nc]);
    setEditingId(nc.id);
  };

  const removeChart = (id) => {
    onChange(chartConfigs.filter(c => c.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const updateChart = (updated) => {
    onChange(chartConfigs.map(c => c.id === updated.id ? updated : c));
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: '8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? '14px' : '0', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '22px', height: '22px', borderRadius: '6px',
            background: 'linear-gradient(135deg, #818cf8, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BarChart2 size={13} color="white" />
          </div>
          <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>Charts</h4>
          {chartConfigs.length > 0 && (
            <span style={{ fontSize: '10px', fontWeight: '800', background: 'rgba(99,102,241,0.15)', color: 'var(--primary)', padding: '1px 7px', borderRadius: '8px' }}>
              {chartConfigs.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {open && (
            <button type="button" onClick={e => { e.stopPropagation(); addChart(); }} style={{
              display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px',
              fontSize: '11px', fontWeight: '700', borderRadius: '8px',
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
              color: 'var(--primary)', cursor: 'pointer',
            }}>
              <Plus size={12} /> Add Chart
            </button>
          )}
          {open ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
        </div>
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {chartConfigs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', border: '1px dashed var(--border)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
              <BarChart2 size={24} style={{ marginBottom: '8px', opacity: 0.4, display: 'block', margin: '0 auto 8px' }} />
              No charts yet — click Add Chart to visualise your report data
            </div>
          ) : (
            chartConfigs.map(chart => (
              <div key={chart.id}>
                <ChartCard
                  chart={chart}
                  isEditing={editingId === chart.id}
                  onEdit={() => setEditingId(editingId === chart.id ? null : chart.id)}
                  onRemove={() => removeChart(chart.id)}
                />
                {editingId === chart.id && (
                  <div style={{ marginTop: '8px' }}>
                    <ChartEditor
                      chart={chart}
                      onChange={updateChart}
                      availableHeaders={availableHeaders}
                      sectionNames={sectionNames}
                      onClose={() => setEditingId(null)}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
