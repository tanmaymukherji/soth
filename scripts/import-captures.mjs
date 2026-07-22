// Import capture data from SOTH parameters CSV into Supabase
// Uses REST API directly (no Supabase SDK needed)
// Usage: node scripts/import-captures.mjs [path-to-csv]

import { readFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const cfgCode = readFileSync(join(ROOT, 'config.js'), 'utf-8');
const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)?.[1];
const SUPABASE_ANON = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)?.[1];
if (!SUPABASE_URL || !SUPABASE_ANON) { console.error('Config error'); process.exit(1); }

const KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
const AUTH = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const csvPath = process.argv[2] || join(ROOT, '..', 'SOTH parameters- Superset.csv');

const SQL_FILE = join(ROOT, '_capture_import.sql');
let sqlCount = 0;
function writeSQL(sql) { appendFileSync(SQL_FILE, sql + '\n'); sqlCount++; }

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

const ORG_COLUMNS = [
  { col: 3, slug: 'pradan' },
  { col: 4, slug: 'buzz' },
  { col: 6, slug: 'gram-vikas-odisha' },
  { col: 8, slug: 'lipok' },
  { col: 10, slug: 'goonj' },
  { col: 15, slug: 'hum' },
  { col: 13, slug: 'vaagdhara' },
  { col: 16, slug: 'paani-foundation' },
  { col: 17, slug: 'timbaktu-collective' },
  { col: 18, slug: 'swades' },
  { col: 19, slug: 'fes' },
];

function normalizeValue(val) {
  const v = val.trim();
  if (!v || ['na','n/a','not applicable',''].includes(v.toLowerCase())) return null;
  const lower = v.toLowerCase();
  if (['yes','no','partially','yes partly','partly'].includes(lower)) return { text: v };
  const num = parseFloat(v);
  if (!isNaN(num) && num >= 0 && num <= 10) return Number.isInteger(num) ? { scale: num } : { numeric: num };
  return { text: v };
}

async function fetchJSON(url) { const r = await fetch(url, { headers: AUTH }); if (!r.ok) return null; return r.json(); }

async function main() {
  writeSQL('-- SOTH Capture Import\nBEGIN;\n');

  console.log('Reading CSV:', csvPath);
  const text = readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(text);
  console.log('CSV rows:', rows.length);

  console.log('Loading reference data...');
  const orgs = await fetchJSON(`${SUPABASE_URL}/rest/v1/organizations?select=id,slug&status=eq.active`);
  const subParams = await fetchJSON(`${SUPABASE_URL}/rest/v1/sub_parameters?select=id,name&status=eq.active`);
  const ovs = await fetchJSON(`${SUPABASE_URL}/rest/v1/org_villages?select=org_id,village_id&status=eq.active`);

  console.log(`  ${orgs.length} orgs, ${subParams.length} sub-params, ${ovs.length} org-village links`);

  const orgBySlug = {}; orgs.forEach(o => { orgBySlug[o.slug] = o; });
  const spByName = {}; subParams.forEach(sp => { spByName[sp.name.toLowerCase()] = sp; });
  const vidsByOrg = {}; ovs.forEach(ov => { if (!vidsByOrg[ov.org_id]) vidsByOrg[ov.org_id] = []; vidsByOrg[ov.org_id].push(ov.village_id); });

  // Build CSV org -> DB org mapping
  const csvOrgs = ORG_COLUMNS.map(c => ({ ...c, org: orgBySlug[c.slug] })).filter(c => c.org);
  console.log(`  Mapped ${csvOrgs.length} orgs from CSV`);

  let inserted = 0;
  let skipped = 0;

  for (let r = 4; r < rows.length; r++) {
    const row = rows[r];
    const subName = (row[1] || '').trim();
    if (!subName || subName === 'Sub- parameters') continue;

    const sp = spByName[subName.toLowerCase()];
    if (!sp) continue;

    for (const csvOrg of csvOrgs) {
      const raw = (row[csvOrg.col] || '').trim();
      if (!raw) continue;

      const normalized = normalizeValue(raw);
      if (!normalized) continue;

      const vids = vidsByOrg[csvOrg.org.id] || [];
      if (!vids.length) continue;

      const journey = normalized.text?.toLowerCase() === 'yes' ? 'achieved' :
        normalized.text?.toLowerCase() === 'partially' ? 'tracked' :
        normalized.scale !== null ? (normalized.scale >= 3 ? 'achieved' : 'tracked') : 'baseline';

      for (const villageId of vids) {
        const cols = ['org_id', 'village_id', 'sub_parameter_id', 'data_type', 'journey_stage', 'captured_at'];
        const vals = [`'${csvOrg.org.id}'`, `'${villageId}'`, `'${sp.id}'`, `'${sp.data_type || 'qualitative'}'`, `'${journey}'`, 'NOW()'];
        if (normalized.text != null) { cols.push('value_text'); vals.push(`'${normalized.text.replace(/'/g, "''")}'`); }
        if (normalized.scale != null) { cols.push('value_scale'); vals.push(`${normalized.scale}`); }
        if (normalized.numeric != null) { cols.push('value_numeric'); vals.push(`${normalized.numeric}`); }
        writeSQL(`INSERT INTO captures (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
        inserted++;
      }
    }
    if (r % 50 === 0) process.stdout.write(`\rRow ${r}/${rows.length}, generated ${inserted} inserts...`);
  }

  writeSQL('COMMIT;');
  console.log(`\nDone: ${inserted} INSERT statements generated`);
  console.log(`SQL file: ${SQL_FILE}`);
  console.log(`Run: supabase db query --linked -f ${SQL_FILE}`);
}

main().catch(console.error);
