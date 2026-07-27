import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, '..', 'SOTH places - Upload.csv');
const SQL_FILE = join(ROOT, '_all_ovs_fix.sql');

const ORG_MAP = {
  'Vaagdhara': 'vaagdhara', 'Paani': 'paani-foundation', 'Goonj': 'goonj',
  'Timbaktu': 'timbaktu-collective', 'PRADAN': 'pradan', 'TRIF': 'trif',
  'HUM': 'hum', 'Gram Vikas': 'gram-vikas', 'Lipok': 'lipok'
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
  if (currentField) { currentRow.push(currentField.trim()); rows.push(currentField.trim()); }
  return rows;
}

function esc(v) { return String(v == null ? '' : v).replace(/'/g, "''"); }

async function main() {
  const cfgCode = readFileSync(join(ROOT, 'config.js'), 'utf-8');
  const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
  const KEY = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
  const auth = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/organizations?select=id,slug,name`, { headers: auth });
  const orgs = await res.json();
  const orgBySlug = {};
  orgs.forEach(o => orgBySlug[o.slug] = o);

  let offset = 0; let allVillages = [];
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/villages?select=id,name,district,state&limit=1000&offset=${offset}`, { headers: auth });
    const batch = await res.json();
    if (batch.length === 0) break;
    allVillages.push(...batch);
    offset += 1000;
  }
  const vByKey = {};
  allVillages.forEach(v => {
    const k = (v.name||'').toLowerCase()+'||'+(v.district||'').toLowerCase()+'||'+(v.state||'').toLowerCase();
    vByKey[k] = v;
  });

  const rows = parseCSV(readFileSync(CSV_PATH, 'utf-8'));
  console.log('CSV rows:', rows.length);

  const sqlLines = ['BEGIN;'];
  let newV = 0, newOV = 0, skipped = 0;
  const missingNoLat = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const csvOrg = (r[0]||'').trim();
    const slug = ORG_MAP[csvOrg];
    if (!slug) continue;
    const org = orgBySlug[slug];
    if (!org) { console.error('Org not found:', slug); continue; }

    const name = (r[1]||'').trim(); const block = (r[2]||'').trim();
    const district = (r[3]||'').trim(); const state = (r[4]||'').trim();
    const desc = (r[5]||'').trim(); const lat = (r[7]||'').trim(); const lng = (r[8]||'').trim();
    if (!name) continue;

    const key = name.toLowerCase()+'||'+district.toLowerCase()+'||'+state.toLowerCase();
    const existing = vByKey[key];

    if (existing) {
      sqlLines.push(`INSERT INTO org_villages (org_id, village_id, start_date, notes, status) VALUES ('${org.id}', '${existing.id}', CURRENT_DATE, '${esc(desc || 'SOTH activity')}', 'active') ON CONFLICT (org_id, village_id) DO NOTHING;`);
      newOV++;
    } else if (lat && parseFloat(lat) !== 0) {
      // Use PL/pgSQL DO block to handle insert-or-get-id
      const uid = crypto.randomUUID();
      sqlLines.push(`DO $$ DECLARE vid UUID; BEGIN`);
      sqlLines.push(`  INSERT INTO villages (id, name, block, district, state, lat, lng, geocode_status, geocode_source, geocoded_at) VALUES ('${uid}', '${esc(name)}', '${esc(block)}', '${esc(district)}', '${esc(state)}', ${parseFloat(lat)}, ${parseFloat(lng)}, 'geocoded', 'csv-upload-ovfix', NOW()) ON CONFLICT (name, block, district, state) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng RETURNING id INTO vid;`);
      sqlLines.push(`  INSERT INTO org_villages (org_id, village_id, start_date, notes, status) VALUES ('${org.id}', vid, CURRENT_DATE, '${esc(desc || 'SOTH activity')}', 'active') ON CONFLICT (org_id, village_id) DO NOTHING;`);
      sqlLines.push(`END $$;`);
      vByKey[key] = { id: uid };
      newV++; newOV++;
    } else {
      missingNoLat.push({ org: csvOrg, name, district, state, block });
      skipped++;
    }
  }

  sqlLines.push('COMMIT;');
  writeFileSync(SQL_FILE, sqlLines.join('\n'), 'utf-8');

  console.log(`\nNew villages: ${newV}`);
  console.log(`New OV links: ${newOV}`);
  console.log(`Skipped (no lat/lng): ${skipped}`);

  if (missingNoLat.length > 0) {
    console.log('\nEntries without lat/lng (need geocoding):');
    const byOrg = {};
    missingNoLat.forEach(e => { byOrg[e.org] = (byOrg[e.org]||0) + 1; });
    Object.entries(byOrg).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => {
      const details = missingNoLat.filter(e => e.org === k).slice(0, 3);
      console.log(`  ${k}: ${v} (e.g. ${details.map(d => d.name).join(', ')})`);
    });
  }

  console.log(`\nSQL file: ${SQL_FILE}`);
  console.log(`Run: supabase db query --linked -f ${SQL_FILE}`);
}

main().catch(console.error);
