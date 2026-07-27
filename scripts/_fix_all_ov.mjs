// Fix PRADAN missing villages — read CSV, create missing villages + org_villages links
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, '..', 'SOTH places - Upload.csv');

const cfgCode = readFileSync(join(ROOT, 'config.js'), 'utf-8');
const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const KEY = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];

// Can't use anon key for writes — need service key. Use SQL file approach instead.
const SQL_FILE = join(ROOT, '_pradan_fix.sql');

const ORG_MAP = {
  'Goonj': 'goonj', 'Lipok': 'lipok', 'PRADAN': 'pradan',
  'Gram Vikas': 'gram-vikas', 'HUM': 'hum', 'TRIF': 'trif',
  'Timbaktu': 'timbaktu-collective', 'Paani': 'paani-foundation',
  'Vaagdhara': 'vaagdhara',
};

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

async function main() {
  // Load existing villages and orgs
  const authHeaders = { 'Content-Type': 'application/json' };
  
  console.log('Reading CSV...');
  const rows = parseCSV(readFileSync(CSV_PATH, 'utf-8'));
  
  // Group by org
  const csvOrgs = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const orgName = (r[0] || '').trim();
    if (!orgName || orgName === 'Organisation') continue;
    if (!csvOrgs[orgName]) csvOrgs[orgName] = [];
    csvOrgs[orgName].push({
      name: (r[1] || '').trim(), block: (r[2] || '').trim(),
      district: (r[3] || '').trim(), state: (r[4] || '').trim(),
      desc: (r[5] || '').trim(), lat: parseFloat(r[7]), lng: parseFloat(r[8])
    });
  }

  // Get DB orgs
  const res = await fetch(`${SUPABASE_URL}/rest/v1/organizations?select=id,slug`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  const dbOrgs = await res.json();
  const orgBySlug = {}; dbOrgs.forEach(o => orgBySlug[o.slug] = o);

  // Get DB villages
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/villages?select=id,name,district,state`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  const dbVillages = await res2.json();
  const vByKey = {};
  dbVillages.forEach(v => {
    const key = (v.name || '').toLowerCase() + '||' + (v.district || '').toLowerCase() + '||' + (v.state || '').toLowerCase();
    vByKey[key] = v;
  });

  const sqlLines = ['-- Fix missing villages and org_villages\nBEGIN;\n'];
  let newV = 0, newOV = 0, exists = 0, failed = 0;

  for (const [csvOrg, entries] of Object.entries(csvOrgs)) {
    const slug = ORG_MAP[csvOrg];
    if (!slug) { failed++; continue; }
    const org = orgBySlug[slug];
    if (!org) { failed++; continue; }

    for (const e of entries) {
      const key = e.name.toLowerCase() + '||' + e.district.toLowerCase() + '||' + e.state.toLowerCase();
      const existing = vByKey[key];

      let villageId;
      if (existing) {
        villageId = existing.id;
        if (e.lat && (!existing.lat || Math.abs(existing.lat - e.lat) > 0.001)) {
          sqlLines.push(`UPDATE villages SET lat=${e.lat}, lng=${e.lng}, geocode_status='geocoded', geocode_source='csv-upload-fix', geocoded_at=NOW() WHERE id='${villageId}';`);
        }
      } else if (e.lat) {
        // Create new village
        const uid = crypto.randomUUID();
        villageId = uid;
        sqlLines.push(`INSERT INTO villages (id, name, block, district, state, lat, lng, geocode_status, geocode_source, geocoded_at) VALUES ('${uid}', '${esc(e.name)}', '${esc(e.block)}', '${esc(e.district)}', '${esc(e.state)}', ${e.lat}, ${e.lng}, 'geocoded', 'csv-upload-fix', NOW());`);
        vByKey[key] = { id: uid };
        newV++;
      } else {
        continue; // no coords, skip
      }

      // Create org_villages link
      const note = e.desc ? esc(e.desc) : 'SOTH activity';
      sqlLines.push(`INSERT INTO org_villages (org_id, village_id, start_date, notes, status) VALUES ('${org.id}', '${villageId}', CURRENT_DATE, '${note}', 'active') ON CONFLICT (org_id, village_id) DO UPDATE SET notes = CASE WHEN org_villages.notes IS NULL OR org_villages.notes = '' THEN '${note}' WHEN POSITION('${note}' IN org_villages.notes) = 0 THEN org_villages.notes || '; ' || '${note}' ELSE org_villages.notes END, status = 'active';`);
      newOV++;
      exists++;
    }
  }

  sqlLines.push('COMMIT;');
  writeFileSync(SQL_FILE, sqlLines.join('\n'), 'utf-8');

  console.log(`Script generated:`);
  console.log(`  New villages: ${newV}`);
  console.log(`  New/updated org_villages: ${newOV}`);
  console.log(`  Existing (updated): ${exists}`);
  console.log(`  SQL file: ${SQL_FILE}`);
  console.log(`Run: supabase db query --linked -f ${SQL_FILE}`);
}

main().catch(console.error);
