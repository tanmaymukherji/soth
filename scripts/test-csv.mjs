import { readFileSync } from 'fs';
const csvPath = '../SOTH parameters- Superset.csv';
const text = readFileSync(csvPath, 'utf-8');

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { currentField += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      currentRow.push(currentField.trim());
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else { currentField += ch; }
  }
  if (currentField) { currentRow.push(currentField.trim()); rows.push(currentRow); }
  return rows;
}

const rows = parseCSV(text);
console.log('Total rows (incl header):', rows.length);
const dataRows = rows.slice(1);
let subParams = 0, themes = 0;
let currentTheme = '';
const themeNames = new Set();
for (const row of dataRows) {
  const a = (row[0] || '').trim();
  const b = (row[1] || '').trim();
  if (a && !b) { themes++; currentTheme = a; themeNames.add(a); }
  else if (b && currentTheme) { subParams++; }
}
console.log('Themes found:', themes);
console.log('Sub-parameters found:', subParams);
console.log('Unique theme names:');
for (const t of themeNames) console.log('  ' + t);
