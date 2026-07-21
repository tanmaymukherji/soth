// SoTH SQL Seeder — Proper CSV parsing with multi-line field support
import { readFileSync } from 'fs';

const csvParamsPath = process.argv[2] || '../SOTH parameters- Superset.csv';
const csvPlacesPath = process.argv[3] || '../SOTH places list.csv';

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

function esc(val) {
  if (val == null || val === '') return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

const sql = [];

// --- 1. Organisations ---
const partnerNames = [
  'PRADAN', 'Buzz', 'Gram Vikas', 'Lipok', 'Goonj', 'Shivganga',
  'TRIF', 'Vaagdhara', 'HUM', 'Paani Foundation', 'Timbaktu Collective',
  'Swades', 'FES'
];

sql.push('-- Seed organisations');
partnerNames.forEach(name => {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  sql.push(`INSERT INTO organizations (name, slug, status) VALUES (${esc(name)}, ${esc(slug)}, 'active') ON CONFLICT (slug) DO NOTHING;`);
});
sql.push('');

// --- 2. Themes extracted from CSV ---
const paramsText = readFileSync(csvParamsPath, 'utf-8');
const paramsRows = parseCSV(paramsText).slice(1);
const themeSet = new Map();
let sortOrder = 1;
for (const row of paramsRows) {
  const a = (row[0] || '').trim();
  const b = (row[1] || '').trim();
  if (a && !b) {
    if (!themeSet.has(a)) { themeSet.set(a, sortOrder++); }
  }
}

sql.push('-- Seed themes');
for (const [name, sort] of themeSet) {
  sql.push(`INSERT INTO themes (name, sort_order) VALUES (${esc(name)}, ${sort}) ON CONFLICT (name) DO NOTHING;`);
}
sql.push('');

// --- 3. Sub-parameters from CSV ---
let currentTheme = '';
let currentEcosystem = '';

sql.push('-- Seed sub-parameters');
for (const row of paramsRows) {
  const paramName = (row[0] || '').trim();
  const subParamName = (row[1] || '').trim();

  // Detect theme header rows (column A has text, column B is empty)
  if (paramName && !subParamName) {
    currentTheme = paramName;
    currentEcosystem = (row[2] || '').trim();
    continue;
  }

  if (!subParamName || !currentTheme) continue;
  const eco = (row[2] || currentEcosystem || '').trim();

  sql.push(
    `INSERT INTO sub_parameters (theme_id, name, description, data_type, ecosystem, status, version, approved_at) ` +
    `SELECT id, ${esc(subParamName)}, '', 'qualitative', ${esc(eco)}, 'active', 1, NOW() FROM themes WHERE name = ${esc(currentTheme)};`
  );
}
sql.push('');

// --- 4. Villages from places CSV ---
const placesText = readFileSync(csvPlacesPath, 'utf-8');
const placesRows = parseCSV(placesText).slice(2);

const seenVillages = new Set();
sql.push('-- Seed villages');
for (const row of placesRows) {
  const villageName = (row[1] || '').trim();
  const block = (row[2] || '').trim();
  const district = (row[3] || '').trim();
  const state = (row[4] || '').trim();
  if (!villageName || !district || !state) continue;
  const key = `${villageName}|${district}|${state}`;
  if (seenVillages.has(key)) continue;
  seenVillages.add(key);
  sql.push(
    `INSERT INTO villages (name, block, district, state, geocode_status) ` +
    `VALUES (${esc(villageName)}, ${esc(block)}, ${esc(district)}, ${esc(state)}, 'pending') ` +
    `ON CONFLICT (name, block, district, state) DO NOTHING;`
  );
}
sql.push('');

// --- 5. Org-Village links ---
sql.push('-- Seed org-village links');
for (const row of placesRows) {
  const orgName = (row[0] || '').trim();
  const villageName = (row[1] || '').trim();
  const block = (row[2] || '').trim();
  const district = (row[3] || '').trim();
  const state = (row[4] || '').trim();
  if (!orgName || !villageName) continue;
  const slug = orgName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!partnerNames.some(p => p.toLowerCase().replace(/[^a-z0-9-]/g, '-') === slug)) continue;
  sql.push(
    `INSERT INTO org_villages (org_id, village_id, status) ` +
    `SELECT o.id, v.id, 'active' FROM organizations o, villages v ` +
    `WHERE o.slug = ${esc(slug)} AND v.name = ${esc(villageName)} ` +
    `AND v.district = ${esc(district)} AND v.state = ${esc(state)} ` +
    `ON CONFLICT (org_id, village_id) DO NOTHING;`
  );
}

sql.forEach(s => console.log(s));
