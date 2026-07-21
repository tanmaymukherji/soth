// SoTH Geocoder — Backfill village lat/lng via Mappls/MapMyIndia search API
// Run: node scripts/geocode.mjs

const MAPPLS_KEY = process.env.MAPPLS_MAP_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');
const DELAY_MS = parseInt(process.env.DELAY_MS || '300');

if (!MAPPLS_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set MAPPLS_MAP_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function geocode(village) {
  const query = encodeURIComponent(`${village.name}, ${village.district || ''}, ${village.state || ''}, India`);
  const url = `https://atlas.mappls.com/api/places/search/json?query=${query}&region=IND`;
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${MAPPLS_KEY}` } });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data?.suggestedLocations?.length) {
      const loc = data.suggestedLocations[0];
      return { lat: parseFloat(loc.latitude), lng: parseFloat(loc.longitude), label: loc.placeAddress || '', placeId: loc.placeId || '' };
    }
    return null;
  } catch { return null; }
}

let total = 0, success = 0;

while (true) {
  const { data: villages, error } = await sb.from('villages')
    .select('id, name, block, district, state')
    .in('geocode_status', ['pending', 'unmatched', 'failed'])
    .limit(BATCH_SIZE);

  if (error) { console.error('Query error:', error); break; }
  if (!villages?.length) { console.log('No more villages to geocode.'); break; }

  for (const v of villages) {
    total++;
    const result = await geocode(v);
    if (result) {
      await sb.from('villages').update({
        lat: result.lat, lng: result.lng, geocode_source: 'mappls',
        geocode_place_id: result.placeId, geocode_label: result.label,
        geocoded_at: new Date().toISOString(), geocode_status: 'geocoded'
      }).eq('id', v.id);
      success++;
    } else {
      await sb.from('villages').update({ geocode_status: 'unmatched' }).eq('id', v.id);
    }
    process.stdout.write(`\rGeocoded ${total}, matched ${success}, unmatched ${total - success}`);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}
console.log(`\nDone. Total: ${total}, Matched: ${success}, Unmatched: ${total - success}`);
