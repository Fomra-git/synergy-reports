import fs from 'fs';

// Fix GenerateReport.jsx
let contentGR = fs.readFileSync('src/pages/GenerateReport.jsx', 'utf8');
const oldHeaderRegexGR = /\} else if \(template\.headerConfig\.type === 'mapped' && template\.headerConfig\.sourceCol && filteredMasterData\.length > 0\) \{/;
const newHeaderGR = "} else if ((template.headerConfig.type === 'mapped' || template.headerConfig.type === 'column') && template.headerConfig.sourceCol && filteredMasterData.length > 0) {";

if (oldHeaderRegexGR.test(contentGR)) {
    contentGR = contentGR.replace(oldHeaderRegexGR, newHeaderGR);
    fs.writeFileSync('src/pages/GenerateReport.jsx', contentGR);
    console.log('Updated GenerateReport.jsx successfully');
} else {
    console.log('Could not find target in GenerateReport.jsx');
}

// Fix VisualExcelMapping.jsx
let contentVM = fs.readFileSync('src/pages/VisualExcelMapping.jsx', 'utf8');
const oldOptionVM = /<option value="column">From Master Column<\/option>/;
const newOptionVM = '<option value="mapped">From Master Column</option>';

const oldTypeCheckVM = /\{formData\.headerConfig\?\.type === 'column' \? \(/;
const newTypeCheckVM = "{formData.headerConfig?.type === 'mapped' ? (";

let updatedVM = false;
if (oldOptionVM.test(contentVM)) {
    contentVM = contentVM.replace(oldOptionVM, newOptionVM);
    updatedVM = true;
}
if (oldTypeCheckVM.test(contentVM)) {
    contentVM = contentVM.replace(oldTypeCheckVM, newTypeCheckVM);
    updatedVM = true;
}

if (updatedVM) {
    fs.writeFileSync('src/pages/VisualExcelMapping.jsx', contentVM);
    console.log('Updated VisualExcelMapping.jsx successfully');
} else {
    console.log('Could not find targets in VisualExcelMapping.jsx');
}
