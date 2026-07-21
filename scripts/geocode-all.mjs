// BharatAtlas geocoding script — queries ALL villages, gets coords from LGD bounding boxes
// Usage: node scripts/geocode-all.mjs [--limit=N] [--offset=N]
// Uses Supabase REST API directly (no SDK needed)

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const cfgCode = readFileSync(join(ROOT, 'config.js'), 'utf-8');

const SUPABASE_URL = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/)?.[1];
const SUPABASE_ANON = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)?.[1];
if (!SUPABASE_URL || !SUPABASE_ANON) { console.error('Config error'); process.exit(1); }

const KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const BH_API = 'https://bharatlas.com/api/v1';

// Try to find village in BharatAtlas LGD by name with multiple name formats
async function findVillage(name, district, state) {
  // Collect unique name formats to try
  const names = [name];
  const cleaned = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  if (cleaned && cleaned !== name) names.push(cleaned);
  const upper = name.toUpperCase();
  if (upper !== name) names.push(upper);
  const title = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  if (title !== name && title !== upper) names.push(title);

  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) continue;
    seen.add(n);
    try {
      const r = await fetch(
        `${BH_API}/layers/lgd_villages/query?where=vilname11=${encodeURIComponent(n)}&select=vilname11,dtname,stname,xmin,ymin,xmax,ymax,vil_lgd&limit=20`
      );
      if (!r.ok) continue;
      const data = await r.json();
      if (!data?.data?.length) continue;

      // Priority: exact district+state match > state-only match > first result
      let best = data.data.find(d =>
        d.dtname?.toLowerCase() === district?.toLowerCase() &&
        d.stname?.toLowerCase() === state?.toLowerCase()
      );
      if (best) return best;
      best = data.data.find(d =>
        d.stname?.toLowerCase() === state?.toLowerCase()
      );
      return best || data.data[0];
    } catch (e) {}
  }
  return null;
}

async function main() {
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '200');
  const offset = parseInt(process.argv.find(a => a.startsWith('--offset='))?.split('=')[1] || '0');

  // Fetch pending/unmatched villages
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
    if (match && match.xmin != null) {
      const lat = ((parseFloat(match.ymin) || 0) + (parseFloat(match.ymax) || 0)) / 2;
      const lng = ((parseFloat(match.xmin) || 0) + (parseFloat(match.xmax) || 0)) / 2;
      if (lat && lng) {
        await fetch(`${SUPABASE_URL}/rest/v1/villages?id=eq.${v.id}`, {
          method: 'PATCH',
          headers: auth,
          body: JSON.stringify({
            lat, lng,
            geocode_status: 'geocoded',
            geocode_source: 'bharatlas',
            geocode_label: `BharatAtlas LGD centroid (lgd:${match.vil_lgd || ''})`,
            geocoded_at: new Date().toISOString(),
          }),
        });
        geocoded++;
        continue;
      }
    }

    // Mark as unmatched
    await fetch(`${SUPABASE_URL}/rest/v1/villages?id=eq.${v.id}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({
        geocode_status: 'unmatched',
        geocode_source: match ? 'bharatlas-nogeom' : 'bharatlas-notfound',
      }),
    });
    notFound++;

    // Throttle to avoid rate limits
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nDone: ${geocoded} geocoded, ${notFound} not found`);
}

main().catch(console.error);
