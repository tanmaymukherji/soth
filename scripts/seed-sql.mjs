// SoTH SQL Seeder — Generates SQL from CSVs and pipes through supabase db query
// Run: node scripts/seed-sql.mjs | supabase db query --linked

import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const csvParamsPath = process.argv[2] || '../SOTH parameters- Superset.csv';
const csvPlacesPath = process.argv[3] || '../SOTH places list.csv';

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine).filter(r => r.some(c => c));
  return { headers, rows };
}

function parseLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function esc(val) {
  if (val == null || val === '') return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function id() {
  return createHash('md5').update(String(Math.random() + Date.now())).digest('hex').substring(0, 12) + '-' +
    createHash('md5').update(String(Math.random())).digest('hex').substring(0, 4) + '-' +
    createHash('md5').update(String(Math.random())).digest('hex').substring(0, 4) + '-' +
    createHash('md5').update(String(Math.random())).digest('hex').substring(0, 12);
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

// --- 2. Themes ---
const themes = [
  { name: 'Agro ecology', sort: 1 },
  { name: 'Energy', sort: 2, tag: 'Energy Swaraj' },
  { name: 'Biodiversity / Forest', sort: 3, tag: 'Van Swaraj' },
  { name: 'Soil', sort: 4, tag: 'Mitti Swaraj' },
  { name: 'Water', sort: 5, tag: 'Jal Swaraj' },
  { name: 'Gender and Inclusion', sort: 6, tag: 'Rights and Participation Swaraj' },
  { name: 'Health and Nurtition', sort: 7, tag: 'Health and Nutrition Swaraj' },
  { name: 'Health', sort: 8 },
  { name: 'Healthcare', sort: 9 },
  { name: 'Instituition', sort: 10, tag: 'Strengthening of Swaraj' },
  { name: 'Export-Import', sort: 11 },
  { name: 'Livelihood basket', sort: 12, tag: 'Ecopruner' },
  { name: 'Income / Expense', sort: 13 },
  { name: 'Waste', sort: 14 },
  { name: 'Education', sort: 15, tag: 'Education and development swaraj' },
  { name: 'Commons', sort: 16 },
  { name: 'Air', sort: 17 },
  { name: 'Youth and employment', sort: 18, tag: 'Youth leadership' },
  { name: 'Migration', sort: 19 },
  { name: 'Idealogy/ Thinking/ Unity', sort: 20, tag: 'Vaicharik Swaraj' },
  { name: 'Empathy', sort: 21 },
];

sql.push('-- Seed themes');
themes.forEach(t => {
  sql.push(`INSERT INTO themes (name, sort_order, swaraj_tag) VALUES (${esc(t.name)}, ${t.sort}, ${esc(t.tag || '')}) ON CONFLICT (name) DO NOTHING;`);
});
sql.push('');

// --- 3. Sub-parameters from CSV ---
const paramsText = readFileSync(csvParamsPath, 'utf-8');
const paramsCsv = parseCSV(paramsText);
const { headers, rows } = paramsCsv;

let currentTheme = '';
let ecosystem = '';

sql.push('-- Seed sub-parameters');

for (const row of rows) {
  const paramName = row[0]?.trim();
  const subParamName = row[1]?.trim();

  if (paramName && !subParamName) {
    currentTheme = paramName;
    ecosystem = row[2] || '';
    continue;
  }

  if (!subParamName || !currentTheme) continue;

  const eco = row[2] || ecosystem;
  const matchingTheme = themes.find(t => t.name.toLowerCase() === currentTheme.toLowerCase());
  if (!matchingTheme) continue;

  sql.push(
    `INSERT INTO sub_parameters (theme_id, name, description, data_type, ecosystem, status, version, approved_at) ` +
    `SELECT id, ${esc(subParamName)}, '', 'qualitative', ${esc(eco)}, 'active', 1, NOW() FROM themes WHERE name = ${esc(matchingTheme.name)};`
  );
}

sql.push('');

// --- 4. Villages from places CSV ---
const placesText = readFileSync(csvPlacesPath, 'utf-8');
const placesLines = placesText.split('\n').map(l => l.trim()).filter(l => l);
const placesRows = placesLines.slice(2).map(parseLine).filter(r => r[1]?.trim());

const seenVillages = new Set();

sql.push('-- Seed villages');
for (const row of placesRows) {
  const orgName = row[0]?.trim();
  const villageName = row[1]?.trim();
  const block = row[2]?.trim() || '';
  const district = row[3]?.trim() || '';
  const state = row[4]?.trim() || '';

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
  const orgName = row[0]?.trim();
  const villageName = row[1]?.trim();
  const block = row[2]?.trim() || '';
  const district = row[3]?.trim() || '';
  const state = row[4]?.trim() || '';

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

// Output all SQL
sql.forEach(s => console.log(s));
