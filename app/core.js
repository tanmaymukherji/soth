// SoTH Core - Supabase init, auth helpers, global state

const soth = {};

soth.config = () => window.APP_CONFIG || {};

soth.initSupabase = function () {
  if (soth._sb) return soth._sb;
  try {
    const cfg = soth.config();
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
      console.warn('SoTH: Supabase config missing or SDK not loaded');
      return null;
    }
    soth._sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, storageKey: 'soth_auth' }
    });
    console.log('SoTH: Supabase client created');
  } catch (e) {
    console.error('SoTH: Supabase init error:', e);
  }
  return soth._sb;
};

soth.sb = () => soth._sb || soth.initSupabase();

// --- Custom Auth (via Edge Function, independent of Supabase Auth) ---

soth.currentUser = null;
soth.currentProfile = null;

soth._authCall = async function (payload) {
  const cfg = soth.config();
  if (!cfg.AUTH_API_URL) return { error: 'AUTH_API_URL not configured' };
  try {
    const res = await fetch(cfg.AUTH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    console.error('SoTH auth call error:', e);
    return { error: 'Auth service unreachable' };
  }
};

soth.auth = {
  USER_KEY: 'soth_user',

  _saveSession: function (user) {
    try { localStorage.setItem(soth.auth.USER_KEY, JSON.stringify(user)); } catch {}
    soth.currentUser = { id: user.id, email: user.email };
    soth.currentProfile = user;
  },

  _clearSession: function () {
    try { localStorage.removeItem(soth.auth.USER_KEY); } catch {}
    soth.currentUser = null;
    soth.currentProfile = null;
  },

  _dispatchChange: function () {
    document.dispatchEvent(new CustomEvent('soth:authchange', {
      detail: { user: soth.currentUser, profile: soth.currentProfile }
    }));
  },

  init: async function () {
    try {
      const stored = localStorage.getItem(soth.auth.USER_KEY);
      if (stored) {
        const user = JSON.parse(stored);
        soth.currentUser = { id: user.id, email: user.email };
        soth.currentProfile = user;
        console.log('SoTH: auth session restored for', user.email);
      } else {
        console.log('SoTH: no stored session');
      }
      return soth.currentUser;
    } catch (e) {
      console.error('SoTH: auth.init error:', e);
      return null;
    }
  },

  signUp: async function (email, password, fullName) {
    if (!fullName) return { error: 'Full name is required' };
    const result = await soth._authCall({ action: 'signup', email, password, full_name: fullName });
    if (result.error) return { error: result.error };
    return { data: result.user };
  },

  signIn: async function (email, password) {
    const result = await soth._authCall({ action: 'login', email, password });
    if (result.error) return { error: result.error };
    if (result.user.status === 'pending') return { error: 'Account pending admin approval' };
    if (result.user.status === 'inactive') return { error: 'Account is deactivated' };
    soth.auth._saveSession(result.user);
    // Set Supabase Auth session for RLS compatibility
    if (result.session?.access_token && result.session?.refresh_token) {
      try {
        const sb = soth.sb();
        if (sb) await sb.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
      } catch (e) { console.warn('Could not set Supabase session:', e); }
    }
    soth.auth._dispatchChange();
    return { data: result.user };
  },

  signOut: async function () {
    try {
      const sb = soth.sb();
      if (sb) await sb.auth.signOut();
    } catch (e) { console.warn('signOut error:', e); }
    soth.auth._clearSession();
    soth.auth._dispatchChange();
  },

  changePassword: async function (oldPassword, newPassword) {
    const userId = soth.currentUser?.id;
    if (!userId) return { error: 'Not logged in' };
    return await soth._authCall({ action: 'changePassword', user_id: userId, old_password: oldPassword, new_password: newPassword });
  },

  adminResetPassword: async function (userId, newPassword) {
    const stored = localStorage.getItem(soth.auth.USER_KEY);
    const adminToken = stored ? JSON.parse(stored).id : '';
    const cfg = soth.config();
    if (!cfg.AUTH_API_URL) return { error: 'AUTH_API_URL not configured' };
    try {
      const res = await fetch(cfg.AUTH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'adminResetPassword', user_id: userId, new_password: newPassword })
      });
      return await res.json();
    } catch (e) {
      return { error: 'Auth service unreachable' };
    }
  },

  deleteUser: async function (userId) {
    const stored = localStorage.getItem(soth.auth.USER_KEY);
    const adminToken = stored ? JSON.parse(stored).id : '';
    const cfg = soth.config();
    if (!cfg.AUTH_API_URL) return { error: 'AUTH_API_URL not configured' };
    try {
      const res = await fetch(cfg.AUTH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'deleteUser', user_id: userId })
      });
      return await res.json();
    } catch (e) {
      return { error: 'Auth service unreachable' };
    }
  },

  updateProfile: async function (updates) {
    const stored = localStorage.getItem(soth.auth.USER_KEY);
    const adminToken = stored ? JSON.parse(stored).id : '';
    const cfg = soth.config();
    if (!cfg.AUTH_API_URL) return { error: 'AUTH_API_URL not configured' };
    try {
      const res = await fetch(cfg.AUTH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'updateUser', ...updates })
      });
      const result = await res.json();
      // Only update local session if the returned user matches the current user
      if (result.user && result.user.id === soth.currentUser?.id) {
        soth.auth._saveSession(result.user);
      }
      return result;
    } catch (e) {
      return { error: 'Auth service unreachable' };
    }
  },

  listUsers: async function () {
    const stored = localStorage.getItem(soth.auth.USER_KEY);
    const adminToken = stored ? JSON.parse(stored).id : '';
    const cfg = soth.config();
    if (!cfg.AUTH_API_URL) return [];
    if (!adminToken) return [];
    try {
      const res = await fetch(cfg.AUTH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'listUsers' })
      });
      const result = await res.json();
      if (result.error) {
        console.error('listUsers error:', result.error);
        return [];
      }
      return result.users || [];
    } catch (e) {
      console.error('listUsers fetch error:', e);
      return [];
    }
  },

  createOrg: async function (payload) {
    const stored = localStorage.getItem(soth.auth.USER_KEY);
    const adminToken = stored ? JSON.parse(stored).id : '';
    const cfg = soth.config();
    if (!cfg.AUTH_API_URL) return { error: 'Not configured' };
    try {
      const res = await fetch(cfg.AUTH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'createOrg', ...payload })
      });
      return await res.json();
    } catch (e) { return { error: 'Auth service unreachable' }; }
  },

  updateOrg: async function (payload) {
    const stored = localStorage.getItem(soth.auth.USER_KEY);
    const adminToken = stored ? JSON.parse(stored).id : '';
    const cfg = soth.config();
    if (!cfg.AUTH_API_URL) return { error: 'Not configured' };
    try {
      const res = await fetch(cfg.AUTH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
        body: JSON.stringify({ action: 'updateOrg', ...payload })
      });
      return await res.json();
    } catch (e) { return { error: 'Auth service unreachable' }; }
  },

  _adminAction: async function (action, payload) {
    const stored = localStorage.getItem(soth.auth.USER_KEY);
    const adminToken = stored ? JSON.parse(stored).id : '';
    const cfg = soth.config();
    if (!cfg.AUTH_API_URL) return { error: 'Not configured' };
    try {
      const res = await fetch(cfg.AUTH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
        body: JSON.stringify({ action, ...payload })
      });
      return await res.json();
    } catch (e) { return { error: 'Auth service unreachable' }; }
  },

  createTheme: function (payload) { return soth.auth._adminAction('createTheme', payload); },
  updateTheme: function (payload) { return soth.auth._adminAction('updateTheme', payload); },
  createSubParam: function (payload) { return soth.auth._adminAction('createSubParam', payload); },
  updateSubParam: function (payload) { return soth.auth._adminAction('updateSubParam', payload); },

  isAdmin: function () {
    return soth.currentProfile?.role === 'soth_admin';
  },

  isPartnerAdmin: function () {
    return soth.currentProfile?.role === 'partner_admin' || soth.currentProfile?.role === 'soth_admin';
  },

  requireAuth: function (redirectTo) {
    if (!soth.currentUser) {
      window.location.href = redirectTo || 'login.html';
      return false;
    }
    return true;
  },

  requireAdmin: function (redirectTo) {
    if (!soth.auth.requireAuth(redirectTo)) return false;
    if (!soth.auth.isAdmin()) {
      window.location.href = 'dashboard.html';
      return false;
    }
    return true;
  }
};

// --- Data helpers ---

// --- Data helpers ---

soth.data = {
  _sbOrNull: function () {
    const sb = soth.sb();
    if (!sb) console.warn('SoTH: Supabase not available for data query');
    return sb;
  },

  // Fetch active themes
  themes: async function () {
    try {
      const sb = soth.data._sbOrNull();
      if (!sb) return [];
      const { data } = await sb.from('themes').select('*').eq('status', 'active')
        .order('sort_order', { ascending: true }).order('name', { ascending: true });
      return data || [];
    } catch (e) { console.warn('SoTH: themes error:', e); return []; }
  },

  // Fetch sub-parameters for a theme
  subParams: async function (themeId) {
    try {
      const sb = soth.data._sbOrNull();
      if (!sb) return [];
      const { data } = await sb.from('sub_parameters').select('*')
        .eq('status', 'active')
        .eq('theme_id', themeId)
        .order('name', { ascending: true });
      return data || [];
    } catch (e) { console.warn('SoTH: subParams error:', e); return []; }
  },

  // Fetch all sub-parameters (superset)
  allSubParams: async function () {
    try {
      const sb = soth.data._sbOrNull();
      if (!sb) return [];
      const { data } = await sb.from('sub_parameters').select('*, themes(name)')
        .eq('status', 'active')
        .order('name');
      return data || [];
    } catch (e) { console.warn('SoTH: allSubParams error:', e); return []; }
  },

  // Fetch villages for an org
  orgVillages: async function (orgId) {
    try {
      const sb = soth.data._sbOrNull();
      if (!sb) return [];
      const { data } = await sb.from('org_villages').select('*, villages(*)')
        .eq('org_id', orgId).eq('status', 'active').limit(2000);
      return data || [];
    } catch (e) { console.warn('SoTH: orgVillages error:', e); return []; }
  },

  // Fetch latest captures for org + village
  latestCaptures: async function (orgId, villageId) {
    try {
      const sb = soth.sb();
      if (!sb) return [];
      let q = sb.from('latest_captures').select('*').eq('org_id', orgId);
      if (villageId) q = q.eq('village_id', villageId);
      const { data } = await q;
      return data || [];
    } catch (e) {
      console.warn('SoTH: latestCaptures error:', e);
      return [];
    }
  },

  // Insert/update a capture
  saveCapture: async function (capture) {
    try {
      const sb = soth.data._sbOrNull();
      if (!sb) return { error: new Error('Supabase not available') };
      const record = {
        org_id: capture.org_id,
        village_id: capture.village_id,
        sub_parameter_id: capture.sub_parameter_id,
        value_text: capture.value_text || '',
        value_numeric: capture.value_numeric || null,
        value_scale: capture.value_scale != null ? capture.value_scale : null,
        data_type: capture.data_type || 'qualitative',
        evidence_url: capture.evidence_url || '',
        captured_by: soth.currentUser?.id || null,
        journey_stage: capture.journey_stage || 'baseline',
        captured_at: new Date().toISOString()
      };
      const { data, error } = await sb.from('captures').insert(record).select().single();
      if (data) soth.audit.log('capture_create', 'captures', data.id);
      return { data, error };
    } catch (e) { console.warn('SoTH: saveCapture error:', e); return { error: e }; }
  },

  upsertCapture: async function (capture) {
    return soth.data.saveCapture(capture);
  },

  // Org list
  organizations: async function () {
    try {
      const sb = soth.data._sbOrNull();
      if (!sb) return [];
      const { data } = await sb.from('organizations').select('*').eq('status', 'active').order('name');
      return data || [];
    } catch (e) { console.warn('SoTH: organizations error:', e); return []; }
  },

  // All captures (admin)
  allCaptures: async function (filters) {
    try {
      const sb = soth.data._sbOrNull();
      if (!sb) return [];
      let query = sb.from('latest_captures').select('*, sub_parameters(name, theme_id, themes(name)), villages(name, district, state), organizations(name)');
      if (filters?.org_id) query = query.eq('org_id', filters.org_id);
      if (filters?.theme_id) query = query.eq('sub_parameters.theme_id', filters.theme_id);
      if (filters?.village_id) query = query.eq('village_id', filters.village_id);
      const { data } = await query.order('captured_at', { ascending: false }).limit(filters?.limit || 5000);
      return data || [];
    } catch (e) { console.warn('SoTH: allCaptures error:', e); return []; }
  }
};

// --- Audit ---
soth.audit = {
  log: async function (action, entity, entityId, beforeData, afterData) {
    try {
      const sb = soth.sb();
      await sb.from('audit_log').insert({
        actor_user_id: soth.currentUser?.id,
        action, entity, entity_id: entityId,
        before_data: beforeData || {},
        after_data: afterData || {}
      });
    } catch (e) { console.warn('Audit log error:', e); }
  }
};

// --- UI helpers ---

soth.ui = {
  showToast: function (message, type) {
    type = type || 'info';
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, 3500);
  },

  showLoading: function (el) {
    if (el) el.innerHTML = '<div class="loading-spinner">Loading...</div>';
  },

  escapeHtml: function (str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // JS/attribute-safe escape (handles single quotes for inline JS string literals)
  escapeAttr: function (str) {
    return String(str == null ? '' : str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '"');
  },

  formatDate: function (d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  formatDateTime: function (d) {
    if (!d) return '';
    return new Date(d).toLocaleString('en-IN');
  },

  dataTypeLabel: function (dt) {
    const labels = {
      qualitative: 'Qualitative (Yes/No/Partial)',
      quantitative_scale: 'Quantitative (Scale)',
      quantitative_numeric: 'Quantitative (Number)',
      text: 'Text / Notes',
      both: 'Qualitative + Quantitative'
    };
    return labels[dt] || dt;
  },

  renderSelect: function (options, selected, attrs) {
    let html = `<select ${attrs || ''}>`;
    html += '<option value="">-- Select --</option>';
    for (const [val, label] of Object.entries(options)) {
      const sel = val === selected ? ' selected' : '';
      html += `<option value="${soth.ui.escapeHtml(val)}"${sel}>${soth.ui.escapeHtml(label)}</option>`;
    }
    html += '</select>';
    return html;
  }
};

// --- Change Password Modal (available on all pages) ---

soth.showChangePasswordModal = function () {
  if (!soth.currentUser) { soth.ui.showToast('Not logged in', 'error'); return; }
  // Ensure modal exists
  let modal = document.getElementById('admin-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'admin-modal';
    modal.className = 'modal-overlay hidden';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-content" style="max-width:400px;">
      <h3>Change Password</h3>
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">For: <strong>${soth.ui.escapeHtml(soth.currentUser.email)}</strong></p>
      <div class="field-group">
        <label for="cp-old-pw">Current Password</label>
        <input type="password" id="cp-old-pw" placeholder="Enter current password">
      </div>
      <div class="field-group">
        <label for="cp-new-pw">New Password</label>
        <input type="password" id="cp-new-pw" placeholder="6+ characters" minlength="6">
      </div>
      <div class="field-group">
        <label for="cp-confirm-pw">Confirm New Password</label>
        <input type="password" id="cp-confirm-pw" placeholder="Re-enter new password">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="soth.doChangePassword()">Update Password</button>
        <button class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
      </div>
    </div>`;
  modal.classList.remove('hidden');
};

soth.doChangePassword = async function () {
  const oldPw = document.getElementById('cp-old-pw')?.value;
  const newPw = document.getElementById('cp-new-pw')?.value;
  const confirmPw = document.getElementById('cp-confirm-pw')?.value;

  if (!oldPw || !newPw || !confirmPw) { soth.ui.showToast('All fields are required', 'error'); return; }
  if (newPw.length < 6) { soth.ui.showToast('New password must be at least 6 characters', 'error'); return; }
  if (newPw !== confirmPw) { soth.ui.showToast('New passwords do not match', 'error'); return; }

  const result = await soth.auth.changePassword(oldPw, newPw);
  if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
  soth.ui.showToast('Password changed successfully!', 'success');
  document.getElementById('admin-modal').classList.add('hidden');
};

// --- Add Village (available on all pages) ---

soth._lgdSearchTimeout = null;

soth.searchLGDVillage = function () {
  const input = document.getElementById('av-name');
  const results = document.getElementById('lgd-results');
  if (!input || !results) return;
  const q = input.value.trim();
  if (q.length < 2) { results.style.display = 'none'; return; }

  clearTimeout(soth._lgdSearchTimeout);
  soth._lgdSearchTimeout = setTimeout(async () => {
    results.innerHTML = '<div style="padding:8px;color:var(--gray-500);font-size:12px;">Searching...</div>';
    results.style.display = '';
    try {
      const r = await fetch('https://bharatlas.com/api/v1/layers/lgd_villages/query?where=vilname11=' + encodeURIComponent(q) + '&select=vilname11,dtname,stname,xmin,ymin,xmax,ymax&limit=10');
      if (!r.ok) { results.style.display = 'none'; return; }
      const data = await r.json();
      if (!data?.data?.rows?.length) {
        results.innerHTML = '<div style="padding:8px;color:var(--gray-500);font-size:12px;">No matches in LGD database.</div>';
        return;
      }
      let html = data.data.rows.map((v) => {
        const lat = v.xmin != null ? ((parseFloat(v.ymin) + parseFloat(v.ymax)) / 2).toFixed(6) : '';
        const lng = v.xmin != null ? ((parseFloat(v.xmin) + parseFloat(v.xmax)) / 2).toFixed(6) : '';
        return '<div style="padding:8px;cursor:pointer;border-bottom:1px solid var(--gray-100);font-size:13px;" ' +
          'onclick="soth.selectLGDVillage(\'' + v.vilname11.replace(/'/g, "\\'") + '\',\'' + (v.dtname || '').replace(/'/g, "\\'") + '\',\'' + (v.stname || '').replace(/'/g, "\\'") + '\',' + lat + ',' + lng + ')">' +
          '<strong>' + soth.ui.escapeHtml(v.vilname11) + '</strong> - ' + soth.ui.escapeHtml(v.dtname || '') + ', ' + soth.ui.escapeHtml(v.stname || '') +
          (lat ? ' <span style="color:var(--gray-400);font-size:11px;">(' + lat + ', ' + lng + ')</span>' : '') +
          '</div>';
      }).join('');
      results.innerHTML = html;
    } catch (e) {
      results.style.display = 'none';
    }
  }, 500);
};

soth.selectLGDVillage = function (name, district, state, lat, lng) {
  document.getElementById('av-name').value = name;
  if (district) document.getElementById('av-district').value = district;
  if (state) { const sel = document.getElementById('av-state'); for (let i = 0; i < sel.options.length; i++) { if (sel.options[i].value.toLowerCase() === state.toLowerCase()) { sel.selectedIndex = i; break; } } }
  if (lat && lng) {
    soth._pendingLat = lat;
    soth._pendingLng = lng;
  }
  document.getElementById('lgd-results').style.display = 'none';
};

soth.showAddVillage = async function () {
  // Ensure admin-modal exists
  let modal = document.getElementById('admin-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'admin-modal';
    modal.className = 'modal-overlay hidden';
    document.body.appendChild(modal);
  }
  const { data: states } = await soth.sb().from('villages').select('distinct state');
  const stateOpts = (states || []).map(s => `<option value="${s.state}">${s.state}</option>`).join('');
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Add Village</h3>
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">
        Enter a village name to search BharatAtlas LGD database for auto-geocoding.
      </p>
      <form id="add-village-form">
        <label>Village Name *<input type="text" id="av-name" required oninput="soth.searchLGDVillage()" placeholder="Type to search LGD database..."></label>
        <div id="lgd-results" style="max-height:200px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:4px;margin-bottom:8px;display:none;"></div>
        <label>Gram Panchayat<input type="text" id="av-gp"></label>
        <label>Block<input type="text" id="av-block"></label>
        <label>District *<input type="text" id="av-district" required placeholder="Enter district name"></label>
        <label>State *<select id="av-state" required>${stateOpts}</select></label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Add Village</button>
          <button type="button" class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
        </div>
      </form>
    </div>`;
  modal.classList.remove('hidden');
  soth._lgdSearchTimeout = null;

  document.getElementById('add-village-form').onsubmit = async function (e) {
    e.preventDefault();
    const name = document.getElementById('av-name').value.trim();
    const gp = document.getElementById('av-gp').value.trim();
    const block = document.getElementById('av-block').value.trim();
    const district = document.getElementById('av-district').value.trim();
    const state = document.getElementById('av-state').value;

    const sb = soth.sb();
    const { data: existing } = await sb.from('villages').select('*')
      .eq('name', name).eq('district', district).eq('state', state).maybeSingle();
    let villageId;
    if (existing) {
      villageId = existing.id;
    } else {
      const { data: newV } = await sb.from('villages').insert({ name, gram_panchayat: gp, block, district, state })
        .select().single();
      if (!newV) { soth.ui.showToast('Error creating village', 'error'); return; }
      villageId = newV.id;
      if (soth._pendingLat && soth._pendingLng) {
        await sb.from('villages').update({
          lat: parseFloat(soth._pendingLat), lng: parseFloat(soth._pendingLng),
          geocode_source: 'bharatlas', geocode_label: 'LGD village centroid',
          geocoded_at: new Date().toISOString(), geocode_status: 'geocoded'
        }).eq('id', villageId);
        soth._pendingLat = null; soth._pendingLng = null;
      } else {
        let result = await soth.map.geocodeViaBharatAtlas({ name, district, state });
        if (!result?.lat) result = await soth.map.geocodeViaGramEEE({ name, district, state });
        if (!result?.lat) result = await soth.map.geocodeVillage({ name, district, state });
        if (result?.lat) {
          await sb.from('villages').update({
            lat: result.lat, lng: result.lng,
            geocode_source: result.source || 'mappls',
            geocode_label: result.label || '',
            geocoded_at: new Date().toISOString(), geocode_status: 'geocoded'
          }).eq('id', villageId);
        }
      }
    }

    // Link org to village
    if (soth.currentProfile?.org_id) {
      const { error } = await sb.from('org_villages').upsert({
        org_id: soth.currentProfile.org_id, village_id: villageId, start_date: new Date().toISOString().split('T')[0], status: 'active'
      }, { onConflict: 'org_id,village_id' });
      if (error) { soth.ui.showToast(error.message, 'error'); return; }
    }

    soth.ui.showToast('Village added!', 'success');
    modal.classList.add('hidden');
    // Reload if on dashboard, otherwise just close
    if (typeof soth.loadDashboard === 'function') {
      await soth.loadDashboard();
    }
  };
};

// Init on DOM ready
document.addEventListener('DOMContentLoaded', async function () {
  soth.initSupabase();
  soth.auth.init();

  // Inject "Add Village" button into nav for logged-in users
  const injectNavButtons = function () {
    if (!soth.currentUser) return;
    const nav = document.querySelector('nav');
    if (!nav) return;

    // Add Village button
    if (!document.getElementById('nav-add-village')) {
      const btn = document.createElement('button');
      btn.id = 'nav-add-village';
      btn.textContent = '+ Add Village';
      btn.className = 'btn btn-small btn-primary';
      btn.style.cssText = 'margin-left:8px;font-size:12px;padding:4px 10px;';
      btn.onclick = function () { soth.showAddVillage(); };
      const logoutBtn = nav.querySelector('button[onclick*="signOut"]') || nav.querySelector('#nav-logout');
      if (logoutBtn) { nav.insertBefore(btn, logoutBtn); }
      else { nav.appendChild(btn); }
    }

    // Change Password button
    if (!document.getElementById('nav-change-pw')) {
      const cpBtn = document.createElement('button');
      cpBtn.id = 'nav-change-pw';
      cpBtn.textContent = 'Change PW';
      cpBtn.className = 'btn btn-small btn-outline';
      cpBtn.style.cssText = 'margin-left:4px;font-size:12px;padding:4px 10px;';
      cpBtn.onclick = function () { soth.showChangePasswordModal(); };
      const logoutBtn = nav.querySelector('button[onclick*="signOut"]') || nav.querySelector('#nav-logout');
      if (logoutBtn) { nav.insertBefore(cpBtn, logoutBtn); }
      else { nav.appendChild(cpBtn); }
    }
  };

  // Try immediately and also on auth change
  injectNavButtons();
  document.addEventListener('soth:authchange', injectNavButtons);

  // Show Compare link only for admins
  const injectCompareLink = function () {
    const compareLink = document.getElementById('nav-compare');
    if (compareLink) {
      compareLink.style.display = soth.currentProfile?.role === 'soth_admin' ? '' : 'none';
    }
  };
  injectCompareLink();
  document.addEventListener('soth:authchange', injectCompareLink);
});

// Retry init when Supabase SDK is ready (in case it loaded after DOMContentLoaded)
window.addEventListener('supabaseReady', function () {
  if (!soth._sb) {
    soth.initSupabase();
    soth.auth.init();
  }
});
