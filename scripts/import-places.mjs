// Import SOTH Places CSV
// Usage: node scripts/import-places.mjs
// Outputs: _places_import.sql —> supabase db query --linked -f _places_import.sql

import { readFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, '..', 'SOTH places - Upload.csv');
const SQL_FILE = join(ROOT, '_places_import.sql');

const ORG_MAP = {
  'Goonj': 'goonj', 'Lipok': 'lipok', 'PRADAN': 'pradan',
  'Gram Vikas': 'gram-vikas', 'HUM': 'hum', 'TRIF': 'trif',
  'Timbaktu': 'timbaktu-collective', 'Paani': 'paani-foundation',
  'Vaagdhara': 'vaagdhara',
};
const VAGUE_NAMES = ['10 Villages', 'All 1168 Villages'];

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
  if (currentField) { currentRow.push(currentField.trim()); rows.push(currentRow); }
  return rows;
}

function esc(v) { return String(v == null ? '' : v).replace(/'/g, "''"); }

function writeSQL(sql) { appendFileSync(SQL_FILE, sql + '\n'); }

// Load existing villages and orgs from DB
const cfgCode = readFileSync(join(ROOT, 'config.js'), 'utf-8');
const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const SUPABASE_ANON = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
const auth = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };

async function getJSON(url) { const r = await fetch(url, { headers: auth }); if (!r.ok) return null; return r.json(); }

async function main() {
  writeSQL('-- SoTH Places Import\nBEGIN;\n');

  // Load reference data from DB
  console.log('Loading reference data...');
  const existingVillages = await getJSON(`${SUPABASE_URL}/rest/v1/villages?select=id,name,district,state`);
  const orgs = await getJSON(`${SUPABASE_URL}/rest/v1/organizations?select=id,slug`);
  const existingOVs = await getJSON(`${SUPABASE_URL}/rest/v1/org_villages?select=org_id,village_id`);

  const exVByKey = {};
  (existingVillages || []).forEach(v => {
    const key = (v.name || '').toLowerCase() + '||' + (v.district || '').toLowerCase() + '||' + (v.state || '').toLowerCase();
    exVByKey[key] = v;
  });

  const orgBySlug = {};
  (orgs || []).forEach(o => { orgBySlug[o.slug] = o; });

  const ovSet = new Set();
  (existingOVs || []).forEach(ov => ovSet.add(ov.org_id + '||' + ov.village_id));

  // Delete vague entries
  console.log('Removing vague villages...');
  for (const vn of VAGUE_NAMES) {
    const data = await getJSON(`${SUPABASE_URL}/rest/v1/villages?select=id,name&name=eq.${encodeURIComponent(vn)}`);
    if (data) {
      for (const v of data) {
        writeSQL(`DELETE FROM captures WHERE village_id='${v.id}';`);
        writeSQL(`DELETE FROM org_villages WHERE village_id='${v.id}';`);
        writeSQL(`DELETE FROM villages WHERE id='${v.id}';`);
        console.log(`  Removed: "${v.name}"`);
      }
    }
  }

  // Parse CSV
  console.log('Reading CSV...');
  const text = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(text);
  console.log('CSV rows:', rows.length);

  let newCount = 0;
  let updateCount = 0;
  let ovCount = 0;
  let skipCount = 0;
  let ovExistsCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const csvOrg = (r[0] || '').trim();
    const name = (r[1] || '').trim();
    const block = (r[2] || '').trim();
    const district = (r[3] || '').trim();
    const state = (r[4] || '').trim();
    const desc = (r[5] || '').trim();
    const lat = parseFloat(r[7]);
    const lng = parseFloat(r[8]);

    if (!csvOrg || csvOrg === 'Organisation' || !name) { skipCount++; continue; }

    const slug = ORG_MAP[csvOrg];
    if (!slug) { skipCount++; continue; }
    const org = orgBySlug[slug];
    if (!org) { skipCount++; continue; }

    const key = name.toLowerCase() + '||' + district.toLowerCase() + '||' + state.toLowerCase();
    const existing = exVByKey[key];

    let villageId;
    if (existing) {
      villageId = existing.id;
      // Update lat/lng if CSV has better data
      if (lat && lng && (!existing.lat || !existing.lng || Math.abs(existing.lat - lat) > 0.001 || Math.abs(existing.lng - lng) > 0.001)) {
        writeSQL(`UPDATE villages SET lat=${lat}, lng=${lng}, geocode_status='geocoded', geocode_source='csv-upload', geocoded_at=NOW() WHERE id='${villageId}';`);
        updateCount++;
      }
    } else {
      // New village — generate UUID in JS
      const vid = crypto.randomUUID();
      villageId = vid;
      const note = desc ? esc(desc) : 'SOTH activity';
      writeSQL(`INSERT INTO villages (id, name, block, district, state, lat, lng, geocode_status, geocode_source, geocoded_at) VALUES ('${vid}', '${esc(name)}', '${esc(block)}', '${esc(district)}', '${esc(state)}', ${lat || 'NULL'}, ${lng || 'NULL'}, ${lat && lng ? "'geocoded','csv-upload',NOW()" : "'pending',NULL,NULL"});`);
      // Track for org_villages
      exVByKey[key] = { id: vid, lat, lng };
      newCount++;
    }

    // Upsert org_villages link
    const ovKey = org.id + '||' + villageId;
    const note = desc ? esc(desc) : 'SOTH activity';
    if (ovSet.has(ovKey)) {
      // Update notes if different
      writeSQL(`UPDATE org_villages SET notes = CASE WHEN notes IS NULL OR notes = '' THEN '${note}' WHEN POSITION('${note}' IN notes) = 0 THEN notes || '; ' || '${note}' ELSE notes END, updated_at = NOW() WHERE org_id='${org.id}' AND village_id='${villageId}';`);
      ovExistsCount++;
    } else {
      writeSQL(`INSERT INTO org_villages (org_id, village_id, start_date, notes, status) VALUES ('${org.id}', '${villageId}', CURRENT_DATE, '${note}', 'active');`);
      ovSet.add(ovKey);
      ovCount++;
    }

    if (i % 500 === 0) process.stdout.write(`\rRow ${i}/${rows.length}...`);
  }

  writeSQL('COMMIT;');
  console.log(`\n\nDone. SQL: ${SQL_FILE}`);
  console.log(`New villages: ${newCount}, Updated coords: ${updateCount}`);
  console.log(`New org_villages: ${ovCount}, Existing updated: ${ovExistsCount}, Skipped: ${skipCount}`);
  console.log(`Run: supabase db query --linked -f ${SQL_FILE}`);
}

main().catch(console.error);
