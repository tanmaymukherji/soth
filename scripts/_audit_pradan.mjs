import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, '..', '..', 'SOTH places - Upload.csv');

function parseCSV(text) {
  const rows = []; let currentRow = []; let currentField = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]; const next = text[i + 1];
    if (ch === '"') { if (inQuotes && next === '"') { currentField += '"'; i++; } else { inQuotes = !inQuotes; } }
    else if (ch === ',' && !inQuotes) { currentRow.push(currentField.trim()); currentField = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      currentRow.push(currentField.trim()); rows.push(currentRow); currentRow = []; currentField = '';
    } else { currentField += ch; }
  }
  if (currentField) { currentRow.push(currentField.trim()); rows.push(currentField.trim()); }
  return rows;
}

const cfgCode = readFileSync(join(__dirname, '..', 'config.js'), 'utf-8');
const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const KEY = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function main() {
  // Load DB villages
  let offset = 0; let allVillages = [];
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/villages?select=id,name,district,state&limit=1000&offset=${offset}`, { headers: auth });
    const batch = await res.json();
    if (batch.length === 0) break;
    allVillages.push(...batch); offset += 1000;
  }
  const vByKey = {};
  allVillages.forEach(v => vByKey[(v.name||'').toLowerCase()+'||'+(v.district||'').toLowerCase()+'||'+(v.state||'').toLowerCase()] = v);

  // Load existing PRADAN OVs
  const orgRes = await fetch(`${SUPABASE_URL}/rest/v1/organizations?select=id&slug=eq.pradan`, { headers: auth });
  const orgs = await orgRes.json();
  const pradanId = orgs[0].id;
  const ovRes = await fetch(`${SUPABASE_URL}/rest/v1/org_villages?select=village_id&org_id=eq.${pradanId}`, { headers: auth });
  const ovSet = new Set((await ovRes.json()).map(ov => ov.village_id));

  const rows = parseCSV(readFileSync(CSV_PATH, 'utf-8'));
  const pradan = rows.slice(1).filter(r => r[0].trim() === 'PRADAN');
  console.log('PRADAN entries:', pradan.length);

  let found = 0, notFound = 0, linked = 0, notLinked = 0;
  for (const r of pradan) {
    const n = r[1].trim(); const d = r[3].trim(); const s = r[4].trim();
    const key = n.toLowerCase()+'||'+d.toLowerCase()+'||'+s.toLowerCase();
    const v = vByKey[key];
    if (v) {
      found++;
      if (ovSet.has(v.id)) linked++;
      else notLinked++;
      console.log('FOUND:', n, '|', d, '| lat=' + (r[7]||'').trim(), '| linked=' + ovSet.has(v.id));
    } else {
      notFound++;
      console.log('MISSING:', n, '|', d, '|', s, '| lat=' + (r[7]||'').trim());
    }
  }
  console.log('\nFound:', found, 'NotFound:', notFound, 'Linked:', linked, 'NotLinked:', notLinked);
}
main().catch(console.error);
