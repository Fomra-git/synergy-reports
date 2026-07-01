// Shared helpers for combining a template's primary Excel file with any number of
// additional Excel files. Used by DualFileConfig (designer UI) and the report
// generators (GenerateReport, CustomReport).

export const SOURCE_COL = 'Source File';

/** Normalize a template's extra-file config to an array, migrating the legacy single-file shape. */
export function getSecondaryFiles(template) {
  if (!template) return [];
  if (Array.isArray(template.secondaryFiles) && template.secondaryFiles.length > 0) {
    return template.secondaryFiles.map((f, i) => ({
      id: f.id || `sf_${i}`,
      mergeMode: f.mergeMode || 'join',
      headers: f.headers || [],
      joinPrimaryKey: f.joinPrimaryKey || '',
      joinSecondaryKey: f.joinSecondaryKey || '',
      label: f.label || `File ${i + 2}`,
    }));
  }
  // Legacy single-secondary migration
  if (template.isDualFile && ((template.secondaryMasterHeaders || []).length > 0 || template.dualMergeMode)) {
    return [{
      id: 'sf_legacy',
      mergeMode: template.dualMergeMode || 'join',
      headers: template.secondaryMasterHeaders || [],
      joinPrimaryKey: template.joinPrimaryKey || '',
      joinSecondaryKey: template.joinSecondaryKey || '',
      label: template.secondFileLabel || 'File 2',
    }];
  }
  return [];
}

/**
 * Combine the primary rows with each extra file's rows, in order, per that file's mode.
 * secConfigs and secDataList are index-aligned. Preserves the original two-file behaviour
 * exactly when there is a single secondary file.
 */
export function mergeMultiFileData(primaryRows, secConfigs, secDataList, firstLabel) {
  if (!secConfigs || secConfigs.length === 0) return primaryRows;
  const getVal = (row, col) => {
    if (!col || !row) return '';
    const c = String(col).trim();
    if (row[c] !== undefined) return row[c];
    const n = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const k = Object.keys(row).find(key => n(key) === n(c));
    return k ? row[k] : '';
  };
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const anySections = secConfigs.some(c => (c.mergeMode || 'join') === 'sections');
  const tag = (r, label) => anySections ? { ...r, [SOURCE_COL]: label } : r;

  let result = primaryRows.map(r => tag(r, firstLabel || 'File 1'));
  secConfigs.forEach((cfg, i) => {
    const secRows = secDataList[i] || [];
    const mode = cfg.mergeMode || 'join';
    if (mode === 'append' || mode === 'sections') {
      result = result.concat(secRows.map(r => tag(r, cfg.label || `File ${i + 2}`)));
    } else {
      // join: enrich each accumulated row with the matching row's columns from this file
      const pk = cfg.joinPrimaryKey, sk = cfg.joinSecondaryKey;
      if (!pk || !sk) return;
      const secMap = new Map();
      secRows.forEach(r => { const k = norm(getVal(r, sk)); if (k && !secMap.has(k)) secMap.set(k, r); });
      result = result.map(pr => {
        const k = norm(getVal(pr, pk));
        const match = k ? secMap.get(k) : null;
        if (!match) return pr;
        const merged = { ...pr };
        Object.keys(match).forEach(key => {
          if (merged[key] === undefined || merged[key] === '' || merged[key] === null) merged[key] = match[key];
        });
        return merged;
      });
    }
  });
  return result;
}
