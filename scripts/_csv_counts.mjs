import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, '..', 'SOTH places - Upload.csv');

function parseCSV(text) {
  const rows = []; let currentRow = []; let currentField = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]; const next = text[i + 1];
    if (ch === '"') { if (inQuotes && next === '"') { currentField += '"'; i++; } else { inQuotes = !inQuotes; } }
    else if (ch === ',' && !inQuotes) { currentRow.push(currentField.trim()); currentField = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      currentRow.push(currentField.trim()); rows.push(currentRow);
      currentRow = []; currentField = '';
    } else { currentField += ch; }
  }
  if (currentField) { currentRow.push(currentField.trim()); rows.push(currentField.trim()); }
  return rows;
}

const rows = parseCSV(readFileSync(CSV_PATH, 'utf-8'));
const counts = {};
for (let i = 1; i < rows.length; i++) {
  const o = (rows[i][0]||'').trim();
  counts[o] = (counts[o]||0) + 1;
}
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(k + ': ' + v));
