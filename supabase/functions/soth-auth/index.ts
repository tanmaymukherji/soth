// SoTH Auth Edge Function — handles all auth operations independently of Supabase Auth

import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as bcrypt from 'npm:bcryptjs';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const sb = createClient(supabaseUrl, serviceKey);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { action, ...payload } = await req.json();

    switch (action) {
      case 'signup':
        return await handleSignup(payload);
      case 'login':
        return await handleLogin(payload);
      case 'changePassword':
        return await handleChangePassword(payload);
      case 'adminResetPassword':
        return await handleAdminResetPassword(payload, req);
      case 'getProfile':
        return await handleGetProfile(payload, req);
      case 'listUsers':
        return await handleListUsers(req);
      case 'updateUser':
        return await handleUpdateUser(payload, req);
      case 'deleteUser':
        return await handleDeleteUser(payload, req);
      default:
        return json({ error: 'Unknown action: ' + action }, 400);
    }
  } catch (e) {
    console.error('Auth function error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

// ─── Extract user ID from Authorization header ───
function getAuthUserId(req) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  // The token is simply the user ID for this simple system
  return auth.slice(7);
}

// ─── Helper: ensure Supabase Auth user exists and return session tokens ───
async function ensureAuthSession(localUser, password) {
  if (!localUser?.auth_id) {
    // Create Supabase Auth user with same password
    const { data: authUser, error: createError } = await sb.auth.admin.createUser({
      email: localUser.email,
      password: password,
      email_confirm: true,
    });
    if (createError || !authUser?.user) {
      console.error('Failed to create auth user:', createError);
      return null;
    }
    // Link auth_id to local_users
    await sb.from('local_users').update({ auth_id: authUser.user.id }).eq('id', localUser.id);
    localUser.auth_id = authUser.user.id;
  }
  // Sign in to get session tokens
  const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({
    email: localUser.email,
    password: password,
  });
  if (signInError || !signInData?.session) {
    console.error('Failed to sign in auth user:', signInError);
    return null;
  }
  return {
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  };
}

// ─── Signup — creates a new user ───
async function handleSignup({ email, password, full_name }) {
  if (!email || !password) return json({ error: 'Email and password required' }, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

  const normalizedEmail = email.toLowerCase().trim();

  // Check if email already exists
  const { data: existing } = await sb.from('local_users').select('id').eq('email', normalizedEmail).maybeSingle();
  if (existing) return json({ error: 'Email already registered' }, 409);

  const passwordHash = await bcrypt.hash(password, 10);
  const { data: user, error } = await sb.from('local_users').insert({
    email: normalizedEmail,
    password_hash: passwordHash,
    full_name: full_name || '',
    role: normalizedEmail === (Deno.env.get('BOOTSTRAP_ADMIN_EMAIL') || '').toLowerCase() ? 'soth_admin' : 'observer',
    status: 'pending',
  }).select('id, email, full_name, role, status, org_id, created_at').single();

  if (error) return json({ error: error.message }, 500);

  // Create Supabase Auth user for RLS compatibility
  try {
    const { data: authUser } = await sb.auth.admin.createUser({
      email: normalizedEmail,
      password: password,
      email_confirm: true,
    });
    if (authUser?.user) {
      await sb.from('local_users').update({ auth_id: authUser.user.id }).eq('id', user.id);
    }
  } catch (e) {
    console.error('Failed to create auth user during signup:', e);
  }

  return json({ user });
}

// ─── Login — verifies password ───
async function handleLogin({ email, password }) {
  if (!email || !password) return json({ error: 'Email and password required' }, 400);

  const normalizedEmail = email.toLowerCase().trim();
  const { data: user } = await sb.from('local_users').select('*').eq('email', normalizedEmail).maybeSingle();
  if (!user) return json({ error: 'Invalid email or password' }, 401);

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return json({ error: 'Invalid email or password' }, 401);

  if (user.status === 'inactive') return json({ error: 'Account is deactivated. Contact admin.' }, 403);

  // Create Supabase Auth session for RLS compatibility
  const session = await ensureAuthSession(user, password);

  // Return user without password_hash + auth session tokens
  const { password_hash, ...safeUser } = user;
  return json({ user: safeUser, session });
}

// ─── Change Password — requires old password ───
async function handleChangePassword({ user_id, old_password, new_password }) {
  if (!user_id || !old_password || !new_password) return json({ error: 'user_id, old_password, new_password required' }, 400);
  if (new_password.length < 6) return json({ error: 'New password must be at least 6 characters' }, 400);

  const { data: user } = await sb.from('local_users').select('*').eq('id', user_id).maybeSingle();
  if (!user) return json({ error: 'User not found' }, 404);

  const valid = await bcrypt.compare(old_password, user.password_hash);
  if (!valid) return json({ error: 'Old password is incorrect' }, 401);

  const newHash = await bcrypt.hash(new_password, 10);
  const { error } = await sb.from('local_users').update({ password_hash: newHash }).eq('id', user_id);
  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
}

// ─── Admin Reset Password — no old password needed ───
async function handleAdminResetPassword({ user_id, new_password }, req) {
  const adminId = getAuthUserId(req);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);

  // Check if the requester is an admin
  const { data: admin } = await sb.from('local_users').select('role').eq('id', adminId).maybeSingle();
  if (!admin || admin.role !== 'soth_admin') return json({ error: 'Only admins can reset passwords' }, 403);

  if (!user_id || !new_password) return json({ error: 'user_id and new_password required' }, 400);
  if (new_password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

  const newHash = await bcrypt.hash(new_password, 10);
  const { error } = await sb.from('local_users').update({ password_hash: newHash }).eq('id', user_id);
  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
}

// ─── Get Profile ───
async function handleGetProfile({ user_id }, req) {
  // Allow getting own profile via Authorization header, or admin lookup
  const authUserId = getAuthUserId(req);
  const targetId = user_id || authUserId;
  if (!targetId) return json({ error: 'User ID required' }, 400);

  // If not getting own profile, check admin
  if (targetId !== authUserId) {
    const { data: admin } = await sb.from('local_users').select('role').eq('id', authUserId).maybeSingle();
    if (!admin || admin.role !== 'soth_admin') return json({ error: 'Unauthorized' }, 403);
  }

  const { data: user } = await sb.from('local_users').select('id, email, full_name, role, status, org_id, created_at').eq('id', targetId).maybeSingle();
  if (!user) return json({ error: 'User not found' }, 404);
  return json({ user });
}

// ─── List Users (admin only) ───
async function handleListUsers(req) {
  const adminId = getAuthUserId(req);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);
  const { data: admin } = await sb.from('local_users').select('role').eq('id', adminId).maybeSingle();
  if (!admin || admin.role !== 'soth_admin') return json({ error: 'Only admins can list users' }, 403);

  const { data: users } = await sb.from('local_users').select('id, email, full_name, role, status, org_id, created_at').order('created_at', { ascending: false });
  return json({ users: users || [] });
}

// ─── Update User (admin only) ───
async function handleUpdateUser({ user_id, role, status, org_id }, req) {
  const adminId = getAuthUserId(req);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);
  const { data: admin } = await sb.from('local_users').select('role').eq('id', adminId).maybeSingle();
  if (!admin || admin.role !== 'soth_admin') return json({ error: 'Only admins can update users' }, 403);

  const updates = {};
  if (role !== undefined) updates.role = role;
  if (status !== undefined) updates.status = status;
  if (org_id !== undefined) updates.org_id = org_id || null;

  if (Object.keys(updates).length === 0) return json({ error: 'Nothing to update' }, 400);
  updates.updated_at = new Date().toISOString();

  const { data, error } = await sb.from('local_users').update(updates).eq('id', user_id).select('id, email, full_name, role, status, org_id').single();
  if (error) return json({ error: error.message }, 500);
  return json({ user: data });
}

// ─── Delete User (admin only) — removes from local_users only, not affecting any data ───
async function handleDeleteUser({ user_id }, req) {
  const adminId = getAuthUserId(req);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);
  const { data: admin } = await sb.from('local_users').select('role').eq('id', adminId).maybeSingle();
  if (!admin || admin.role !== 'soth_admin') return json({ error: 'Only admins can delete users' }, 403);
  if (!user_id) return json({ error: 'user_id required' }, 400);
  // Prevent admin from deleting themselves
  if (user_id === adminId) return json({ error: 'Cannot delete your own account' }, 400);

  const { error } = await sb.from('local_users').delete().eq('id', user_id);
  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
}
