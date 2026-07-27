import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const cfgCode = readFileSync(join(ROOT, 'config.js'), 'utf-8');
const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const KEY = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
const auth = { apikey: KEY, Authorization: 'Bearer ' + KEY };

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

async function main() {
  // Load DB villages
  let offset = 0; let allVillages = [];
  while (true) {
    const url = SUPABASE_URL + '/rest/v1/villages?select=id,name,district,state,block&limit=1000&offset=' + offset;
    const res = await fetch(url, { headers: auth });
    const batch = await res.json();
    if (batch.length === 0) break;
    allVillages.push(...batch);
    offset += 1000;
  }
  console.log('DB villages:', allVillages.length);

  const vByKey = {};
  allVillages.forEach(v => {
    const k = (v.name||'').toLowerCase() + '||' + (v.district||'').toLowerCase() + '||' + (v.state||'').toLowerCase();
    vByKey[k] = v;
  });

  // Check CSV villages
  const csv = readFileSync(join(ROOT, 'data', 'pradan_scores.csv'), 'utf-8');
  const rows = parseCSV(csv);
  let matched = 0, unmatched = 0;
  const details = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[0]||'').trim();
    const district = (r[3]||'').trim();
    const state = (r[4]||'').trim();
    if (!name || !district || !state) continue;
    const key = name.toLowerCase() + '||' + district.toLowerCase() + '||' + state.toLowerCase();
    const v = vByKey[key];
    if (v) {
      matched++;
    } else {
      unmatched++;
      // Check if just the name exists with different district/state
      const nameLower = name.toLowerCase();
      const nameMatches = Object.keys(vByKey).filter(k => k.startsWith(nameLower + '||'));
      details.push({ name, district, state, nameMatches: nameMatches.slice(0, 3) });
    }
  }

  console.log('Matched:', matched, 'Unmatched:', unmatched);
  if (details.length > 0) {
    console.log('\nSample unmatched (first 15):');
    details.slice(0, 15).forEach(d => {
      console.log('  ' + d.name + ' | ' + d.district + ' | ' + d.state);
      if (d.nameMatches.length > 0) {
        d.nameMatches.forEach(m => console.log('    name match in DB: ' + m));
      }
    });
  }
}

main().catch(console.error);
