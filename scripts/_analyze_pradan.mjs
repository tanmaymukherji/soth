import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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

const csv = readFileSync(join(ROOT, '..', 'SOTH places - Upload.csv'), 'utf-8');
const rows = parseCSV(csv);
const pradan = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if ((r[0]||'').trim() === 'PRADAN') {
    pradan.push({ name: (r[1]||'').trim(), block: (r[2]||'').trim(), district: (r[3]||'').trim(), state: (r[4]||'').trim(), desc: (r[5]||'').trim(), lat: (r[7]||'').trim() });
  }
}
console.log(`PRADAN CSV entries: ${pradan.length}`);

const withLat = pradan.filter(e => e.lat !== '' && parseFloat(e.lat) !== 0);
const noLat = pradan.filter(e => e.lat === '' || parseFloat(e.lat) === 0);
console.log(`With lat/lng: ${withLat.length}`);
console.log(`Without lat/lng: ${noLat.length}`);
if (noLat.length > 0) {
  console.log('--- Missing lat/lng entries ---');
  noLat.forEach(e => console.log(`  ${e.name}, ${e.block}, ${e.district}, ${e.state}`));
}
