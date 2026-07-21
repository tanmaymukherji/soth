// SoTH Seeder — Parse SOTH CSVs and seed Supabase
// Run: node scripts/seed.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const csvParamsPath = process.argv[2] || '../SOTH parameters- Superset.csv';
const csvPlacesPath = process.argv[3] || '../SOTH places list.csv';

if (!supabaseUrl || !supabaseKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

// — Parse CSV —
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

// — 1. Seed organisations —
const partnerNames = [
  'PRADAN', 'Buzz', 'Gram Vikas', 'Lipok', 'Goonj', 'Shivganga',
  'TRIF', 'Vaagdhara', 'HUM', 'Paani Foundation', 'Timbaktu Collective',
  'Swades', 'FES'
];

const orgSlugs = partnerNames.map(n => n.toLowerCase().replace(/[^a-z0-9]/g, '-'));
const orgs = partnerNames.map((name, i) => ({
  name,
  slug: orgSlugs[i],
  contact_email: '',
  status: 'active'
}));

console.log(`Seeding ${orgs.length} organisations...`);
const { data: orgRecords, error: orgErr } = await sb.from('organizations').upsert(orgs, { onConflict: 'slug', ignoreDuplicates: false }).select();
if (orgErr) { console.error('Org error:', orgErr); process.exit(1); }

const orgMap = {};
orgRecords.forEach(o => { orgMap[o.slug] = o.id; });

// — 2. Seed themes —
const themeMap = {};
const themes = [
  { name: 'Agro ecology', sort_order: 1, swaraj_tag: '' },
  { name: 'Energy', sort_order: 2, swaraj_tag: 'Energy Swaraj' },
  { name: 'Biodiversity / Forest', sort_order: 3, swaraj_tag: 'Van Swaraj' },
  { name: 'Soil', sort_order: 4, swaraj_tag: 'Mitti Swaraj' },
  { name: 'Water', sort_order: 5, swaraj_tag: 'Jal Swaraj' },
  { name: 'Gender and Inclusion', sort_order: 6, swaraj_tag: 'Rights and Participation Swaraj' },
  { name: 'Health and Nurtition', sort_order: 7, swaraj_tag: 'Health and Nutrition Swaraj' },
  { name: 'Health', sort_order: 8, swaraj_tag: '' },
  { name: 'Healthcare', sort_order: 9, swaraj_tag: '' },
  { name: 'Instituition', sort_order: 10, swaraj_tag: 'Strengthening of Swaraj' },
  { name: 'Export-Import', sort_order: 11, swaraj_tag: '' },
  { name: 'Livelihood basket', sort_order: 12, swaraj_tag: 'Ecopruner' },
  { name: 'Income / Expense', sort_order: 13, swaraj_tag: '' },
  { name: 'Waste', sort_order: 14, swaraj_tag: '' },
  { name: 'Education', sort_order: 15, swaraj_tag: 'Education and development swaraj' },
  { name: 'Commons', sort_order: 16, swaraj_tag: '' },
  { name: 'Air', sort_order: 17, swaraj_tag: '' },
  { name: 'Youth and employment', sort_order: 18, swaraj_tag: 'Youth leadership' },
  { name: 'Migration', sort_order: 19, swaraj_tag: '' },
  { name: 'Idealogy/ Thinking/ Unity', sort_order: 20, swaraj_tag: 'Vaicharik Swaraj' },
  { name: 'Empathy', sort_order: 21, swaraj_tag: '' },
];

console.log('Seeding themes...');
const { data: themeRecords } = await sb.from('themes').upsert(themes, { onConflict: 'name', ignoreDuplicates: false }).select();
themeRecords.forEach(t => { themeMap[t.name] = t.id; });

// — 3. Parse parameters CSV and seed sub_parameters —
const paramsText = readFileSync(csvParamsPath, 'utf-8');
const paramsCsv = parseCSV(paramsText);
const { headers, rows } = paramsCsv;

// Identify partner columns (from column C onwards until empty)
const partnerColumns = [];
for (let i = 2; i < headers.length; i++) {
  if (headers[i] && headers[i].trim()) partnerColumns.push({ index: i, header: headers[i].trim() });
}

let currentTheme = '';
let ecosystem = '';

// Map each parameter row
const subParamsToInsert = [];
const captureSeedData = [];  // We'll skip seed captures for now

for (const row of rows) {
  const paramName = row[0]?.trim();
  const subParamName = row[1]?.trim();
  const themeCol = row[0] || '';

  // Detect theme row: param is set, sub-param is empty
  if (themeCol && !subParamName) {
    // Check if it matches a known theme or start of new theme section
    const matchedTheme = themes.find(t => t.name.toLowerCase() === themeCol.toLowerCase());
    if (matchedTheme) {
      currentTheme = matchedTheme.name;
      ecosystem = row[2] || '';
    } else {
      // Use whatever column C says
      currentTheme = themes.find(t => themeCol.toLowerCase().includes(t.name.toLowerCase()))?.name || '';
      ecosystem = row[2] || '';
    }
    continue;
  }

  if (!subParamName || !currentTheme) continue;
  const themeId = themeMap[currentTheme];
  if (!themeId) continue;

  const eco = row[2] || ecosystem;
  const desc = '';

  // Possible values based on data type
  // We store as qualitative initially; seed captures later from partner columns
  const sp = {
    theme_id: themeId,
    name: subParamName,
    description: desc,
    data_type: 'qualitative',
    possible_values: [],
    ecosystem: eco,
    status: 'active',
    version: 1
  };
  subParamsToInsert.push(sp);
}

console.log(`Seeding ${subParamsToInsert.length} sub-parameters...`);
// Batch insert in chunks
const chunkSize = 50;
for (let i = 0; i < subParamsToInsert.length; i += chunkSize) {
  const chunk = subParamsToInsert.slice(i, i + chunkSize);
  await sb.from('sub_parameters').upsert(chunk, { onConflict: 'id', ignoreDuplicates: true });
}

// — 4. Parse places CSV and seed villages —
console.log('Seeding villages from places list...');
const placesText = readFileSync(csvPlacesPath, 'utf-8');
const placesLines = placesText.split('\n').map(l => l.trim()).filter(l => l);
const placesRows = placesLines.slice(2) // skip header
  .map(parseLine)
  .filter(r => r[1]?.trim()); // must have village name

const villageSet = new Set();
const villagesToInsert = [];

for (const row of placesRows) {
  const orgName = row[0]?.trim();
  const villageName = row[1]?.trim();
  const block = row[2]?.trim() || '';
  const district = row[3]?.trim() || '';
  const state = row[4]?.trim() || '';

  if (!villageName || !district || !state) continue;
  const key = `${villageName}|${district}|${state}`;
  if (villageSet.has(key)) continue;
  villageSet.add(key);

  villagesToInsert.push({
    name: villageName,
    gram_panchayat: '',
    block,
    district,
    state,
    geocode_status: 'pending'
  });
}

console.log(`Seeding ${villagesToInsert.length} unique villages...`);
for (let i = 0; i < villagesToInsert.length; i += chunkSize) {
  const chunk = villagesToInsert.slice(i, i + chunkSize);
  await sb.from('villages').upsert(chunk, { onConflict: 'name,block,district,state', ignoreDuplicates: true });
}

// — 5. Link organisations to villages —
console.log('Linking organisations to villages...');
for (const row of placesRows) {
  const orgName = row[0]?.trim();
  const villageName = row[1]?.trim();
  const block = row[2]?.trim() || '';
  const district = row[3]?.trim() || '';
  const state = row[4]?.trim() || '';

  const slug = orgName?.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const orgId = orgMap[slug];
  if (!orgId || !villageName) continue;

  const { data: village } = await sb.from('villages').select('id')
    .eq('name', villageName).eq('district', district).eq('state', state).maybeSingle();
  if (village) {
    await sb.from('org_villages').upsert({
      org_id: orgId, village_id: village.id,
      start_date: new Date().toISOString().split('T')[0],
      status: 'active'
    }, { onConflict: 'org_id,village_id', ignoreDuplicates: true });
  }
}

console.log('Seed complete!');
console.log(`  Organisations: ${orgRecords.length}`);
console.log(`  Themes: ${themeRecords.length}`);
console.log(`  Sub-parameters: ${subParamsToInsert.length}`);
console.log(`  Villages: ${villagesToInsert.length}`);
