# SoTH Bootstrap Admin — Create first soth_admin user
# Run: node scripts/bootstrap-admin.mjs --email admin@example.com

const email = process.argv.find(a => a.startsWith('--email='))?.split('=')[1] || process.env.BOOTSTRAP_ADMIN_EMAIL;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!email || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Usage: node scripts/bootstrap-admin.mjs --email=admin@example.com');
  console.error('Also set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. Create or find the user
const { data: existingUser, error: lookupErr } = await sb.auth.admin.listUsers();
let userId;
const found = existingUser?.users?.find(u => u.email === email);
if (found) {
  userId = found.id;
  console.log(`Existing user found: ${email} (${userId})`);
} else {
  // Create with a temporary password
  const tempPw = 'changeme123!';
  const { data: newUser, error: createErr } = await sb.auth.admin.createUser({
    email, password: tempPw, email_confirm: true
  });
  if (createErr) { console.error('Create user error:', createErr); process.exit(1); }
  userId = newUser.user.id;
  console.log(`Created user ${email} with temporary password: ${tempPw}`);
}

// 2. Ensure profile exists with soth_admin role
const { data: existingProfile } = await sb.from('profiles').select('id').eq('id', userId).maybeSingle();
if (!existingProfile) {
  await sb.from('profiles').insert({
    id: userId, full_name: 'SoTH Admin', role: 'soth_admin', status: 'active'
  });
  console.log('Profile created with soth_admin role');
} else {
  await sb.from('profiles').update({ role: 'soth_admin', status: 'active' }).eq('id', userId);
  console.log('Profile updated to soth_admin');
}

console.log(`\nBootstrap complete. User ${email} now has soth_admin role.`);
console.log('Update config.js BOOTSTRAP_ADMIN_EMAIL to this email address.');
