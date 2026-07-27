import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, '..', 'SOTH places - Upload.csv');
const SQL_FILE = join(ROOT, '_pradan_missing.sql');

const ORG_MAP = { 'PRADAN': 'pradan' };

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

const cfgCode = readFileSync(join(ROOT, 'config.js'), 'utf-8');
const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const KEY = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function main() {
  // Load DB orgs
  const res = await fetch(`${SUPABASE_URL}/rest/v1/organizations?select=id,slug`, { headers: auth });
  const orgs = await res.json();
  const orgBySlug = {}; orgs.forEach(o => orgBySlug[o.slug] = o);
  const pradan = orgBySlug['pradan'];
  if (!pradan) { console.error('PRADAN org not found'); return; }

  // Load DB villages
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/villages?select=id,name,district,state`, { headers: auth });
  const villages = await res2.json();
  const vByKey = {};
  villages.forEach(v => vByKey[(v.name||'').toLowerCase()+'||'+(v.district||'').toLowerCase()+'||'+(v.state||'').toLowerCase()] = v);

  // Load existing OVs
  const res3 = await fetch(`${SUPABASE_URL}/rest/v1/org_villages?select=village_id&org_id=eq.${pradan.id}`, { headers: auth });
  const existingOVs = await res3.json();
  const ovSet = new Set();
  (existingOVs||[]).forEach(ov => ovSet.add(ov.village_id));

  // Read CSV entries for PRADAN
  const rows = parseCSV(readFileSync(CSV_PATH, 'utf-8'));
  const pradanEntries = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if ((r[0]||'').trim() !== 'PRADAN') continue;
    pradanEntries.push({
      name: (r[1]||'').trim(), block: (r[2]||'').trim(),
      district: (r[3]||'').trim(), state: (r[4]||'').trim(),
      desc: (r[5]||'').trim(), lat: parseFloat(r[7]), lng: parseFloat(r[8])
    });
  }

  console.log(`PRADAN CSV entries: ${pradanEntries.length}`);

  const sql = ['BEGIN;'];
  let newV = 0, newOV = 0, skipped = 0;

  for (const e of pradanEntries) {
    const key = e.name.toLowerCase() + '||' + e.district.toLowerCase() + '||' + e.state.toLowerCase();
    const existing = vByKey[key];

    if (existing) {
      if (!ovSet.has(existing.id)) {
        sql.push(`INSERT INTO org_villages (org_id, village_id, start_date, notes, status) VALUES ('${pradan.id}', '${existing.id}', CURRENT_DATE, '${esc(e.desc||'SOTH activity')}', 'active') ON CONFLICT (org_id, village_id) DO NOTHING;`);
        newOV++;
      } else { skipped++; }
    } else if (e.lat) {
      const uid = crypto.randomUUID();
      sql.push(`INSERT INTO villages (id, name, block, district, state, lat, lng, geocode_status, geocode_source, geocoded_at) VALUES ('${uid}', '${esc(e.name)}', '${esc(e.block)}', '${esc(e.district)}', '${esc(e.state)}', ${e.lat}, ${e.lng}, 'geocoded', 'csv-upload-pradan', NOW()) ON CONFLICT (name, block, district, state) DO UPDATE SET geocode_source = EXCLUDED.geocode_source;`);
      sql.push(`INSERT INTO org_villages (org_id, village_id, start_date, notes, status) VALUES ('${pradan.id}', '${uid}', CURRENT_DATE, '${esc(e.desc||'SOTH activity')}', 'active') ON CONFLICT (org_id, village_id) DO NOTHING;`);
      vByKey[key] = { id: uid };
      newV++; newOV++;
    } else { skipped++; }
  }

  sql.push('COMMIT;');
  writeFileSync(SQL_FILE, sql.join('\n'), 'utf-8');
  console.log(`New villages: ${newV}, New OVs: ${newOV}, Skipped: ${skipped}`);
  console.log(`SQL file: ${SQL_FILE}`);
  console.log(`Run: supabase db query --linked -f ${SQL_FILE}`);
}

main().catch(console.error);
