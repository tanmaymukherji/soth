import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

const DELAY = 1100;

function esc(val) { return String(val).replace(/'/g, "''"); }

async function geocode(name, district, state) {
  const q = encodeURIComponent(name + ', ' + district + ', ' + state + ', India');
  try {
    const resp = await fetch('https://nominatim.openstreetmap.org/search?q=' + q + '&format=json&limit=1', {
      headers: { 'User-Agent': 'SoTH/1.0 (tanmay.mukherji@rainmatter.org)' }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.length) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name || '' };
    }
    return null;
  } catch { return null; }
}

function runSQL(sql) {
  writeFileSync('_gtmp.sql', sql, 'utf8');
  try {
    execSync('supabase db query --linked -f "_gtmp.sql"', { encoding: 'utf8', timeout: 20000, stdio: ['pipe','pipe','pipe'] });
  } catch {}
  try { unlinkSync('_gtmp.sql'); } catch {}
}

function queryVillages(sql) {
  writeFileSync('_gtmp.sql', sql, 'utf8');
  try {
    const raw = execSync('supabase db query --linked -o json -f "_gtmp.sql"', { encoding: 'utf8', timeout: 30000, stdio: ['pipe','pipe','pipe'] }).toString();
    const start = raw.indexOf('{');
    if (start < 0) return [];
    const data = JSON.parse(raw.substring(start));
    return (data.rows || []).map(r => ({ id: r.id, name: r.name, district: r.district || '', state: r.state || '' }));
  } catch {}
  try { unlinkSync('_gtmp.sql'); } catch {}
  return [];
}

async function run() {
  let total = 0, matched = 0;
  const BATCH = 50;

  while (true) {
    const villages = queryVillages("SELECT id, name, district, state FROM villages WHERE geocode_status = 'pending' ORDER BY name LIMIT " + BATCH + ";");
    if (!villages.length) break;

    let updateSql = '';
    for (const v of villages) {
      total++;
      const result = await geocode(v.name, v.district, v.state);
      if (result && !isNaN(result.lat) && !isNaN(result.lng)) {
        matched++;
        updateSql += "UPDATE villages SET lat = " + result.lat + ", lng = " + result.lng + ", geocode_source = 'nominatim', geocode_label = '" + esc(result.label.substring(0, 200)) + "', geocoded_at = NOW(), geocode_status = 'geocoded' WHERE id = '" + v.id + "';\n";
      } else {
        updateSql += "UPDATE villages SET geocode_status = 'unmatched' WHERE id = '" + v.id + "';\n";
      }
      process.stdout.write('\r' + total + ': ' + matched + ' ok, ' + (total - matched) + ' miss  ');
      await new Promise(r => setTimeout(r, DELAY));
    }
    if (updateSql) runSQL(updateSql);
  }
  console.log('\nDone. Total: ' + total + ', Geocoded: ' + matched);
}

run();
