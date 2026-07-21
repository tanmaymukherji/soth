// SoTH Core — Supabase init, auth helpers, global state

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

// --- Auth ---

soth.currentUser = null;
soth.currentProfile = null;

soth.auth = {
  _initCount: 0,

  init: async function () {
    soth.auth._initCount++;
    const attempt = soth.auth._initCount;
    try {
      const sb = soth.sb();
      if (!sb) {
        console.warn('SoTH: auth.init() #' + attempt + ' - no Supabase client');
        return null;
      }
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) {
        soth.currentUser = session.user;
        console.log('SoTH: session found for', session.user.email);
        await soth.auth.loadProfile();
      } else {
        console.log('SoTH: no session found');
      }
      sb.auth.onAuthStateChange(async (event, session) => {
        console.log('SoTH: auth event', event, session?.user?.email);
        if (session?.user) {
          soth.currentUser = session.user;
          await soth.auth.loadProfile();
        } else {
          soth.currentUser = null;
          soth.currentProfile = null;
        }
        document.dispatchEvent(new CustomEvent('soth:authchange', {
          detail: { user: soth.currentUser, profile: soth.currentProfile }
        }));
      });
      return session;
    } catch (e) {
      console.error('SoTH: auth.init() #' + attempt + ' error:', e);
      return null;
    }
  },

  loadProfile: async function () {
    try {
      if (!soth.currentUser) return null;
      const sb = soth.sb();
      if (!sb) return null;
      const { data } = await sb.from('profiles').select('*').eq('id', soth.currentUser.id).maybeSingle();
      soth.currentProfile = data || null;
      console.log('SoTH: profile loaded', soth.currentProfile?.role || 'none');
      return data;
    } catch (e) {
      console.error('SoTH: loadProfile error:', e);
      return null;
    }
  },

  signUp: async function (email, password, fullName) {
    const sb = soth.sb();
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } }
    });
    if (error) return { error };
    // Sign-in auto triggers creation of profile via trigger (use ensureProfile)
    await soth.auth.ensureProfile(data.user, fullName);
    return { data };
  },

  signIn: async function (email, password) {
    try {
      const sb = soth.sb();
      if (!sb) return { error: new Error('Supabase not configured') };
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { error };
      soth.currentUser = data.user;
      await soth.auth.loadProfile();
      return { data };
    } catch (e) {
      console.error('SoTH: signIn error:', e);
      return { error: e };
    }
  },

  signOut: async function () {
    try {
      const sb = soth.sb();
      if (sb) await sb.auth.signOut();
    } catch (e) { console.warn('SoTH: signOut error:', e); }
    soth.currentUser = null;
    soth.currentProfile = null;
  },

  ensureProfile: async function (user, fullName) {
    try {
      const sb = soth.sb();
      if (!sb) return null;
      const { data: existing } = await sb.from('profiles').select('id').eq('id', user.id).maybeSingle();
      if (!existing) {
        await sb.from('profiles').upsert({
          id: user.id,
          full_name: fullName || user.user_metadata?.full_name || '',
          role: user.email === (soth.config().BOOTSTRAP_ADMIN_EMAIL || '') ? 'soth_admin' : 'partner',
          status: 'active'
        }, { onConflict: 'id' });
      }
      await soth.auth.loadProfile();
    } catch (e) {
      console.error('SoTH: ensureProfile error:', e);
    }
  },

  sendPasswordReset: async function (email) {
    const sb = soth.sb();
    return sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login.html'
    });
  },

  updatePassword: async function (newPassword) {
    const sb = soth.sb();
    return sb.auth.updateUser({ password: newPassword });
  },

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
        .eq('org_id', orgId).eq('status', 'active');
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
      text: 'Text / Notes'
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

// Init on DOM ready
document.addEventListener('DOMContentLoaded', async function () {
  soth.initSupabase();
  soth.auth.init();
});

// Retry init when Supabase SDK is ready (in case it loaded after DOMContentLoaded)
window.addEventListener('supabaseReady', function () {
  if (!soth._sb) {
    soth.initSupabase();
    soth.auth.init();
  }
});
