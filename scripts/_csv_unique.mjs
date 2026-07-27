import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, '..', '..', 'SOTH places - Upload.csv');

function parseCSV(text) {
  const rows = []; let currentRow = []; let currentField = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]; const next = text[i + 1];
    if (ch === '"') { if (inQuotes && next === '"') { currentField += '"'; i++; } else { inQuotes = !inQuotes; } }
    else if (ch === ',' && !inQuotes) { currentRow.push(currentField.trim()); currentField = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      currentRow.push(currentField.trim()); rows.push(currentRow); currentRow = []; currentField = '';
    } else { currentField += ch; }
  }
  if (currentField) { currentRow.push(currentField.trim()); rows.push(currentField.trim()); }
  return rows;
}

const rows = parseCSV(readFileSync(CSV_PATH, 'utf-8')).slice(1);
const uniqueByName = {};
rows.forEach(r => {
  const org = r[0].trim(); const name = r[1].trim().toLowerCase();
  const district = r[3].trim().toLowerCase(); const state = r[4].trim().toLowerCase();
  const key = org + '||' + name + '||' + district + '||' + state;
  uniqueByName[key] = (uniqueByName[key] || 0) + 1;
});

// Count unique (org, village) combos
const unique = {};
Object.entries(uniqueByName).forEach(([key, count]) => {
  const [org] = key.split('||');
  unique[org] = (unique[org] || 0) + 1;
});

const total = {};
rows.forEach(r => {
  const org = r[0].trim();
  total[org] = (total[org] || 0) + 1;
});

console.log('Org | CSV rows | Unique (org, village) | Duplicate entries');
console.log('--- | --- | --- | ---');
Object.keys(total).sort().forEach(org => {
  const t = total[org]; const u = unique[org] || 0;
  console.log(org + ' | ' + t + ' | ' + u + ' | ' + (t - u));
});
