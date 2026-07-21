// BharatAtlas Batch Geocoder — matches villages against SOI village points + LGD villages
// Usage: node scripts/geocode-bharatlas.mjs [--limit=100]

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pmtiles from 'pmtiles';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load config
const cfgPath = join(ROOT, 'config.js');
const cfgCode = readFileSync(cfgPath, 'utf-8');
const match = cfgCode.match(/SUPABASE_URL:\s*'([^']+)'/);
const keyMatch = cfgCode.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/);
if (!match || !keyMatch) { console.error('Config error'); process.exit(1); }

const SUPABASE_URL = match[1];
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || keyMatch[1];
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BHARATLAS_API = 'https://bharatlas.com/api/v1';

async function searchBharatAtlas(name, district, state) {
  // Search LGD villages by name
  const url = `${BHARATLAS_API}/layers/lgd_villages/query?where=name=${encodeURIComponent(name)}&select=name,district,state,block,lgd_code&limit=20`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data?.data?.length) return null;

    // Prefer exact district match
    let candidates = data.data;
    if (district) candidates = candidates.filter(d =>
      d.district?.toLowerCase() === district.toLowerCase());
    if (!candidates.length) candidates = data.data;
    if (state) candidates = candidates.filter(d =>
      d.state?.toLowerCase() === state.toLowerCase());

    return candidates[0] || data.data[0];
  } catch (e) { return null; }
}

async function getSOVillageCoords(name, district) {
  // Try SOI village points via BharatAtlas query (no geom returned, but confirms)
  const url = `${BHARATLAS_API}/layers/soi_village_points/query?where=name=${encodeURIComponent(name)}&limit=5`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data?.data?.length) return null;
    let match = data.data[0];
    if (district) {
      const d = data.data.find(d =>
        d.district?.toLowerCase() === district.toLowerCase());
      if (d) match = d;
    }
    return match;
  } catch (e) { return null; }
}

async function main() {
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '100');

  // Fetch unmatched villages from Supabase
  console.log('Fetching unmatched villages...');
  const { data: villages, error } = await sb
    .from('villages')
    .select('id, name, district, state')
    .in('geocode_status', ['pending', 'unmatched', 'failed'])
    .limit(limit);

  if (error) { console.error('Supabase error:', error); return; }
  console.log(`Found ${villages.length} villages to geocode`);

  let geocoded = 0, found = 0;

  for (const v of villages) {
    process.stdout.write(`\r${found + 1}/${villages.length} — ${v.name}...`);

    // Step 1: Find in BharatAtlas LGD
    const lgdMatch = await searchBharatAtlas(v.name, v.district, v.state);
    if (!lgdMatch) {
      // Mark as unmatched
      await sb.from('villages').update({ geocode_status: 'unmatched' }).eq('id', v.id);
      found++;
      continue;
    }

    // Step 2: Try SOI village points for coordinates
    const soiMatch = await getSOVillageCoords(v.name, v.district);
    if (soiMatch) {
      // SOI API doesn't return geometry, but we confirmed village exists
      // Names are matched — mark as "pending_manual" (admin can assign coordinates)
      await sb.from('villages').update({
        geocode_status: 'pending_manual',
        geocode_source: 'bharatlas',
        geocode_label: `${v.name}, ${v.district}, ${v.state} (confirmed in BharatAtlas)`,
      }).eq('id', v.id);
      found++;
      geocoded++;
      continue;
    }

    // Village found in LGD but no SOI point — keep as unmatched for now
    await sb.from('villages').update({
      geocode_status: 'unmatched',
      geocode_source: 'bharatlas',
      geocode_label: `Found in LGD but no coordinates: ${v.name}, ${v.district}`,
    }).eq('id', v.id);
    found++;
  }

  console.log(`\nDone. Geocoded: ${geocoded}, Found (no coords): ${found}`);
}

main().catch(console.error);
