# Claude Memory Export — Synergy Reports Project
_Generated: 2026-04-25. Paste this at the start of a new Claude Code session to restore full project context._

---

## Project Overview

**Working directory:** `e:\synergy-reports-new`  
**Repo:** https://github.com/Fomra-git/synergy-reports.git (branch: `main`)  
**Stack:** React + Vite, Firebase Firestore, SheetJS (xlsx), ExcelJS, lucide-react  
**App type:** Internal reporting tool — users configure report templates, upload master Excel data, and generate filtered/aggregated Excel reports.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/pages/VisualExcelMapping.jsx` | Visual Mapper designer — maps Excel columns to report columns, configures constant checks |
| `src/pages/PivotTemplateManager.jsx` | Pivot Designer — pivot-style aggregation report builder |
| `src/pages/MultiTableDesigner.jsx` | Multi-Table Designer — multiple pivot tables per report |
| `src/pages/ViewReport.jsx` | View/preview generated reports in-browser |
| `src/pages/GenerateReport.jsx` | Generates and downloads Excel reports |
| `src/components/ConstantCheckPanel.jsx` | Accordion UI for configuring constant value checks |
| `src/components/ChartConfigPanel.jsx` | Chart configuration panel (3D charts support) |
| `src/components/ReportChart.jsx` | Chart rendering component |
| `src/components/SearchableDropdown.jsx` | Reusable searchable dropdown |
| `src/components/MultiSelectDropdown.jsx` | Reusable multi-select dropdown |
| `src/components/ModernModal.jsx` | Reusable modal dialog |
| `src/utils/chartToImage.js` | Utility to convert charts to images for Excel export |

---

## Architecture Concepts

### Template System
- Templates stored in Firestore collection `templates` with `type` field: `'visual_mapper'`, `'pivot'`, `'multi_table'`
- Categories stored in `reportCategories` collection with `templateIds` array
- **Always fetch a fresh template with `getDoc` before processing** — never rely on cached list data, as the user may have saved changes after page load

### Master Data Flow
- User uploads an Excel file → parsed with SheetJS into `masterData` array of row objects
- `getMasterValue(row, colName)` / `getMV(row, colName)` — case/space-insensitive column lookup helper
- `filteredMD` — the working subset of master data after all filters applied

### Constant Checks (Visual Mapper feature)
- Configured in `ConstantCheckPanel` → stored on template as `constantChecks[]` and `constantShowExpected` boolean
- **Purpose:** Validate that specific columns hold expected constant values; show ONLY rows that FAIL at least one check
- Filter logic (applied to `filteredMD` after global filters):
  ```js
  const activeChecks = (template.constantChecks || []).filter(c => c.column);
  if (activeChecks.length > 0) {
    filteredMD = filteredMD.filter(row =>
      activeChecks.some(check => {
        const { column, expectedValue='', operator='eq', filterColumn='', filterValue='' } = check;
        const expected = String(expectedValue).trim();
        const hasFilter = filterColumn.trim() && filterValue.trim();
        if (hasFilter) {
          const fActual = String(getMV(row, filterColumn) ?? '').trim();
          if (fActual.toLowerCase() !== filterValue.trim().toLowerCase()) return false;
        }
        const actual = String(getMV(row, column) ?? '').trim();
        return !cmp(actual, expected, operator); // keep rows that FAIL the check
      })
    );
  }
  ```
- This same block exists in BOTH `ViewReport.jsx` and `GenerateReport.jsx` (separate engines)
- `constantShowExpected`: appends an `"Expected [column]"` column to end of each AOA row in output

### AOA (Array of Arrays) Pattern
- All report output built as `finalAOA` — first row is headers, subsequent rows are data
- Passed to ExcelJS for styled export or SheetJS for fallback

### Pivot / Multi-Table Column Fields
Each pivot column (`pivotColumns[]`) now supports:
```js
{
  id, type, displayName, source, operation, formula,
  showTotal, hideInReport,
  rowFilters: [{ conditionCol, operator, conditionVals, isManual, type }],
  valueFilters: [{ operator, value, valueTo }],
  isUniqueCount, dedupColumn,
  roundOff, roundDecimals,
  findText, replaceWith,
  simplifyDate, simplifyTime, normalizeMonth, normalizeWeek,
  groupByCol
}
```

### Row Condition Types
- `'simple'` — column == value (multi-select or manual)
- `'expression'` — free-text JS-style expression
- `'time_range'` — time-of-day range filter

---

## User Preferences & Feedback

- **Terse responses** — no trailing summaries, no "here's what I did" recaps. The user can read the diff.
- **No unnecessary comments in code** — only add a comment if the WHY is non-obvious.
- **Commit style:** `Feature: ...` or `Fix: ...` prefix, bullet points in body describing each change.
- **Always push after committing** when the user says "push to git."
- **Build verification:** Always run `npm run build` after significant changes to confirm no errors before reporting done.

---

## Recent Feature History (last session)

1. **VisualExcelMapping sidebar** widened to `440px` (`gridTemplateColumns: '440px 1fr'`)
2. **ConstantCheckPanel** fully rewritten — accordion with numbered badges, single-open, Copy (duplicate) + Trash buttons, chevron toggle, all fields stacked vertically (no 2-col grids), checkbox to append expected values
3. **Constant check mismatch filter** — ViewReport and GenerateReport both filter `filteredMD` to keep only rows failing at least one check
4. **Stale template fix** — ViewReport now calls `fetchFreshTemplate()` using `getDoc` before processing any template
5. **Full row data in validation results** — ViewReport shows all master columns in mismatch table (UI + Excel), check column highlighted orange, expected value in green
6. **Expected column appending** — `"Expected [column]"` added to AOA when `constantShowExpected` is true
7. **GenerateReport constant checks** — added the same filter + expected column logic (GenerateReport is a completely separate engine from ViewReport)
8. **MultiTableDesigner feature parity** with PivotTemplateManager — rounding, data cleaning transforms, per-column row conditions (3 types), per-column value filters, isUniqueCount, hideInReport
9. **3D interactive charts** in Pivot, Visual Mapper, Multi-Table (prior session)
10. **Sticky Pivot Output Columns toolbar** when scrolling (prior session)
11. **Time range condition** in row/column filters across all designers (prior session)
12. **Report name title row** at top of all generated Excel outputs (prior session)

---

## Firebase Collections

| Collection | Purpose |
|-----------|---------|
| `templates` | All report templates (pivot, multi_table, visual_mapper) |
| `reportCategories` | Category groupings with `templateIds[]` |
| `masterFiles` | (if used) uploaded master file metadata |

---

## Common Gotchas

- **Two separate report engines**: `ViewReport.jsx` (preview) and `GenerateReport.jsx` (download) — changes to report logic must be applied to BOTH
- **`getMV` vs `getMasterValue`**: ViewReport uses `getMV`, GenerateReport uses `getMasterValue` — same function, different names
- **Template cache**: Always use `getDoc(doc(db, 'templates', id))` for fresh data before report generation
- **Excel font property merge**: When styling cells, merge font: `c.font = { ...(c.font || {}), color: { argb: '...' } }` — don't overwrite the whole font object
- **AOA index lookup for filterColumn**: Use `activeMappings.findIndex(m => norm(m.source) === norm(check.filterColumn))` to find column position in AOA rows
