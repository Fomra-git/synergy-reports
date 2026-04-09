import fs from 'fs';

let content = fs.readFileSync('src/pages/VisualExcelMapping.jsx', 'utf8');

const targetRegex = /\(modalData\.type === 'condition_count' \|\| modalData\.type === 'count'\) && \([\s\S]*?<div style=\{\{ background: 'rgba\(255,255,255,0\.03\)', padding: '20px', borderRadius: '16px', border: '1px solid var\(--border\)', display: 'flex', flexDirection: 'column', gap: '16px' \}\}>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?\)/;

// I'll use a more precise marker-based approach if regex is too risky
const markerStart = `{(modalData.type === 'condition_count' || modalData.type === 'count') && (`;
const markerEnd = `                )}`;

if (content.includes(markerStart)) {
    const startIndex = content.indexOf(markerStart);
    // Find the matching closing parenthesis for the entire block
    // The previous view_file showed it ends around line 1011
    const endTag = `                )}`
    const endIndex = content.indexOf(endTag, startIndex) + endTag.length;
    
    const replacement = `{(modalData.type === 'condition_count' || modalData.type === 'count') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {modalData.type === 'count' && (
                      <div className="form-group">
                        <label>Field to Count (Target Value)</label>
                        <SearchableDropdown 
                          options={masterHeaders} 
                          value={modalData.source} 
                          onChange={val => setModalData(prev => ({ ...prev, source: val }))}
                          placeholder="Select field to count..."
                        />
                      </div>
                    )}
                    
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', textTransform: 'uppercase' }}>Filtering Criteria (Optional)</label>
                      
                      {/* Render Multiple Rules */}
                      {modalData.rules?.map((rule, ridx) => (
                        <div key={ridx} style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              const newRules = [...modalData.rules];
                              newRules.splice(ridx, 1);
                              setModalData(prev => ({ ...prev, rules: newRules }));
                            }}
                            style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}
                          >
                            <Trash2 size={12} />
                          </button>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label style={{ fontSize: '11px' }}>Condition Field</label>
                            <SearchableDropdown 
                              options={masterHeaders} 
                              value={rule.conditionCol} 
                              onChange={val => {
                                const newRules = [...modalData.rules];
                                newRules[ridx].conditionCol = val;
                                setModalData(prev => ({ ...prev, rules: newRules }));
                              }}
                              placeholder="Select field..."
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="form-group">
                              <label style={{ fontSize: '11px' }}>Comparator</label>
                              <select 
                                value={rule.operator}
                                onChange={e => {
                                  const newRules = [...modalData.rules];
                                  newRules[ridx].operator = e.target.value;
                                  setModalData(prev => ({ ...prev, rules: newRules }));
                                }}
                                style={{ padding: '8px', fontSize: '12px' }}
                              >
                                <option value="==">In (==)</option>
                                <option value="!=">Not In</option>
                                <option value=">">Greater Than (&gt;)</option>
                                <option value="<">Less Than (&lt;)</option>
                                <option value=">=">Greater or Equal (&gt;=)</option>
                                <option value="<=">Less or Equal (&lt;=)</option>
                                <option value="contains">Has String</option>
                                <option value="between">Range (Min,Max)</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label style={{ fontSize: '11px' }}>Criteria Values</label>
                              <MultiSelectDropdown 
                                 options={masterUniqueValues[rule.conditionCol] || []}
                                 selectedValues={rule.conditionVals || []}
                                 onChange={vals => {
                                   const newRules = [...modalData.rules];
                                   newRules[ridx].conditionVals = vals;
                                   setModalData(prev => ({ ...prev, rules: newRules }));
                                 }}
                                 placeholder="Values..."
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      <button 
                         className="btn-link"
                         onClick={(e) => {
                           e.preventDefault();
                           setModalData(prev => ({ 
                             ...prev, 
                             rules: [...(prev.rules || []), { conditionCol: '', operator: '==', conditionVals: [] }] 
                           }));
                         }}
                         style={{ width: '100%', padding: '10px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: '10px', fontSize: '12px' }}
                      >
                         <Plus size={14} /> Add New Condition
                      </button>

                      {(!modalData.rules || modalData.rules.length === 0) && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                          No conditions applied. This column will count all records.
                        </p>
                      )}
                    </div>
                  </div>
                )}`;
    
    const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
    fs.writeFileSync('src/pages/VisualExcelMapping.jsx', newContent);
    console.log('VisualExcelMapping.jsx updated successfully');
} else {
    console.log('Marker not found');
}
