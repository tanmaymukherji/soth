import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const cfgCode = readFileSync(join(ROOT, 'config.js'), 'utf-8');
const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const KEY = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
const ADMIN_EMAIL = 'tanmay.mukherji@rainmatter.org';
const ADMIN_PASS = 'SothAdmin2026!';

const PARAM_IDS = [
  'f6040dc6-21d5-490f-9521-a00d9e1328c4',
  'd8766b8b-931f-4ede-8b83-33f25ebc353d',
  '1dd46d98-709f-436a-ae00-91cd698ca1a1',
  'c99bc4ed-4c92-4bea-afd4-3162d74d3100',
  '60758617-bcfd-4f11-943b-835544fc7d08',
  'ae83aad6-2cde-4732-a25b-0eca335f5343',
  '57cb512a-049a-4d83-9e12-904236274068',
  '99b4e0e5-5b3c-474b-95e5-733daafdb697',
  'e9efb8fb-8356-46ee-86d5-68c039dce80c',
  '0e3f6571-27fe-4c6b-a0aa-75f3d50416e8',
  '1b04e701-240e-4c64-b662-6d294ca3b663',
  '58bcfbf5-286e-4212-952d-b51d73843368',
  '572f3790-80a3-4d50-8177-f0224d7f5e2e',
  '94d6c94c-85a3-4601-85ba-aaf7ff77e4a7',
];

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

function norm(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]/g, '').trim(); }

async function main() {
  // Sign in via REST API
  const authRes = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  if (!authRes.ok) { console.error('Login failed:', await authRes.text()); return; }
  const authData = await authRes.json();
  const token = authData.access_token;
  console.log('Signed in as admin');

  const headers = { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Delete existing PRADAN survey captures
  const delRes = await fetch(SUPABASE_URL + '/rest/v1/captures?org_id=eq.88ecdf9f-cb7c-484b-bc5e-c391e3d29b62&evidence_url=eq.PRADAN%20survey%20data', {
    method: 'DELETE', headers,
  });
  console.log('Deleted existing captures:', delRes.status);

  // Load villages
  let offset = 0; let allVillages = [];
  while (true) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/villages?select=id,name,block,district,state&limit=1000&offset=' + offset, { headers });
    const batch = await res.json();
    if (batch.length === 0) break;
    allVillages.push(...batch); offset += 1000;
  }
  console.log('Villages:', allVillages.length);

  const idxExact = {}, idxSwapped = {};
  for (const v of allVillages) {
    const n = norm(v.name), d = norm(v.district), s = norm(v.state), b = norm(v.block);
    idxExact[n + '|' + d + '|' + s] = v;
    if (b) idxSwapped[b + '|' + d + '|' + s] = v;
  }

  // Parse CSV
  const rows = parseCSV(readFileSync(join(ROOT, 'data', 'pradan_scores.csv'), 'utf-8'));
  let inserted = 0, failed = 0, missing = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = (row[0]||'').trim();
    const block = (row[2]||'').trim();
    const district = (row[3]||'').trim();
    const state = (row[4]||'').trim();
    if (!name || !district || !state) continue;

    const n = norm(name), d = norm(district), s = norm(state), b = norm(block);

    let v = idxExact[n + '|' + d + '|' + s];
    if (!v) v = idxSwapped[n + '|' + d + '|' + s];
    if (!v) {
      const c1 = Object.keys(idxExact).filter(k => k.startsWith(n + '|') && k.endsWith('|' + s));
      if (c1.length) v = idxExact[c1.sort((a,b) => a.split('|')[1].includes(d) ? -1 : 1)[0]];
    }
    if (!v) {
      const c2 = Object.keys(idxSwapped).filter(k => k.startsWith(n + '|') && k.endsWith('|' + s));
      if (c2.length) v = idxSwapped[c2.sort((a,b) => a.split('|')[1].includes(d) ? -1 : 1)[0]];
    }
    if (!v) { missing.push(name); continue; }

    for (let j = 0; j < 14; j++) {
      const raw = (row[5 + j]||'').trim();
      const score = parseFloat(raw);
      if (isNaN(score)) continue;

      const res = await fetch(SUPABASE_URL + '/rest/v1/captures', {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: '88ecdf9f-cb7c-484b-bc5e-c391e3d29b62',
          village_id: v.id,
          sub_parameter_id: PARAM_IDS[j],
          value_text: 'score',
          value_scale: score,
          data_type: 'quantitative_scale',
          journey_stage: 'baseline',
          captured_at: new Date().toISOString(),
          evidence_url: 'PRADAN survey data',
        }),
      });
      if (res.ok) inserted++;
      else { const t = await res.text(); console.error('FAIL', name, j, res.status, t.substring(0,80)); failed++; }
    }
  }

  console.log(`\nInserted: ${inserted}, Failed: ${failed}`);
  if (missing.length) console.log('Missing villages:', missing.join(', '));
}

main().catch(console.error);
