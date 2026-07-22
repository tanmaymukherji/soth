// BharatAtlas geocoding script — queries ALL villages, gets coords from LGD bounding boxes
// Usage: node scripts/geocode-all.mjs [--limit=N] [--offset=N]
// Outputs SQL to stdout: pipe to supabase db query --linked or copy-paste
// Example: node scripts/geocode-all.mjs --limit=100 | supabase db query --linked

import { readFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const cfgCode = readFileSync(join(ROOT, 'config.js'), 'utf-8');

const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)?.[1];
const SUPABASE_ANON = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)?.[1];
if (!SUPABASE_URL || !SUPABASE_ANON) { console.error('Config error'); process.exit(1); }

const auth = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };
const BH_API = 'https://bharatlas.com/api/v1';

// File to write SQL updates
const SQL_FILE = join(ROOT, '_geocode_updates.sql');
let sqlCount = 0;

function writeSQL(sql) {
  appendFileSync(SQL_FILE, sql + '\n');
  sqlCount++;
}

// Try to find village in BharatAtlas LGD by name with multiple name formats
async function findVillage(name, district, state) {
  // Build list of name formats to try
  const names = [name.trim()];
  const cleaned = name.replace(/[()]/g, '').trim();
  if (cleaned !== names[0]) names.push(cleaned);
  const noParen = name.replace(/\([^)]*\)/g, '').trim();
  if (noParen && noParen !== cleaned) names.push(noParen);
  const upper = name.toUpperCase().trim();
  if (upper !== names[0]) names.push(upper);
  // Split into words and try each
  const words = noParen.split(/[,\s]+/).filter(w => w.length > 2);
  names.push(...words);

  const seen = new Set();
  for (const n of names) {
    if (seen.has(n) || n.length < 2) continue;
    seen.add(n);
    try {
      const r = await fetch(
        `${BH_API}/layers/lgd_villages/query?where=vilname11=${encodeURIComponent(n)}&select=vilname11,dtname,stname,xmin,ymin,xmax,ymax,_lat,_lng,vil_lgd&limit=20`
      );
      if (!r.ok) continue;
      const data = await r.json();
      if (!data?.data?.rows?.length) continue;
      const rows = data.data.rows;
      // Priority: exact district+state match > state-only match > first result
      let best = district ? rows.find(d =>
        d.dtname?.toLowerCase() === district.toLowerCase() &&
        d.stname?.toLowerCase() === state?.toLowerCase()
      ) : null;
      if (!best && state) {
        best = rows.find(d =>
          d.stname?.toLowerCase() === state.toLowerCase()
        );
      }
      return best || rows[0];
    } catch (e) {}
  }
  return null;
}

async function main() {
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '200');
  const offset = parseInt(process.argv.find(a => a.startsWith('--offset='))?.split('=')[1] || '0');

  // Initialize SQL file
  const fs = await import('fs');
  fs.writeFileSync(SQL_FILE, '-- SoTH Geocode Updates\nBEGIN;\n');

  // Fetch pending/unmatched villages using Supabase REST API (read-only, anon key works)
  const statusFilter = 'geocode_status=in.(pending,unmatched,failed)';
  const listUrl = `${SUPABASE_URL}/rest/v1/villages?select=id,name,district,state,geocode_status&${statusFilter}&order=name.asc&limit=${limit}&offset=${offset}`;

  const r = await fetch(listUrl, { headers: auth });
  if (!r.ok) { console.error('Supabase fetch error:', r.status, await r.text().catch(() => '')); return; }
  const villages = await r.json();
  console.log(`Found ${villages.length} villages to geocode`);

  let geocoded = 0;
  let notFound = 0;

  for (let i = 0; i < villages.length; i++) {
    const v = villages[i];
    process.stdout.write(`\r${i + 1}/${villages.length} — ${v.name} (${v.district}, ${v.state})...`);

    const match = await findVillage(v.name, v.district, v.state);
    if (match && (match._lat != null || match.xmin != null)) {
      const lat = match._lat ?? ((parseFloat(match.ymin) || 0) + (parseFloat(match.ymax) || 0)) / 2;
      const lng = match._lng ?? ((parseFloat(match.xmin) || 0) + (parseFloat(match.xmax) || 0)) / 2;
      if (lat && lng) {
        writeSQL(`UPDATE villages SET lat=${lat}, lng=${lng}, geocode_status='geocoded', geocode_source='bharatlas', geocode_label='BharatAtlas LGD centroid (lgd:${String(match.vil_lgd||'').replace(/'/g,"''")})', geocoded_at=NOW() WHERE id='${v.id}';`);
        geocoded++;
        continue;
      }
    }

    writeSQL(`UPDATE villages SET geocode_status='unmatched', geocode_source='${match ? 'bharatlas-nogeom' : 'bharatlas-notfound'}' WHERE id='${v.id}';`);
    notFound++;

    // Throttle to avoid rate limits
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 100));
  }

  writeSQL('COMMIT;');
  console.log(`\nDone: ${geocoded} geocoded, ${notFound} not found`);
  console.log(`SQL written to ${SQL_FILE} (${sqlCount} statements)`);
  console.log(`Run: supabase db query --linked -f ${SQL_FILE}`);
}

main().catch(console.error);
