import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, 'data', 'pradan_scores.csv');
const SQL_FILE = join(ROOT, '_pradan_captures.sql');

const CSV_THEME_MAP = {
  'Ec-Arresting Distress Migration': 'ae4161f0-b907-422a-9321-1369a53dece1',
  'Ec-Export import': '8d58f389-5479-4808-9765-d50793b4ba27',
  'Ec-HH Income': '3bfc2d75-c99c-45d9-8be2-fdfff1f1bebc',
  'Ec-Livelihood Basket': '3bfc2d75-c99c-45d9-8be2-fdfff1f1bebc',
  'Ec-Youth Employment': 'c220ad9b-c7f0-4214-804e-fc36eec7ad9b',
  'Env-Agro Ecology': 'ec7e7cfc-9ab5-49ed-9842-ed8769f1a05f',
  'Env-Energy': '4a7a00ce-185c-4821-9379-309b46b81872',
  'Env-Forest': '4f31a378-2051-4043-809d-1c8d51007356',
  'Env-Soil': 'd16e58f1-7d6e-4f7c-b8aa-63ac2f2fe326',
  'Env-Water': 'cb3fd310-068e-4d22-804e-6d68084f9baf',
  'S-Gender & Inclusion': '7df3bdd6-666a-4950-800f-eed56f868b3a',
  'S-Health & Nutrition': 'f44e7522-1702-4924-9892-8e1b388ba92c',
  'S-Institution': '84a797b0-bc5d-4f26-9607-c3322fd3529c',
  'S-WASH': 'cb3fd310-068e-4d22-804e-6d68084f9baf',
};

function parseCSV(text) {
  const rows = []; let r = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]; const n = text[i+1];
    if (c === '"') { if (q && n === '"') { f += '"'; i++; } else { q = !q; } }
    else if (c === ',' && !q) { r.push(f.trim()); f = ''; }
    else if ((c === '\n' || c === '\r') && !q) {
      if (c === '\r' && n === '\n') i++;
      r.push(f.trim()); rows.push(r); r = []; f = '';
    } else { f += c; }
  }
  if (f) { r.push(f.trim()); rows.push(r); }
  return rows;
}

function esc(v) { return String(v == null ? '' : v).replace(/'/g, "''"); }

function norm(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]/g, '').trim(); }

async function main() {
  const cfgCode = readFileSync(join(ROOT, 'config.js'), 'utf-8');
  const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
  const KEY = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
  const auth = { apikey: KEY, Authorization: 'Bearer ' + KEY };

  // Get PRADAN org
  const orgRes = await fetch(SUPABASE_URL + '/rest/v1/organizations?select=id&slug=eq.pradan', { headers: auth });
  const pradanId = (await orgRes.json())[0].id;
  console.log('PRADAN:', pradanId);

  // Load themes + sub-params
  const tRes = await fetch(SUPABASE_URL + '/rest/v1/themes?select=id,name', { headers: auth });
  const themes = await tRes.json();
  const themeById = {}; themes.forEach(t => themeById[t.id] = t.name);

  const spRes = await fetch(SUPABASE_URL + '/rest/v1/sub_parameters?select=id,name,theme_id&status=eq.active&limit=500', { headers: auth });
  const allSubParams = await spRes.json();
  const spByTheme = {};
  allSubParams.forEach(sp => {
    if (!spByTheme[sp.theme_id]) spByTheme[sp.theme_id] = [];
    spByTheme[sp.theme_id].push(sp);
  });

  // Load all villages + PRADAN OVs
  let offset = 0; let allVillages = [];
  while (true) {
    const url = SUPABASE_URL + '/rest/v1/villages?select=id,name,block,district,state,lat,lng&limit=1000&offset=' + offset;
    const res = await fetch(url, { headers: auth });
    const batch = await res.json();
    if (batch.length === 0) break;
    allVillages.push(...batch); offset += 1000;
  }

  const ovRes = await fetch(SUPABASE_URL + '/rest/v1/org_villages?select=village_id&org_id=eq.' + pradanId, { headers: auth });
  const ovSet = new Set((await ovRes.json()).map(x => x.village_id));

  // --- Build SMART village lookup ---
  // Index 1: Exact (name, district, state)
  const idxExact = {};
  // Index 2: Swapped (block = village name, name = block name)
  const idxSwapped = {};
  // Index 3: Normalized name to list of villages
  const idxNorm = {};

  for (const v of allVillages) {
    const n = norm(v.name);
    const d = norm(v.district);
    const s = norm(v.state);
    const b = norm(v.block);

    // Exact: normalized (name, district, state)
    idxExact[n + '|' + d + '|' + s] = v;

    // Swapped: (block = village name, name = block)
    if (b && b !== n) {
      idxSwapped[b + '|' + d + '|' + s] = v;
    }

    // Normalized name -> first match (for district-variation matching)
    if (!idxNorm[n]) idxNorm[n] = v;
  }

  // Parse CSV
  const rows = parseCSV(readFileSync(CSV_PATH, 'utf-8'));
  const headers = rows[0];
  const dataRows = rows.slice(1);

  const scoreCols = [];
  for (let i = 5; i < headers.length; i++) {
    const col = headers[i].trim();
    if (CSV_THEME_MAP[col]) {
      const tid = CSV_THEME_MAP[col];
      const sps = spByTheme[tid] || [];
      scoreCols.push({ index: i, name: col, themeId: tid, themeName: themeById[tid], subParams: sps });
    }
  }

  // --- Process each CSV row ---
  const sql = ['BEGIN;'];
  let exactMatch = 0, swappedMatch = 0, created = 0, totalCap = 0;
  let matchLog = [];

  for (const row of dataRows) {
    const csvVillage = (row[0]||'').trim();
    const csvBlock = (row[2]||'').trim();
    const csvDistrict = (row[3]||'').trim();
    const csvState = (row[4]||'').trim();
    if (!csvVillage || !csvDistrict || !csvState) continue;

    const n = norm(csvVillage);
    const d = norm(csvDistrict);
    const s = norm(csvState);
    const b = norm(csvBlock);

    let v = null;
    let matchType = '';

    // Strategy 1: Exact match on (name, district, state)
    v = idxExact[n + '|' + d + '|' + s];
    if (v) { matchType = 'exact'; }

    // Strategy 2: Try partial district match (e.g., 'Balrampur' vs 'Balrampur-Ramanujganj')
    if (!v) {
      const candidates = Object.keys(idxExact).filter(k => k.startsWith(n + '|') && k.endsWith('|' + s));
      if (candidates.length > 0) {
        // Pick the one with best district match
        const best = candidates.sort((a, b) => {
          const da = a.split('|')[1]; const db = b.split('|')[1];
          return db.includes(d) ? 1 : da.includes(d) ? -1 : 0;
        })[0];
        v = idxExact[best];
        matchType = 'exact-district-variant';
      }
    }

    // Strategy 3: Swapped (block=village, name=block)
    if (!v && b) {
      v = idxSwapped[n + '|' + d + '|' + s];
      if (v) { matchType = 'swapped'; }
    }

    // Strategy 4: Swapped + district variant
    if (!v && b) {
      const candidates = Object.keys(idxSwapped).filter(k => k.startsWith(n + '|') && k.endsWith('|' + s));
      if (candidates.length > 0) {
        const best = candidates.sort((a, b) => {
          const da = a.split('|')[1]; const db = b.split('|')[1];
          return db.includes(d) ? 1 : da.includes(d) ? -1 : 0;
        })[0];
        v = idxSwapped[best];
        matchType = 'swapped-district-variant';
      }
    }

    if (v) {
      if (matchType.startsWith('exact')) exactMatch++;
      else swappedMatch++;
      // Ensure OV link
      if (!ovSet.has(v.id)) {
        sql.push(`INSERT INTO org_villages (org_id, village_id, start_date, notes, status) VALUES ('${pradanId}', '${v.id}', CURRENT_DATE, 'PRADAN survey', 'active') ON CONFLICT (org_id, village_id) DO NOTHING;`);
      }
    } else {
      // Create new village
      const vid = crypto.randomUUID();
      sql.push(`INSERT INTO villages (id, name, gram_panchayat, block, district, state, geocode_status) VALUES ('${vid}', '${esc(csvVillage)}', '${esc(row[1]||'').trim()}', '${esc(csvBlock)}', '${esc(csvDistrict)}', '${esc(csvState)}', 'pending');`);
      sql.push(`INSERT INTO org_villages (org_id, village_id, start_date, notes, status) VALUES ('${pradanId}', '${vid}', CURRENT_DATE, 'PRADAN survey', 'active') ON CONFLICT (org_id, village_id) DO NOTHING;`);
      v = { id: vid };
      created++;
      matchType = 'created';
    }

    matchLog.push({ csv: csvVillage, db: v.name || csvVillage, type: matchType, district: csvDistrict });

    // Create captures for all column->theme->sub-params
    for (const col of scoreCols) {
      const rawVal = row[col.index] ? row[col.index].trim() : '';
      const val = parseFloat(rawVal);
      if (isNaN(val)) continue;
      for (const sp of col.subParams) {
        sql.push(`INSERT INTO captures (org_id, village_id, sub_parameter_id, value_text, value_scale, data_type, captured_by, journey_stage, captured_at, evidence_url) VALUES ('${pradanId}', '${v.id}', '${sp.id}', '${esc(col.name)}', ${val}, 'quantitative_scale', NULL, 'baseline', NOW(), 'PRADAN survey data');`);
        totalCap++;
      }
    }
  }

  sql.push('COMMIT;');
  writeFileSync(SQL_FILE, sql.join('\n'), 'utf-8');

  console.log('\n=== MATCHING RESULTS ===');
  console.log('Exact matches:', exactMatch);
  console.log('Swapped (block<->name):', swappedMatch);
  console.log('New villages created:', created);
  console.log('Total captures:', totalCap);

  console.log('\nMatch details:');
  matchLog.forEach(m => console.log('  [' + m.type.padEnd(25) + '] ' + m.csv + ' (' + m.district + ') -> ' + m.db));

  console.log('\nAll villages accounted for:', exactMatch + swappedMatch + created, 'of', dataRows.length);
  console.log('SQL:', SQL_FILE);
}

main().catch(console.error);
