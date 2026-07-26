import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, 'data', 'pradan_scores.csv');
const SQL_FILE = join(ROOT, '_pradan_captures.sql');

// Each PRADAN CSV column maps to ONE specific SoTH sub-parameter
const COL_MAP = {
  'Ec-Arresting Distress Migration': { sp: 'f6040dc6-21d5-490f-9521-a00d9e1328c4', label: 'Households involved in distress migration' },
  'Ec-Export import': { sp: 'd8766b8b-931f-4ede-8b83-33f25ebc353d', label: 'Export-Import ratio' },
  'Ec-HH Income': { sp: '1dd46d98-709f-436a-ae00-91cd698ca1a1', label: 'Diverse income sources (Farm + Allied)' },
  'Ec-Livelihood Basket': { sp: 'c99bc4ed-4c92-4bea-afd4-3162d74d3100', label: 'Livelihood basket diversification' },
  'Ec-Youth Employment': { sp: '60758617-bcfd-4f11-943b-835544fc7d08', label: 'Youth engagement in entrepreneurship' },
  'Env-Agro Ecology': { sp: 'ae83aad6-2cde-4732-a25b-0eca335f5343', label: 'Organic vs chemical cultivation area' },
  'Env-Energy': { sp: '57cb512a-049a-4d83-9e12-904236274068', label: 'Renewable energy usage at household level' },
  'Env-Forest': { sp: '99b4e0e5-5b3c-474b-95e5-733daafdb697', label: 'Continuous tree cover, forest area, wildlife corridors' },
  'Env-Soil': { sp: 'e9efb8fb-8356-46ee-86d5-68c039dce80c', label: 'Soil health testing' },
  'Env-Water': { sp: '0e3f6571-27fe-4c6b-a0aa-75f3d50416e8', label: 'Rainwater harvesting and water conservation' },
  'S-Gender & Inclusion': { sp: '1b04e701-240e-4c64-b662-6d294ca3b663', label: "Women's participation in public spaces" },
  'S-Health & Nutrition': { sp: '58bcfbf5-286e-4212-952d-b51d73843368', label: 'Dietary Diversity Score' },
  'S-Institution': { sp: '572f3790-80a3-4d50-8177-f0224d7f5e2e', label: 'Participation in Gram Sabhas' },
  'S-WASH': { sp: '94d6c94c-85a3-4601-85ba-aaf7ff77e4a7', label: 'Access to safe and sufficient drinking water' },
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

  const orgRes = await fetch(SUPABASE_URL + '/rest/v1/organizations?select=id&slug=eq.pradan', { headers: auth });
  const pradanId = (await orgRes.json())[0].id;
  console.log('PRADAN:', pradanId);

  // Load DB villages
  let offset = 0; let allVillages = [];
  while (true) {
    const url = SUPABASE_URL + '/rest/v1/villages?select=id,name,block,district,state,lat,lng&limit=1000&offset=' + offset;
    const res = await fetch(url, { headers: auth });
    const batch = await res.json();
    if (batch.length === 0) break;
    allVillages.push(...batch); offset += 1000;
  }

  // Load existing PRADAN OVs
  const ovRes = await fetch(SUPABASE_URL + '/rest/v1/org_villages?select=village_id&org_id=eq.' + pradanId, { headers: auth });
  const ovSet = new Set((await ovRes.json()).map(x => x.village_id));
  console.log('Existing OVs:', ovSet.size);

  // Build village index
  const idxExact = {}, idxSwapped = {};
  for (const v of allVillages) {
    const n = norm(v.name), d = norm(v.district), s = norm(v.state), b = norm(v.block);
    idxExact[n + '|' + d + '|' + s] = v;
    if (b && b !== n) idxSwapped[b + '|' + d + '|' + s] = v;
  }

  // Parse CSV
  const rows = parseCSV(readFileSync(CSV_PATH, 'utf-8'));
  const headers = rows[0];
  const dataRows = rows.slice(1);

  const scoreCols = [];
  for (let i = 5; i < headers.length; i++) {
    const col = headers[i].trim();
    if (COL_MAP[col]) scoreCols.push({ index: i, name: col, ...COL_MAP[col] });
    else console.warn('Unmapped column:', col);
  }
  console.log('Score columns:', scoreCols.length);

  const sql = ['BEGIN;'];
  let matched = 0, created = 0, totalCap = 0;
  const matchLog = [];

  for (const row of dataRows) {
    const csvVillage = (row[0]||'').trim();
    const csvBlock = (row[2]||'').trim();
    const csvDistrict = (row[3]||'').trim();
    const csvState = (row[4]||'').trim();
    if (!csvVillage || !csvDistrict || !csvState) continue;

    const n = norm(csvVillage), d = norm(csvDistrict), s = norm(csvState), b = norm(csvBlock);

    let v = null;
    let matchType = '';

    // Match strategies in order
    v = idxExact[n + '|' + d + '|' + s];
    if (v) matchType = 'exact';

    if (!v) {
      const candidates = Object.keys(idxExact).filter(k => k.startsWith(n + '|') && k.endsWith('|' + s));
      if (candidates.length) {
        v = idxExact[candidates.sort((a, b) => {
          const da = a.split('|')[1], db = b.split('|')[1];
          return db.includes(d) ? 1 : da.includes(d) ? -1 : 0;
        })[0]];
        matchType = 'exact-district';
      }
    }

    if (!v && b) {
      v = idxSwapped[n + '|' + d + '|' + s];
      if (v) matchType = 'swapped';
    }

    if (!v && b) {
      const candidates = Object.keys(idxSwapped).filter(k => k.startsWith(n + '|') && k.endsWith('|' + s));
      if (candidates.length) {
        v = idxSwapped[candidates.sort((a, b) => {
          const da = a.split('|')[1], db = b.split('|')[1];
          return db.includes(d) ? 1 : da.includes(d) ? -1 : 0;
        })[0]];
        matchType = 'swapped-district';
      }
    }

    if (!v) {
      const vid = crypto.randomUUID();
      sql.push(`INSERT INTO villages (id, name, gram_panchayat, block, district, state, geocode_status) VALUES ('${vid}', '${esc(csvVillage)}', '${esc(row[1]||'').trim()}', '${esc(csvBlock)}', '${esc(csvDistrict)}', '${esc(csvState)}', 'pending');`);
      sql.push(`INSERT INTO org_villages (org_id, village_id, start_date, notes, status) VALUES ('${pradanId}', '${vid}', CURRENT_DATE, 'PRADAN survey', 'active') ON CONFLICT (org_id, village_id) DO NOTHING;`);
      v = { id: vid };
      created++;
      matchType = 'created';
    } else {
      matched++;
      if (!ovSet.has(v.id)) {
        sql.push(`INSERT INTO org_villages (org_id, village_id, start_date, notes, status) VALUES ('${pradanId}', '${v.id}', CURRENT_DATE, 'PRADAN survey', 'active') ON CONFLICT (org_id, village_id) DO NOTHING;`);
      }
    }

    matchLog.push({ csv: csvVillage, type: matchType, db: v.name || csvVillage });

    // One capture per column → one specific sub-parameter
    for (const col of scoreCols) {
      const raw = row[col.index] ? row[col.index].trim() : '';
      const val = parseFloat(raw);
      if (isNaN(val)) continue;
      sql.push(`INSERT INTO captures (org_id, village_id, sub_parameter_id, value_text, value_scale, data_type, captured_by, journey_stage, captured_at, evidence_url) VALUES ('${pradanId}', '${v.id}', '${col.sp}', '${esc(col.name)}', ${val}, 'quantitative_scale', NULL, 'baseline', NOW(), 'PRADAN survey data');`);
      totalCap++;
    }
  }

  sql.push('COMMIT;');
  writeFileSync(SQL_FILE, sql.join('\n'), 'utf-8');

  console.log('\nMatched:', matched, 'Created:', created, 'Total villages:', matched + created);
  console.log('Captures:', totalCap);
  console.log('Expected per column: 63 x 14 =', 882);
  console.log('SQL:', SQL_FILE);
}

main().catch(console.error);
