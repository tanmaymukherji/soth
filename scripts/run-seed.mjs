import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';

// Generate seed SQL
const sqlOutput = execSync('node scripts/seed-sql.mjs', { encoding: 'utf8' }).replace(/^\uFEFF/, '');
writeFileSync('seed_data.sql', sqlOutput, 'utf8');
console.log('Generated seed_data.sql:', Buffer.from(sqlOutput).length, 'bytes');

// Split and execute
const lines = sqlOutput.split('\n');
const BATCH_LINES = 600;
let batchNum = 0;
let total = Math.ceil(lines.length / BATCH_LINES);

for (let i = 0; i < lines.length; i += BATCH_LINES) {
  const end = Math.min(i + BATCH_LINES, lines.length);
  const chunk = lines.slice(i, end).join('\n');
  const tmp = `_b${batchNum}.sql`;
  writeFileSync(tmp, chunk, 'utf8');
  try {
    const result = execSync(`supabase db query --linked -f "${tmp}"`, { encoding: 'utf8', timeout: 60000, stdio: ['pipe','pipe','pipe'] });
    process.stdout.write('.');
  } catch (e) {
    const stderr = (e.stderr || '').toString();
    if (stderr.includes('unexpected status 400')) {
      // Show the actual SQL error
      const errMatch = stderr.match(/ERROR: .*?(?:\n|$)/);
      console.error(`\n  Batch ${batchNum} SQL error: ${errMatch ? errMatch[0].trim() : stderr.substring(0, 200)}`);
      process.stdout.write('F');
    } else {
      console.error(`\n  Batch ${batchNum}: ${stderr.substring(0, 200)}`);
      process.stdout.write('F');
    }
  }
  try { unlinkSync(tmp); } catch {}
  batchNum++;
}
console.log(`\nDone: ${total} batches processed`);
