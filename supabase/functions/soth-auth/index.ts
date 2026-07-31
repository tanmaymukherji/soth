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
      case 'createOrg':
        return await handleCreateOrg(payload, req);
      case 'updateOrg':
        return await handleUpdateOrg(payload, req);
      case 'createTheme':
        return await handleCreateTheme(payload, req);
      case 'updateTheme':
        return await handleUpdateTheme(payload, req);
      case 'createSubParam':
        return await handleCreateSubParam(payload, req);
      case 'updateSubParam':
        return await handleUpdateSubParam(payload, req);
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
  // First try to sign in directly — works if user exists with same password
  let signInResult = await sb.auth.signInWithPassword({
    email: localUser.email,
    password: password,
  }).catch(() => null);

  // If sign-in fails, either the user doesn't exist or password is different
  if (!signInResult?.data?.session) {
    // Try to find the existing auth user by looking them up
    let authUserId = null;
    try {
      // Use admin API to list users and find by email
      const { data: usersData } = await sb.auth.admin.listUsers();
      const existing = usersData?.users?.find((u: any) => u.email === localUser.email);
      if (existing) {
        authUserId = existing.id;
        // Update the existing user's password to match
        await sb.auth.admin.updateUserById(authUserId, { password: password });
      }
    } catch (_) {}

    if (!authUserId) {
      // No existing auth user — create one
      const { data: authUser } = await sb.auth.admin.createUser({
        email: localUser.email,
        password: password,
        email_confirm: true,
      }).catch(() => ({ data: null }));
      if (authUser?.user) authUserId = authUser.user.id;
    }

    if (authUserId) {
      await sb.from('local_users').update({ auth_id: authUserId }).eq('id', localUser.id);
      localUser.auth_id = authUserId;
    }

    // Retry sign-in
    signInResult = await sb.auth.signInWithPassword({
      email: localUser.email,
      password: password,
    }).catch(() => null);
  } else {
    // Sign-in succeeded — link auth_id if not yet set
    if (!localUser?.auth_id) {
      const authUserId = signInResult.data.user?.id;
      if (authUserId) {
        await sb.from('local_users').update({ auth_id: authUserId }).eq('id', localUser.id);
        localUser.auth_id = authUserId;
      }
    }
  }

  if (!signInResult?.data?.session) {
    console.error('Failed to get Supabase Auth session for', localUser.email);
    return null;
  }
  return {
    access_token: signInResult.data.session.access_token,
    refresh_token: signInResult.data.session.refresh_token,
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

// ─── Create Org (admin only) — bypasses RLS via service key ───
async function handleCreateOrg({ name, slug, contact_email, org_type }, req) {
  const adminId = getAuthUserId(req);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);
  const { data: admin } = await sb.from('local_users').select('role').eq('id', adminId).maybeSingle();
  if (!admin || admin.role !== 'soth_admin') return json({ error: 'Only admins can create orgs' }, 403);
  if (!name || !slug) return json({ error: 'Name and slug required' }, 400);
  const { data: org, error } = await sb.from('organizations').insert({
    name, slug, contact_email: contact_email || '', org_type: org_type || 'partitionr', status: 'active',
  }).select('id, name, slug, org_type, status').single();
  if (error) return json({ error: error.message }, 500);
  return json({ org });
}

// ─── Update Org (admin only) — bypasses RLS via service key ───
async function handleUpdateOrg({ org_id, name, slug, contact_email, org_type, status }, req) {
  const adminId = getAuthUserId(req);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);
  const { data: admin } = await sb.from('local_users').select('role').eq('id', adminId).maybeSingle();
  if (!admin || admin.role !== 'soth_admin') return json({ error: 'Only admins can update orgs' }, 403);
  if (!org_id) return json({ error: 'org_id required' }, 400);
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (contact_email !== undefined) updates.contact_email = contact_email;
  if (org_type !== undefined) updates.org_type = org_type;
  if (status !== undefined) updates.status = status;
  if (Object.keys(updates).length === 0) return json({ error: 'Nothing to update' }, 400);
  const { data: org, error } = await sb.from('organizations').update(updates).eq('id', org_id).select('id, name, slug, org_type, status').single();
  if (error) return json({ error: error.message }, 500);
  return json({ org });
}

// ─── Create Theme (admin only) — bypasses RLS via service key ───
async function handleCreateTheme({ name, description, sort_order }, req) {
  const adminId = getAuthUserId(req);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);
  const { data: admin } = await sb.from('local_users').select('role').eq('id', adminId).maybeSingle();
  if (!admin || admin.role !== 'soth_admin') return json({ error: 'Only admins can create themes' }, 403);
  if (!name) return json({ error: 'Name required' }, 400);
  const { data: theme, error } = await sb.from('themes').insert({
    name, description: description || '', sort_order: sort_order || 0, status: 'active',
  }).select('id, name, description, sort_order, status').single();
  if (error) return json({ error: error.message }, 500);
  return json({ theme });
}

// ─── Update Theme (admin only) — bypasses RLS via service key ───
async function handleUpdateTheme({ theme_id, name, description, sort_order, status }, req) {
  const adminId = getAuthUserId(req);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);
  const { data: admin } = await sb.from('local_users').select('role').eq('id', adminId).maybeSingle();
  if (!admin || admin.role !== 'soth_admin') return json({ error: 'Only admins can update themes' }, 403);
  if (!theme_id) return json({ error: 'theme_id required' }, 400);
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (status !== undefined) updates.status = status;
  if (Object.keys(updates).length === 0) return json({ error: 'Nothing to update' }, 400);
  const { data: theme, error } = await sb.from('themes').update(updates).eq('id', theme_id).select('id, name, description, sort_order, status').single();
  if (error) return json({ error: error.message }, 500);
  return json({ theme });
}

// ─── Create Sub-Parameter (admin only) — bypasses RLS via service key ───
async function handleCreateSubParam({ theme_id, name, description, data_type, scale, possible_values }, req) {
  const adminId = getAuthUserId(req);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);
  const { data: admin } = await sb.from('local_users').select('role').eq('id', adminId).maybeSingle();
  if (!admin || admin.role !== 'soth_admin') return json({ error: 'Only admins can create sub-parameters' }, 403);
  if (!theme_id || !name) return json({ error: 'theme_id and name required' }, 400);
  const { data: subParam, error } = await sb.from('sub_parameters').insert({
    theme_id, name,
    description: description || '',
    data_type: data_type || 'qualitative',
    scale: scale || null,
    possible_values: possible_values || [],
    status: 'active',
    version: 1,
  }).select('id, theme_id, name, description, data_type, status, version').single();
  if (error) return json({ error: error.message }, 500);
  return json({ subParam });
}

// ─── Update Sub-Parameter (admin only) — bypasses RLS via service key ───
async function handleUpdateSubParam({ sub_param_id, theme_id, name, description, data_type, scale, possible_values, status }, req) {
  const adminId = getAuthUserId(req);
  if (!adminId) return json({ error: 'Unauthorized' }, 401);
  const { data: admin } = await sb.from('local_users').select('role').eq('id', adminId).maybeSingle();
  if (!admin || admin.role !== 'soth_admin') return json({ error: 'Only admins can update sub-parameters' }, 403);
  if (!sub_param_id) return json({ error: 'sub_param_id required' }, 400);
  const updates = {};
  if (theme_id !== undefined) updates.theme_id = theme_id;
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (data_type !== undefined) updates.data_type = data_type;
  if (scale !== undefined) updates.scale = scale;
  if (possible_values !== undefined) updates.possible_values = possible_values;
  if (status !== undefined) updates.status = status;
  if (Object.keys(updates).length === 0) return json({ error: 'Nothing to update' }, 400);
  const { data: subParam, error } = await sb.from('sub_parameters').update(updates).eq('id', sub_param_id).select('id, theme_id, name, description, data_type, status, version').single();
  if (error) return json({ error: error.message }, 500);
  return json({ subParam });
}
