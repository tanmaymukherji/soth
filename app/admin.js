// SoTH Admin - Admin console functionality

soth.admin = {
  init: function () {
    if (!soth.auth.requireAdmin('login.html')) return;
    this.renderDashboard('admin-content');
  },

  renderDashboard: async function (containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="admin-layout">
        <nav class="admin-sidenav">
          <button class="admin-nav-btn active" onclick="soth.admin.showSection('orgs')">Organisations</button>
          <button class="admin-nav-btn" onclick="soth.admin.showSection('themes')">Themes & Parameters</button>
          <button class="admin-nav-btn" onclick="soth.admin.showSection('proposals')">Proposals</button>
          <button class="admin-nav-btn" onclick="soth.admin.showSection('villages')">Villages</button>
          <button class="admin-nav-btn" onclick="soth.admin.showSection('captures')">All Captures</button>
          <button class="admin-nav-btn" onclick="soth.admin.showSection('analytics')">Analytics</button>
          <button class="admin-nav-btn" onclick="soth.admin.showSection('users')">Users</button>
          <button class="admin-nav-btn" onclick="soth.admin.showSection('geocoding')">Geocoding</button>
          <button class="admin-nav-btn" onclick="soth.admin.showSection('exports')">Export Data</button>
        </nav>
        <div class="admin-main" id="admin-section-content">
          <p>Select a section from the left.</p>
        </div>
      </div>`;

    await this.showSection('orgs');
  },

  showSection: async function (section) {
    document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.admin-nav-btn[onclick*="${section}"]`);
    if (btn) btn.classList.add('active');

    const content = document.getElementById('admin-section-content');
    soth.ui.showLoading(content);

    switch (section) {
      case 'orgs': await this.renderOrgs(content); break;
      case 'themes': await this.renderThemes(content); break;
      case 'proposals': await this.renderProposals(content); break;
      case 'villages': await this.renderVillages(content); break;
      case 'captures': await this.renderCaptures(content); break;
      case 'analytics': await this.renderAnalytics(content); break;
      case 'users': await this.renderUsers(content); break;
      case 'geocoding': await this.renderGeocoding(content); break;
      case 'exports': await this.renderExports(content); break;
      default: content.innerHTML = '<p>Select a section.</p>';
    }
  },

  renderOrgs: async function (container) {
    const sb = soth.sb();
    const { data: orgs } = await sb.from('organizations').select('*').order('name');

    let html = '<div class="admin-section"><h2>Organisations</h2>';
    html += `<button class="btn btn-primary" onclick="soth.admin.showOrgForm()">+ Add Organisation</button>`;
    html += '<table class="param-table"><thead><tr><th>Name</th><th>Slug</th><th>Email</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    (orgs || []).forEach(o => {
      html += `<tr>
        <td><strong>${soth.ui.escapeHtml(o.name)}</strong></td>
        <td>${soth.ui.escapeHtml(o.slug)}</td>
        <td>${soth.ui.escapeHtml(o.contact_email)}</td>
        <td>
          <select onchange="soth.admin.setOrgType('${o.id}', this.value)" style="font-size:12px;padding:2px 6px;border:1px solid var(--gray-300);border-radius:4px;">
            <option value="partner"${o.org_type === 'partner' ? ' selected' : ''}>Partner</option>
            <option value="observer"${o.org_type === 'observer' ? ' selected' : ''}>Observer</option>
          </select>
        </td>
        <td><span class="status-badge status-${o.status}">${o.status}</span></td>
        <td><button class="btn btn-small" onclick="soth.admin.showOrgForm('${o.id}')">Edit</button>
            <button class="btn btn-small btn-outline" onclick="soth.admin.toggleOrgStatus('${o.id}','${o.status}')">
              ${o.status === 'active' ? 'Deactivate' : 'Activate'}</button></td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  showOrgForm: async function (orgId) {
    const sb = soth.sb();
    let org = { name: '', slug: '', contact_email: '', org_type: 'partner' };
    if (orgId) {
      const { data } = await sb.from('organizations').select('*').eq('id', orgId).single();
      if (data) org = data;
    }

    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal-content">
        <h3>${orgId ? 'Edit' : 'Add'} Organisation</h3>
        <form id="org-form">
          <label>Name *<input type="text" id="org-name" value="${soth.ui.escapeHtml(org.name)}" required></label>
          <label>Slug *<input type="text" id="org-slug" value="${soth.ui.escapeHtml(org.slug)}" required></label>
          <label>Contact Email<input type="email" id="org-email" value="${soth.ui.escapeHtml(org.contact_email)}"></label>
          <label>Org Type
            <select id="org-type">
              <option value="partner"${org.org_type === 'partner' ? ' selected' : ''}>Partner (counted in stats)</option>
              <option value="observer"${org.org_type === 'observer' ? ' selected' : ''}>Observer (not counted in stats)</option>
            </select>
          </label>
          ${orgId ? `<input type="hidden" id="org-id" value="${orgId}">` : ''}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
          </div>
        </form>
      </div>`;
    modal.classList.remove('hidden');

    document.getElementById('org-form').onsubmit = async function (e) {
      e.preventDefault();
      const payload = {
        name: document.getElementById('org-name').value.trim(),
        slug: document.getElementById('org-slug').value.trim(),
        contact_email: document.getElementById('org-email').value.trim(),
        org_type: document.getElementById('org-type').value
      };
      let result;
      if (orgId) {
        result = await soth.auth.updateOrg({ org_id: orgId, ...payload });
      } else {
        result = await soth.auth.createOrg(payload);
      }
      if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
      soth.ui.showToast('Saved!', 'success');
      modal.classList.add('hidden');
      soth.admin.showSection('orgs');
    };
  },

  toggleOrgStatus: async function (orgId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const { error } = await soth.auth.updateOrg({ org_id: orgId, status: newStatus });
    if (error) { soth.ui.showToast(error, 'error'); return; }
    soth.ui.showToast('Status updated', 'success');
    soth.admin.showSection('orgs');
  },

  setOrgType: async function (orgId, orgType) {
    const { error } = await soth.auth.updateOrg({ org_id: orgId, org_type: orgType });
    if (error) { soth.ui.showToast(error, 'error'); return; }
    soth.ui.showToast('Org type set to ' + orgType, 'success');
  },

  renderThemes: async function (container) {
    const sb = soth.sb();
    const { data: themes } = await sb.from('themes').select('*').order('sort_order');
    const { data: params } = await sb.from('sub_parameters').select('*').order('name');

    const paramsByTheme = {};
    (params || []).forEach(p => {
      if (!paramsByTheme[p.theme_id]) paramsByTheme[p.theme_id] = [];
      paramsByTheme[p.theme_id].push(p);
    });

    let html = '<div class="admin-section"><h2>Themes & Parameters</h2>';
    html += '<div class="admin-toolbar"><button class="btn btn-primary" onclick="soth.admin.showThemeForm()">+ Add Theme</button>';
    html += '<button class="btn btn-secondary" onclick="soth.admin.showParamForm()">+ Add Sub-Parameter</button></div>';

    (themes || []).forEach(t => {
      const tParams = paramsByTheme[t.id] || [];
      html += `<div class="theme-admin-card">
        <div class="theme-admin-header" style="border-left:4px solid ${soth.map.themeColor(t.name)}">
          <span class="theme-name">${soth.ui.escapeHtml(t.name)}</span>
          <span class="theme-count">${tParams.length} params</span>
          <span class="theme-actions">
            <button class="btn btn-small" onclick="soth.admin.showThemeForm('${t.id}')">Edit</button>
            <button class="btn btn-small btn-outline" onclick="soth.admin.showParamForm('${t.id}')">+ Param</button>
          </span>
        </div>
        ${tParams.length ? `<div class="theme-params-list">
          <table class="param-table"><tbody>
            ${tParams.map((p, i) => `<tr>
              <td>${i + 1}</td>
              <td><strong>${soth.ui.escapeHtml(p.name)}</strong>
                ${p.description ? `<br><small>${soth.ui.escapeHtml(p.description)}</small>` : ''}
              </td>
              <td>${soth.ui.dataTypeLabel(p.data_type)}</td>
              <td>v${p.version}</td>
              <td>
                <button class="btn btn-small" onclick="soth.admin.showParamForm('${t.id}','${p.id}')">Edit</button>
                <button class="btn btn-small btn-outline" onclick="soth.admin.toggleParamStatus('${p.id}')">
                  ${p.status === 'active' ? 'Deact' : 'Act'}</button>
              </td>
            </tr>`).join('')}
          </tbody></table>
        </div>` : '<p class="empty-state">No parameters.</p>'}
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  },

  showThemeForm: async function (themeId) {
    const sb = soth.sb();
    let theme = { name: '', description: '', sort_order: 0 };
    if (themeId) {
      const { data } = await sb.from('themes').select('*').eq('id', themeId).single();
      if (data) theme = data;
    }
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal-content">
        <h3>${themeId ? 'Edit' : 'Add'} Theme</h3>
        <form id="theme-form">
          <label>Name *<input type="text" id="t-name" value="${soth.ui.escapeHtml(theme.name)}" required></label>
          <label>Description<textarea id="t-desc" rows="2">${soth.ui.escapeHtml(theme.description || '')}</textarea></label>
          <label>Sort Order<input type="number" id="t-order" value="${theme.sort_order ?? 0}"></label>
          ${themeId ? `<input type="hidden" id="t-id" value="${themeId}">` : ''}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
          </div>
        </form>
      </div>`;
    modal.classList.remove('hidden');
    document.getElementById('theme-form').onsubmit = async function (e) {
      e.preventDefault();
      const payload = {
        name: document.getElementById('t-name').value.trim(),
        description: document.getElementById('t-desc').value.trim(),
        sort_order: parseInt(document.getElementById('t-order').value) || 0
      };
      let result;
      if (themeId) result = await soth.auth.updateTheme({ theme_id: themeId, ...payload });
      else result = await soth.auth.createTheme(payload);
      if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
      soth.ui.showToast('Saved!', 'success');
      modal.classList.add('hidden');
      soth.admin.showSection('themes');
    };
  },

  showParamForm: async function (themeId, paramId) {
    const sb = soth.sb();
    const { data: themes } = await sb.from('themes').select('id, name').eq('status', 'active');
    let param = { name: '', description: '', data_type: 'both', possible_values: [] };
    if (paramId) {
      const { data } = await sb.from('sub_parameters').select('*').eq('id', paramId).single();
      if (data) param = data;
    }

    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    const themeOptions = (themes || []).map(t =>
      `<option value="${t.id}" ${(themeId || param.theme_id) === t.id ? 'selected' : ''}>${soth.ui.escapeHtml(t.name)}</option>`).join('');
    const qualChecked = !paramId || param.data_type === 'qualitative' || param.data_type === 'both' || !param.data_type ? 'checked' : '';
    const quantChecked = !paramId || ['quantitative_scale', 'quantitative_numeric', 'both'].includes(param.data_type) ? 'checked' : '';

    modal.innerHTML = `
      <div class="modal-content">
        <h3>${paramId ? 'Edit' : 'Add'} Sub-Parameter</h3>
        <form id="param-form">
          <label>Theme *<select id="p-theme" required>${themeOptions}</select></label>
          <label>Name *<input type="text" id="p-name" value="${soth.ui.escapeHtml(param.name)}" required></label>
          <label>Description<textarea id="p-desc" rows="2">${soth.ui.escapeHtml(param.description || '')}</textarea></label>
          <div class="field-group">
            <label>Capture Types (score is 0-100) *</label>
            <div style="display:flex;gap:16px;padding:4px 0;">
              <label style="display:flex;align-items:center;gap:6px;font-weight:500;margin:0;">
                <input type="checkbox" id="p-qual" ${qualChecked}>
                Qualitative (Yes/No/Partial)
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-weight:500;margin:0;">
                <input type="checkbox" id="p-quant" ${quantChecked}>
                Quantitative (0-100 scale)
              </label>
            </div>
          </div>
          ${paramId ? `<input type="hidden" id="p-id" value="${paramId}">` : ''}
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
          </div>
        </form>
      </div>`;
    modal.classList.remove('hidden');
    document.getElementById('param-form').onsubmit = async function (e) {
      e.preventDefault();
      const qual = document.getElementById('p-qual').checked;
      const quant = document.getElementById('p-quant').checked;
      if (!qual && !quant) { soth.ui.showToast('Select at least one capture type', 'error'); return; }
      const dataType = qual && quant ? 'both' : qual ? 'qualitative' : 'quantitative_scale';
      const payload = {
        theme_id: document.getElementById('p-theme').value,
        name: document.getElementById('p-name').value.trim(),
        description: document.getElementById('p-desc').value.trim(),
        data_type: dataType,
        scale: null
      };
      let result;
      if (paramId) result = await soth.auth.updateSubParam({ sub_param_id: paramId, ...payload });
      else result = await soth.auth.createSubParam(payload);
      if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
      soth.ui.showToast('Saved!', 'success');
      modal.classList.add('hidden');
      soth.admin.showSection('themes');
    };
  },

  toggleParamStatus: async function (paramId) {
    const sb = soth.sb();
    const { data: param } = await sb.from('sub_parameters').select('status').eq('id', paramId).single();
    const newStatus = param?.status === 'active' ? 'inactive' : 'active';
    const result = await soth.auth.updateSubParam({ sub_param_id: paramId, status: newStatus });
    if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
    soth.ui.showToast('Status updated', 'success');
    soth.admin.showSection('themes');
  },

  renderProposals: async function (container) {
    const sb = soth.sb();
    const { data: proposals } = await sb.from('proposed_sub_parameters').select('*')
      .eq('status', 'pending').order('created_at', { ascending: false });

    let html = '<div class="admin-section"><h2>Proposals <span class="badge">' + (proposals?.length || 0) + '</span></h2>';
    if (!proposals?.length) {
      html += '<p class="empty-state">No pending proposals.</p>';
    } else {
      html += '<table class="param-table"><thead><tr><th>Name</th><th>Theme</th><th>Data Type</th><th>Proposed By</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
      proposals.forEach(p => {
        html += `<tr>
          <td><strong>${soth.ui.escapeHtml(p.name)}</strong>
            ${p.description ? `<br><small>${soth.ui.escapeHtml(p.description)}</small>` : ''}
          </td>
          <td>${soth.ui.escapeHtml(p.suggested_theme_name || '')}</td>
          <td>${soth.ui.dataTypeLabel(p.data_type)}</td>
          <td>${soth.ui.escapeHtml(p.proposed_by_org_id || '')}</td>
          <td>${soth.ui.formatDate(p.created_at)}</td>
          <td>
            <button class="btn btn-small btn-primary" onclick="soth.admin.approveProposal('${p.id}','${soth.ui.escapeHtml(p.theme_id) || ''}')">Approve</button>
            <button class="btn btn-small btn-outline" onclick="soth.admin.rejectProposal('${p.id}')">Reject</button>
          </td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    container.innerHTML = html;
  },

  approveProposal: async function (proposalId, themeId) {
    const sb = soth.sb();
    const { data: prop, error: fetchErr } = await sb.from('proposed_sub_parameters').select('*').eq('id', proposalId).single();
    if (fetchErr || !prop) { soth.ui.showToast('Error fetching proposal', 'error'); return; }

    // If no theme selected, prompt
    if (!prop.theme_id && !themeId) {
      const { data: themes } = await sb.from('themes').select('id, name').eq('status', 'active');
      const themeOpts = themes.map(t => `<option value="${t.id}">${soth.ui.escapeHtml(t.name)}</option>`).join('');
      const modal = document.getElementById('admin-modal');
      modal.innerHTML = `
        <div class="modal-content">
          <h3>Approve: ${soth.ui.escapeHtml(prop.name)}</h3>
          <p>Assign to a theme:</p>
          <select id="approve-theme">${themeOpts}</select>
          <div class="form-actions" style="margin-top:12px;">
            <button class="btn btn-primary" onclick="soth.admin.approveProposal('${proposalId}', document.getElementById('approve-theme').value)">Confirm</button>
            <button class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
          </div>
        </div>`;
      modal.classList.remove('hidden');
      return;
    }

    // Route through Edge Function (service key bypasses RLS)
    const result = await soth.auth._adminAction('approveProposal', {
      proposal_id: proposalId,
      theme_id: themeId || prop.theme_id
    });
    if (result.error) { soth.ui.showToast('Error: ' + result.error, 'error'); return; }

    soth.audit.log('proposal_approved', 'proposed_sub_parameters', proposalId);

    document.getElementById('admin-modal').classList.add('hidden');
    soth.ui.showToast('Proposal approved and added to superset!', 'success');
    soth.admin.showSection('proposals');
  },

  rejectProposal: async function (proposalId) {
    const reason = prompt('Rejection reason (optional):');
    const result = await soth.auth._adminAction('rejectProposal', { proposal_id: proposalId, reason: reason || '' });
    if (result.error) { soth.ui.showToast('Error: ' + result.error, 'error'); return; }
    soth.ui.showToast('Proposal rejected', 'info');
    soth.admin.showSection('proposals');
  },

  renderVillages: async function (container, page) {
    const sb = soth.sb();
    page = page || 0;
    soth.admin._villagesPage = page;
    const PER_PAGE = 100;
    const offset = page * PER_PAGE;

    const { data: villages } = await sb.from('villages').select('*')
      .order('state', { ascending: true }).order('district', { ascending: true }).order('name', { ascending: true })
      .range(offset, offset + PER_PAGE - 1);

    const { count } = await sb.from('villages').select('*', { count: 'exact', head: true });
    const totalPages = Math.max(1, Math.ceil((count || 0) / PER_PAGE));

    let html = '<div class="admin-section"><h2>Villages</h2>';
    html += `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="text" id="village-search-input" placeholder="Search by name, district, or state..." style="flex:1;min-width:200px;"
        oninput="soth.admin.filterVillages(this.value)">
      <button class="btn btn-primary" onclick="soth.admin.showVillageForm()">+ Add Village</button>
    </div>`;
    html += `<p style="font-size:12px;color:var(--gray-500);">Showing ${offset + 1}-${Math.min(offset + PER_PAGE, count || 0)} of ${count || 0} villages</p>`;
    html += '<div id="village-table-container" style="max-height:500px;overflow-y:auto;">';
    html += '<table class="param-table" id="village-table"><thead><tr><th>Name</th><th>Block/GP</th><th>District</th><th>State</th><th>Coordinates</th><th>Geocode</th><th>Actions</th></tr></thead><tbody>';
    (villages || []).forEach(v => {
      html += `<tr>
        <td><strong>${soth.ui.escapeHtml(v.name)}</strong></td>
        <td>${soth.ui.escapeHtml(v.block || v.gram_panchayat || '')}</td>
        <td>${soth.ui.escapeHtml(v.district)}</td>
        <td>${soth.ui.escapeHtml(v.state)}</td>
        <td>${v.lat ? `${v.lat}, ${v.lng}` : '-'}</td>
        <td><span class="status-badge status-${v.geocode_status || 'pending'}">${v.geocode_status || 'pending'}</span></td>
        <td>
          <button class="btn btn-small" onclick="soth.admin.showVillageForm('${v.id}')">Edit</button>
          <button class="btn btn-small btn-outline" onclick="soth.admin.geocodeSingle('${v.id}')">Geocode</button>
          <button class="btn btn-small btn-outline" style="color:var(--danger);border-color:var(--danger);" onclick="soth.admin.deleteVillage('${v.id}','${soth.ui.escapeAttr(v.name)}')">Delete</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';

    // Pagination with editable page number
    html += '<div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap;">';
    if (page > 0) html += `<button class="btn btn-small" onclick="soth.admin.renderVillages(document.getElementById('admin-section-content'), ${page - 1})">Previous</button>`;
    html += `<span style="font-size:13px;color:var(--gray-500);">Page</span>`;
    html += `<input type="number" id="village-page-input" min="1" max="${totalPages}" value="${page + 1}"
      style="width:60px;text-align:center;padding:4px 6px;"
      onkeydown="if(event.key==='Enter')soth.admin.gotoVillagePage()"
      onchange="soth.admin.gotoVillagePage()">`;
    html += `<span style="font-size:13px;color:var(--gray-500);">of ${totalPages}</span>`;
    if (page < totalPages - 1) html += `<button class="btn btn-small" onclick="soth.admin.renderVillages(document.getElementById('admin-section-content'), ${page + 1})">Next</button>`;
    html += '</div></div>';
    container.innerHTML = html;
  },

  gotoVillagePage: function () {
    const input = document.getElementById('village-page-input');
    if (!input) return;
    let p = parseInt(input.value, 10);
    if (isNaN(p) || p < 1) p = 1;
    const max = parseInt(input.max || '1', 10);
    if (p > max) p = max;
    if (p - 1 !== soth.admin._villagesPage) {
      soth.admin.renderVillages(document.getElementById('admin-section-content'), p - 1);
    } else {
      input.value = soth.admin._villagesPage + 1;
    }
  },

  _allVillages: null,
  _villageSearchTimer: null,
  _villagesPage: 0,

  filterVillages: async function (query) {
    const q = query.toLowerCase().trim();
    const container = document.getElementById('village-table-container');
    if (!container) return;
    if (!q) {
      // Reset to paginated view by re-rendering the section
      const activeBtn = document.querySelector('.admin-nav-btn.active');
      const section = activeBtn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || 'villages';
      soth.admin.showSection(section);
      return;
    }
    // Debounce to avoid hammering Supabase on each keystroke
    clearTimeout(soth.admin._villageSearchTimer);
    soth.admin._villageSearchTimer = setTimeout(async () => {
      const sb = soth.sb();
      // Use PostgREST case-insensitive OR filter through ilike
      const { data: matches } = await sb.from('villages')
        .select('*')
        .or(`name.ilike.%${encodeURIComponent(q)}%,district.ilike.%${encodeURIComponent(q)}%,state.ilike.%${encodeURIComponent(q)}%`)
        .limit(200);
      const filtered = matches || [];
      let html = '<table class="param-table"><thead><tr><th>Name</th><th>Block/GP</th><th>District</th><th>State</th><th>Coordinates</th><th>Geocode</th><th>Actions</th></tr></thead><tbody>';
      filtered.slice(0, 200).forEach(v => {
        html += `<tr>
          <td><strong>${soth.ui.escapeHtml(v.name)}</strong></td>
          <td>${soth.ui.escapeHtml(v.block || v.gram_panchayat || '')}</td>
          <td>${soth.ui.escapeHtml(v.district)}</td>
          <td>${soth.ui.escapeHtml(v.state)}</td>
          <td>${v.lat ? `${v.lat}, ${v.lng}` : '-'}</td>
          <td><span class="status-badge status-${v.geocode_status || 'pending'}">${v.geocode_status || 'pending'}</span></td>
          <td>
            <button class="btn btn-small" onclick="soth.admin.showVillageForm('${v.id}')">Edit</button>
            <button class="btn btn-small btn-outline" onclick="soth.admin.geocodeSingle('${v.id}')">Geocode</button>
            <button class="btn btn-small btn-outline" style="color:var(--danger);border-color:var(--danger);" onclick="soth.admin.deleteVillage('${v.id}','${soth.ui.escapeAttr(v.name)}')">Delete</button>
          </td>
        </tr>`;
      });
      html += '</tbody></table>';
      if (!filtered.length) {
        html = '<p class="empty-state">No villages found for "' + soth.ui.escapeHtml(query) + '".</p>';
      } else if (filtered.length === 200) {
        html += `<p style="font-size:12px;color:var(--gray-500);">Showing first 200 matches. Refine your search for more.</p>`;
      }
      container.innerHTML = html;
    }, 250);
  },

  showVillageForm: async function (villageId) {
    const sb = soth.sb();
    let v = { name: '', gram_panchayat: '', block: '', district: '', state: '' };
    if (villageId) {
      const { data } = await sb.from('villages').select('*').eq('id', villageId).single();
      if (data) v = data;
    }
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal-content">
        <h3>${villageId ? 'Edit' : 'Add'} Village</h3>
        <form id="village-form">
          <label>Name *<input type="text" id="v-name" value="${soth.ui.escapeHtml(v.name)}" required></label>
          <label>Gram Panchayat<input type="text" id="v-gp" value="${soth.ui.escapeHtml(v.gram_panchayat || '')}"></label>
          <label>Block<input type="text" id="v-block" value="${soth.ui.escapeHtml(v.block || '')}"></label>
          <label>District *<input type="text" id="v-district" value="${soth.ui.escapeHtml(v.district)}" required></label>
          <label>State *<input type="text" id="v-state" value="${soth.ui.escapeHtml(v.state)}" required></label>
          <div style="display:flex;gap:8px;">
            <label style="flex:1;">Latitude<input type="number" id="v-lat" step="any" value="${v.lat != null ? v.lat : ''}" placeholder="e.g. 14.3538"></label>
            <label style="flex:1;">Longitude<input type="number" id="v-lng" step="any" value="${v.lng != null ? v.lng : ''}" placeholder="e.g. 77.3083"></label>
          </div>
          ${villageId ? `<input type="hidden" id="v-id" value="${villageId}">` : ''}
          <div class="form-actions"><button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
          </div>
        </form>
      </div>`;
    modal.classList.remove('hidden');
    document.getElementById('village-form').onsubmit = async function (e) {
      e.preventDefault();
      const latVal = document.getElementById('v-lat')?.value;
      const lngVal = document.getElementById('v-lng')?.value;
      const payload = {
        name: document.getElementById('v-name').value.trim(),
        gram_panchayat: document.getElementById('v-gp').value.trim(),
        block: document.getElementById('v-block').value.trim(),
        district: document.getElementById('v-district').value.trim(),
        state: document.getElementById('v-state').value.trim()
      };
      const lat = parseFloat(latVal);
      const lng = parseFloat(lngVal);
      if (!isNaN(lat) && !isNaN(lng)) {
        payload.lat = lat;
        payload.lng = lng;
        payload.geocode_status = 'geocoded';
        payload.geocode_source = 'manual';
        payload.geocoded_at = new Date().toISOString();
      }
      let result;
      if (villageId) result = await soth.auth.updateVillage({ village_id: villageId, ...payload });
      else result = await soth.auth._adminAction('createVillage', payload);
      if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
      soth.ui.showToast('Saved!', 'success');
      modal.classList.add('hidden');
      soth.admin.showSection('villages');
    };
  },

  geocodeSingle: async function (villageId) {
    const sb = soth.sb();
    const { data: v } = await sb.from('villages').select('*').eq('id', villageId).single();
    if (!v) return;

    // Determine current section so we stay on it after geocoding
    const activeBtn = document.querySelector('.admin-nav-btn.active');
    const currentSection = activeBtn ? activeBtn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || 'villages' : 'villages';

    // Show immediate feedback
    soth.ui.showToast('Searching LGD database for ' + v.name + '...', 'info');
    const btns = document.querySelectorAll(`[onclick*="geocodeSingle('${villageId}')"]`);
    btns.forEach(b => { b.textContent = 'Searching...'; b.disabled = true; });

    // Step 1: Try BharatAtlas LGD with name + district matching
    let result = await soth.map.geocodeViaBharatAtlas(v);
    if (result?.lat) {
      await soth.map._applyGeocode(v, result);
      soth.ui.showToast('Geocoded via LGD!', 'success');
      await new Promise(r => setTimeout(r, 500));
      soth.admin.showSection(currentSection);
      return;
    }

    // Step 2: Not found - search LGD for similar names to let user pick
    btns.forEach(b => { b.textContent = 'Geocode'; b.disabled = false; });
    soth.admin._showGeocodePicker(v, villageId, currentSection);
  },

  // Show a picker modal with LGD search results when exact match fails
  _showGeocodePicker: async function (v, villageId, returnSection) {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;

    // Search BharatAtlas with cleaned name (broad search, any district)
    let results = [];
    const searchName = v.name.replace(/\([^)]*\)/g, '').trim().split(/[,\s]+/).filter(w => w.length > 2)[0] || v.name.trim();
    try {
      const r = await fetch(
        `https://bharatlas.com/api/v1/layers/lgd_villages/query?where=vilname11=${encodeURIComponent(searchName)}&select=vilname11,dtname,stname,sdtname,block_name,gp_name,xmin,ymin,xmax,ymax,vil_lgd&limit=30`
      );
      if (r.ok) {
        const data = await r.json();
        results = data?.data?.rows || [];
      }
    } catch (e) {}

    let html = `<div class="modal-content" style="max-width:650px;">
      <h3>Geocode: ${v.name}</h3>
      <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">
        Village not found in LGD database. Select a matching entry below, or use the district center.
      </p>`;

    if (results.length) {
      html += `<div style="max-height:350px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:4px;margin-bottom:12px;">
        <table class="param-table"><thead><tr><th>Village</th><th>Block</th><th>District</th><th>State</th><th>Action</th></tr></thead><tbody>`;
      const seen = new Set();
      results.forEach(row => {
        if (!row.xmin || seen.has(row.vilname11 + row.dtname)) return;
        seen.add(row.vilname11 + row.dtname);
        const lat = ((parseFloat(row.ymin) || 0) + (parseFloat(row.ymax) || 0)) / 2;
        const lng = ((parseFloat(row.xmin) || 0) + (parseFloat(row.xmax) || 0)) / 2;
        const block = row.block_name || row.sdtname || '-';
        html += `<tr>
          <td><strong>${soth.ui.escapeHtml(row.vilname11)}</strong></td>
          <td>${soth.ui.escapeHtml(block)}</td>
          <td>${soth.ui.escapeHtml(row.dtname)}</td>
          <td>${soth.ui.escapeHtml(row.stname)}</td>
          <td><button class="btn btn-small btn-primary" onclick="soth.admin._pickGeocode('${villageId}',${lat},${lng},'${soth.ui.escapeHtml(row.vilname11)}')">Use</button></td>
        </tr>`;
      });
      html += '</tbody></table></div>';
    } else {
      html += `<p class="empty-state">No similar villages found in LGD database.</p>`;
    }

    // District and state fallback options
    html += `<div style="border-top:1px solid var(--gray-200);padding-top:12px;margin-top:4px;">
      <p style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--gray-600);">Or use approximate coordinates:</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline" onclick="soth.admin._pickDistrictGeocode('${villageId}','${soth.ui.escapeHtml(v.district)}','${soth.ui.escapeHtml(v.state)}')">District Center (${soth.ui.escapeHtml(v.district)})</button>
      </div>
    </div>`;

    html += `<div class="form-actions" style="margin-top:12px;">
      <button class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
    </div></div>`;

    modal.innerHTML = html;
    modal.classList.remove('hidden');
  },

  // User picked a specific village from the LGD results
  _pickGeocode: async function (villageId, lat, lng, label) {
    await soth.map._applyGeocode({ id: villageId }, { lat, lng, label: label + ' (LGD selection)', source: 'bharatlas' });
    document.getElementById('admin-modal').classList.add('hidden');
    soth.ui.showToast('Geocoded!', 'success');
    await new Promise(r => setTimeout(r, 500));
    const activeBtn = document.querySelector('.admin-nav-btn.active');
    const section = activeBtn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || 'villages';
    soth.admin.showSection(section);
  },

  // User chose district center as fallback
  _pickDistrictGeocode: async function (villageId, district, state) {
    const q = encodeURIComponent(district + ', ' + state + ', India');
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
        headers: { 'User-Agent': 'SoTH/1.0' }
      });
      if (r.ok) {
        const data = await r.json();
        if (data?.length) {
          const loc = data[0];
          await soth.map._applyGeocode({ id: villageId }, { lat: parseFloat(loc.lat), lng: parseFloat(loc.lon), label: district + ' district, ' + state, source: 'district-fallback' });
          document.getElementById('admin-modal').classList.add('hidden');
          soth.ui.showToast('Geocoded to district center!', 'success');
          await new Promise(r => setTimeout(r, 500));
          const activeBtn = document.querySelector('.admin-nav-btn.active');
          const section = activeBtn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || 'villages';
          soth.admin.showSection(section);
          return;
        }
      }
    } catch (e) {}
    soth.ui.showToast('Could not geocode district', 'error');
    const fbSection = document.querySelector('.admin-nav-btn.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || 'villages';
    soth.admin.showSection(fbSection);
  },

  renderCaptures: async function (container) {
    const sb = soth.sb();
    const { data: caps } = await sb.from('latest_captures').select('*')
      .order('captured_at', { ascending: false }).limit(200);

    let html = '<div class="admin-section"><h2>All Captures (latest 200)</h2>';
    html += '<table class="param-table"><thead><tr><th>Org</th><th>Village</th><th>Parameter</th><th>Value</th><th>Journey</th><th>Date</th></tr></thead><tbody>';
    (caps || []).forEach(c => {
      let val = c.value_text || '';
      if (c.value_scale != null) val = `Scale: ${c.value_scale}`;
      if (c.value_numeric != null) val = `Number: ${c.value_numeric}`;
      html += `<tr>
        <td>${c.org_id?.substring(0, 8) || '-'}</td>
        <td>${c.village_id?.substring(0, 8) || '-'}</td>
        <td>${c.sub_parameter_id?.substring(0, 8) || '-'}</td>
        <td>${soth.ui.escapeHtml(String(val).substring(0, 50))}</td>
        <td><span class="journey-badge stage-${c.journey_stage}">${c.journey_stage}</span></td>
        <td>${soth.ui.formatDate(c.captured_at)}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  renderAnalytics: async function (container) {
    const orgs = await soth.data.organizations();
    let html = '<div class="admin-section"><h2>Partner Maturity Analytics</h2>';
    html += '<table class="param-table"><thead><tr><th>Partner</th><th>Overall Maturity</th></tr></thead><tbody>';

    for (const org of orgs) {
      const maturity = await soth.maturity.compute(org.id);
      const color = soth.map.maturityColor(maturity.overall);
      html += `<tr><td><strong>${soth.ui.escapeHtml(org.name)}</strong></td>
        <td style="color:${color};font-weight:bold;font-size:1.1em;">${maturity.overall}%</td></tr>`;
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  renderUsers: async function (container) {
    const users = await soth.auth.listUsers();
    const sb = soth.sb();
    const { data: orgs } = await sb.from('organizations').select('id, name').eq('status', 'active');

    let html = '<div class="admin-section"><h2>Users</h2>';
    html += '<p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Users create their own accounts via the Login page. Admin can approve, assign orgs, roles, and reset passwords.</p>';
    html += '<table class="param-table"><thead><tr><th>Name</th><th>Email</th><th>Org</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    if (!users || !users.length) {
      html += '<tr><td colspan="6" class="empty-state">No users registered yet.</td></tr>';
    } else {
      (users || []).forEach(u => {
        const org = orgs?.find(o => o.id === u.org_id);
        html += `<tr>
          <td>${soth.ui.escapeHtml(u.full_name || '')}</td>
          <td>${soth.ui.escapeHtml(u.email)}</td>
          <td>${org ? soth.ui.escapeHtml(org.name) : '-'}</td>
          <td><span class="status-badge">${u.role}</span></td>
          <td><span class="status-badge status-${u.status}">${u.status}</span></td>
          <td nowrap>
            <button class="btn btn-small" onclick="soth.admin.changeUserRole('${u.id}')">Role</button>
            <button class="btn btn-small btn-outline" onclick="soth.admin.changeUserOrg('${u.id}')">Org</button>
            ${u.status === 'pending' ? `<button class="btn btn-small btn-outline" onclick="soth.admin.approveUser('${u.id}')">Approve</button>` : ''}
            <button class="btn btn-small btn-outline" onclick="soth.admin.resetUserPassword('${u.id}','${soth.ui.escapeAttr(u.email)}')">Reset PW</button>
            <button class="btn btn-small btn-outline" style="color:var(--danger);border-color:var(--danger);" onclick="soth.admin.deleteUser('${u.id}','${soth.ui.escapeAttr(u.email)}')">Delete</button>
          </td>
        </tr>`;
      });
    }
    html += '</tbody></table>';
    html += '<p style="font-size:12px;color:var(--gray-500);margin-top:8px;">Users sign up with status <strong>pending</strong>. Admin must approve and assign org for data access.</p>';
    html += '</div>';
    container.innerHTML = html;
  },

  changeUserRole: async function (userId) {
    const sb = soth.sb();
    const { data: user } = await sb.from('local_users').select('role').eq('id', userId).single();
    const modal = document.getElementById('admin-modal');
    const current = user?.role || 'partner';
    const roles = ['observer', 'partner', 'partner_admin', 'soth_admin'];
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Change User Role</h3>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Current role: <strong>${current}</strong></p>
        <select id="new-role-select">
          ${roles.map(r => `<option value="${r}" ${r === current ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="soth.admin.doChangeUserSetting('${userId}','role')">Save</button>
          <button class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
        </div>
      </div>`;
    modal.classList.remove('hidden');
  },

  changeUserOrg: async function (userId) {
    const sb = soth.sb();
    const { data: orgs } = await sb.from('organizations').select('id, name').eq('status', 'active');
    const modal = document.getElementById('admin-modal');
    const opts = orgs.map(o => `<option value="${o.id}">${soth.ui.escapeHtml(o.name)}</option>`).join('');
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Assign Organisation</h3>
        <select id="assign-org-select">
          <option value="">-- None --</option>
          ${opts}
        </select>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="soth.admin.doChangeUserSetting('${userId}','org')">Assign</button>
          <button class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
        </div>
      </div>`;
    modal.classList.remove('hidden');
  },

  doChangeUserSetting: async function (userId, setting) {
    let payload = {};
    if (setting === 'role') {
      const newRole = document.getElementById('new-role-select')?.value;
      if (!newRole || !['observer', 'partner', 'partner_admin', 'soth_admin'].includes(newRole)) return;
      payload = { user_id: userId, role: newRole };
    } else if (setting === 'org') {
      const orgId = document.getElementById('assign-org-select')?.value || null;
      payload = { user_id: userId, org_id: orgId };
    }
    const result = await soth.auth.updateProfile(payload);
    if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
    soth.ui.showToast('Saved', 'success');
    document.getElementById('admin-modal').classList.add('hidden');
    soth.admin.showSection('users');
  },

  approveUser: async function (userId) {
    const result = await soth.auth.updateProfile({ user_id: userId, role: 'observer', status: 'active' });
    if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
    soth.ui.showToast('User approved', 'success');
    soth.admin.showSection('users');
  },

  resetUserPassword: async function (userId, email) {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Reset Password for ${soth.ui.escapeHtml(email)}</h3>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Enter a new password for this user. They will use this to login next time.</p>
        <label>New Password<input type="password" id="reset-pw-input" placeholder="6+ characters" minlength="6"></label>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="soth.admin.doResetPassword('${userId}')">Reset Password</button>
          <button class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
        </div>
      </div>`;
    modal.classList.remove('hidden');
  },

  doResetPassword: async function (userId) {
    const newPw = document.getElementById('reset-pw-input')?.value;
    if (!newPw || newPw.length < 6) { soth.ui.showToast('Password must be 6+ characters', 'error'); return; }
    const result = await soth.auth.adminResetPassword(userId, newPw);
    if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
    soth.ui.showToast('Password reset successfully', 'success');
    document.getElementById('admin-modal').classList.add('hidden');
    soth.admin.showSection('users');
  },

  deleteUser: async function (userId, email) {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal-content" style="max-width:450px;">
        <h3 style="color:var(--danger);">Delete User</h3>
        <p style="font-size:13px;margin:12px 0;">
          Are you sure you want to delete <strong>${soth.ui.escapeHtml(email)}</strong>?
        </p>
        <p style="font-size:12px;color:var(--gray-500);margin-bottom:16px;">
          This removes the user's login access. Any data (captures, proposals, etc.)
          created by this user is NOT affected.
        </p>
        <div class="form-actions">
          <button class="btn btn-primary" style="background:var(--danger);border-color:var(--danger);" onclick="soth.admin.doDeleteUser('${userId}')">Delete User</button>
          <button class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
        </div>
      </div>`;
    modal.classList.remove('hidden');
  },

  doDeleteUser: async function (userId) {
    const result = await soth.auth.deleteUser(userId);
    if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
    soth.ui.showToast('User deleted', 'success');
    document.getElementById('admin-modal').classList.add('hidden');
    soth.admin.showSection('users');
  },

  renderGeocoding: async function (container) {
    const sb = soth.sb();
    const { data: pending } = await sb.from('villages').select('*')
      .in('geocode_status', ['pending', 'unmatched', 'failed'])
      .limit(500);

    let html = '<div class="admin-section"><h2>Geocoding Queue (' + (pending?.length || 0) + ' remaining)</h2>';
    html += `<button class="btn btn-primary" onclick="soth.admin.batchGeocode()">Batch Geocode All</button>`;
    html += `<p style="font-size:12px;color:var(--gray-500);margin:8px 0;">Geocoding: BharatAtlas LGD (village-level) → district-level fallback → manual entry in Edit form.</p>`;
    if (!pending?.length) {
      html += '<p class="empty-state">All villages geocoded!</p>';
    } else {
      html += '<table class="param-table"><thead><tr><th>Village</th><th>District</th><th>State</th><th>Status</th><th>Geocode</th></tr></thead><tbody>';
      pending.forEach(v => {
        html += `<tr>
          <td><strong>${soth.ui.escapeHtml(v.name)}</strong></td>
          <td>${soth.ui.escapeHtml(v.district)}</td>
          <td>${soth.ui.escapeHtml(v.state)}</td>
          <td><span class="status-badge status-${v.geocode_status}">${v.geocode_status}</span></td>
          <td>
            <button class="btn btn-small" onclick="soth.admin.geocodeSingle('${v.id}')">Geocode</button>
            <button class="btn btn-small btn-outline" style="color:var(--danger);border-color:var(--danger);" onclick="soth.admin.deleteVillage('${v.id}','${soth.ui.escapeAttr(v.name)}')">Delete</button>
          </td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    container.innerHTML = html;
  },

  batchGeocode: async function () {
    const btn = document.querySelector('.btn-primary');
    if (btn) { btn.textContent = 'Geocoding...'; btn.disabled = true; }

    const sb = soth.sb();
    const { data: pending } = await sb.from('villages').select('id, name, block, district, state')
      .in('geocode_status', ['pending', 'unmatched', 'failed']).limit(200);

    let count = 0;
    for (const v of (pending || [])) {
      let result = await soth.map.geocodeViaBharatAtlas(v);
      if (!result?.lat) result = await soth.map.geocodeViaGramEEE(v);

      if (result?.lat) {
        const res = await soth.auth.updateVillage({
          village_id: v.id,
          lat: result.lat, lng: result.lng,
          geocode_source: result.source || 'unknown',
          geocode_label: result.label || '',
          geocoded_at: new Date().toISOString(),
          geocode_status: 'geocoded'
        });
        if (!res.error) count++;
      } else {
        await soth.auth.updateVillage({ village_id: v.id, geocode_status: 'unmatched' });
      }
      // Throttle to avoid rate limits
      await new Promise(r => setTimeout(r, 400));
    }

    if (btn) { btn.textContent = 'Batch Geocode All'; btn.disabled = false; }
    soth.ui.showToast(`Geocoded ${count} / ${pending?.length || 0} villages`, count > 0 ? 'success' : 'info');
    soth.admin.showSection('geocoding');
  },

  renderExports: async function (container) {
    const orgs = await soth.data.organizations();
    const partnerOpts = orgs.map(o => `<option value="${o.id}">${soth.ui.escapeHtml(o.name)}</option>`).join('');

    container.innerHTML = `
      <div class="admin-section">
        <h2>Export Data</h2>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:20px;">
          Download reports in Excel (.xlsx) format. New report types will be added here as they are built.
        </p>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;align-items:start;">

          <div class="card" style="padding:16px;">
            <div style="font-weight:600;font-size:14px;margin-bottom:6px;">Partner-wise Village List</div>
            <p style="font-size:12px;color:var(--gray-500);margin-bottom:12px;">
              All partner organisations with their linked villages (name, district, state, block, GP).
            </p>
            <label style="font-size:12px;">Partner</label>
            <select id="pv-partner" style="margin-bottom:12px;">
              <option value="">All Partners</option>
              ${partnerOpts}
            </select>
            <button class="btn btn-primary" onclick="soth.admin.exportPartnerVillageList()">Export Excel</button>
          </div>

          <div class="card" style="padding:16px;">
            <div style="font-weight:600;font-size:14px;margin-bottom:6px;">Village Parameter Chart</div>
            <p style="font-size:12px;color:var(--gray-500);margin-bottom:12px;">
              Captured parameter values for a chosen village. If multiple partners work in the village, each partner gets its own sheet.
            </p>
            <label style="font-size:12px;">State</label>
            <select id="vp-state" onchange="soth.admin.populateDistricts('vp')" style="margin-bottom:8px;"><option value="">Loading...</option></select>
            <label style="font-size:12px;">District</label>
            <select id="vp-district" onchange="soth.admin.populateVillages('vp')" style="margin-bottom:8px;"><option value="">-- Select State --</option></select>
            <label style="font-size:12px;">Village</label>
            <select id="vp-village" style="margin-bottom:12px;"><option value="">-- Select District --</option></select>
            <button class="btn btn-primary" onclick="soth.admin.exportVillageParameterChart()">Export Excel</button>
          </div>

          <div class="card" style="padding:16px;">
            <div style="font-weight:600;font-size:14px;margin-bottom:6px;">Partner-wise Village Parameter Data</div>
            <p style="font-size:12px;color:var(--gray-500);margin-bottom:12px;">
              Captured parameter values for a partner, optionally filtered by state / district / village.
            </p>
            <label style="font-size:12px;">Partner</label>
            <select id="pd-partner" style="margin-bottom:8px;"><option value="">-- Select Partner --</option>${partnerOpts}</select>
            <label style="font-size:12px;">State</label>
            <select id="pd-state" onchange="soth.admin.populateDistricts('pd')" style="margin-bottom:8px;"><option value="">All States</option></select>
            <label style="font-size:12px;">District</label>
            <select id="pd-district" onchange="soth.admin.populateVillages('pd')" style="margin-bottom:8px;"><option value="">All Districts</option></select>
            <label style="font-size:12px;">Village</label>
            <select id="pd-village" style="margin-bottom:12px;"><option value="">All Villages</option></select>
            <button class="btn btn-primary" onclick="soth.admin.exportPartnerVillageData()">Export Excel</button>
          </div>

        </div>
      </div>`;

    this.populateStates('vp');
    this.populateStates('pd');
  },

  _loadAllVillages: async function () {
    if (soth.admin._allVillagesForExport) return soth.admin._allVillagesForExport;
    const sb = soth.sb();
    const { data } = await sb.from('villages').select('id, name, district, state').limit(10000);
    soth.admin._allVillagesForExport = data || [];
    return soth.admin._allVillagesForExport;
  },

  populateStates: async function (prefix) {
    const villages = await soth.admin._loadAllVillages();
    const states = [...new Set(villages.map(v => v.state).filter(Boolean))].sort();
    const sel = document.getElementById(prefix + '-state');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = prefix === 'pd'
      ? '<option value="">All States</option>'
      : '<option value="">-- Select State --</option>';
    states.forEach(s => {
      sel.innerHTML += `<option value="${soth.ui.escapeHtml(s)}"${s === current ? ' selected' : ''}>${soth.ui.escapeHtml(s)}</option>`;
    });
    this.populateDistricts(prefix);
  },

  populateDistricts: async function (prefix) {
    const villages = await soth.admin._loadAllVillages();
    const state = document.getElementById(prefix + '-state')?.value || '';
    const distSel = document.getElementById(prefix + '-district');
    const vilSel = document.getElementById(prefix + '-village');
    if (!distSel) return;
    const districts = state
      ? [...new Set(villages.filter(v => v.state === state).map(v => v.district).filter(Boolean))].sort()
      : [];
    distSel.innerHTML = prefix === 'pd'
      ? '<option value="">All Districts</option>'
      : '<option value="">-- Select District --</option>';
    districts.forEach(d => {
      distSel.innerHTML += `<option value="${soth.ui.escapeHtml(d)}">${soth.ui.escapeHtml(d)}</option>`;
    });
    if (vilSel) {
      vilSel.innerHTML = prefix === 'pd'
        ? '<option value="">All Villages</option>'
        : '<option value="">-- Select Village --</option>';
    }
  },

  populateVillages: async function (prefix) {
    const villages = await soth.admin._loadAllVillages();
    const state = document.getElementById(prefix + '-state')?.value || '';
    const district = document.getElementById(prefix + '-district')?.value || '';
    const vilSel = document.getElementById(prefix + '-village');
    if (!vilSel) return;
    const list = villages.filter(v =>
      (!state || v.state === state) && (!district || v.district === district)
    ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    vilSel.innerHTML = prefix === 'pd'
      ? '<option value="">All Villages</option>'
      : '<option value="">-- Select Village --</option>';
    list.forEach(v => {
      vilSel.innerHTML += `<option value="${v.id}">${soth.ui.escapeHtml(v.name)}</option>`;
    });
  },

  _sanitizeSheetName: function (name) {
    return String(name || 'Sheet').replace(/[\\[\]*?:/]/g, ' ').trim().slice(0, 31) || 'Sheet';
  },

  _downloadWorkbook: function (sheets, fileName) {
    if (!window.XLSX) { soth.ui.showToast('Excel library not loaded. Refresh the page.', 'error'); return; }
    const wb = XLSX.utils.book_new();
    sheets.forEach(s => {
      const ws = XLSX.utils.json_to_sheet(s.rows);
      XLSX.utils.book_append_sheet(wb, ws, this._sanitizeSheetName(s.name));
    });
    XLSX.writeFile(wb, fileName);
    soth.ui.showToast('Export downloaded', 'success');
  },

  _captureExportRow: function (c, orgName) {
    const sp = c.sub_parameters || {};
    return {
      'Partner': orgName || c.organizations?.name || '',
      'Village': c.villages?.name || '',
      'District': c.villages?.district || '',
      'State': c.villages?.state || '',
      'Theme': sp.themes?.name || '',
      'Sub-Parameter': sp.name || '',
      'Data Type': soth.ui.dataTypeLabel(sp.data_type),
      'Qualitative': c.value_text || '',
      'Score': c.value_scale != null ? c.value_scale : '',
      'Number': c.value_numeric != null ? c.value_numeric : '',
      'Captured At': c.captured_at ? soth.ui.formatDateTime(c.captured_at) : ''
    };
  },

  exportPartnerVillageList: async function () {
    const btn = event?.target;
    if (btn) { btn.textContent = 'Exporting...'; btn.disabled = true; }
    try {
      const orgId = document.getElementById('pv-partner')?.value || '';
      const orgs = await soth.data.organizations();
      const orgsToUse = orgId ? orgs.filter(o => o.id === orgId) : orgs;
      const rows = [];
      for (const org of orgsToUse) {
        const ovs = await soth.data.orgVillages(org.id);
        for (const ov of ovs) {
          const v = ov.villages;
          if (!v) continue;
          rows.push({
            'Partner': org.name,
            'Village': v.name,
            'District': v.district || '',
            'State': v.state || '',
            'Block': v.block || '',
            'Gram Panchayat': v.gram_panchayat || '',
            'Linked Since': ov.start_date || '',
            'Coordinates': v.lat ? `${v.lat}, ${v.lng}` : ''
          });
        }
      }
      this._downloadWorkbook([{ name: 'Partner Villages', rows }], 'partner-village-list.xlsx');
    } catch (e) {
      console.error('Export error:', e);
      soth.ui.showToast('Export failed: ' + (e.message || 'Unknown'), 'error');
    } finally {
      if (btn) { btn.textContent = 'Export Excel'; btn.disabled = false; }
    }
  },

  exportVillageParameterChart: async function () {
    const btn = event?.target;
    if (btn) { btn.textContent = 'Exporting...'; btn.disabled = true; }
    try {
      const villageId = document.getElementById('vp-village')?.value;
      if (!villageId) { soth.ui.showToast('Please select a village', 'error'); return; }
      const caps = await soth.data.allCaptures({ village_id: villageId, limit: 50000 });
      const byOrg = {};
      (caps || []).forEach(c => {
        const orgName = c.organizations?.name || 'Unknown';
        if (!byOrg[orgName]) byOrg[orgName] = [];
        byOrg[orgName].push(this._captureExportRow(c, orgName));
      });
      const sheets = Object.keys(byOrg).map(name => ({ name, rows: byOrg[name] }));
      if (!sheets.length) { soth.ui.showToast('No capture data for this village', 'info'); return; }
      this._downloadWorkbook(sheets, 'village-parameter-chart.xlsx');
    } catch (e) {
      console.error('Export error:', e);
      soth.ui.showToast('Export failed: ' + (e.message || 'Unknown'), 'error');
    } finally {
      if (btn) { btn.textContent = 'Export Excel'; btn.disabled = false; }
    }
  },

  exportPartnerVillageData: async function () {
    const btn = event?.target;
    if (btn) { btn.textContent = 'Exporting...'; btn.disabled = true; }
    try {
      const orgId = document.getElementById('pd-partner')?.value;
      if (!orgId) { soth.ui.showToast('Please select a partner', 'error'); return; }
      const state = document.getElementById('pd-state')?.value || '';
      const district = document.getElementById('pd-district')?.value || '';
      const villageId = document.getElementById('pd-village')?.value || '';

      const caps = await soth.data.allCaptures({ org_id: orgId, limit: 50000 });
      const filtered = (caps || []).filter(c => {
        if (villageId && c.village_id !== villageId) return false;
        if (state && c.villages?.state !== state) return false;
        if (district && c.villages?.district !== district) return false;
        return true;
      });
      if (!filtered.length) { soth.ui.showToast('No capture data for the selected filters', 'info'); return; }

      // Build sub-parameter map
      const allSubParams = await soth.data.allSubParams();
      const spMap = {};
      allSubParams.forEach(sp => { spMap[sp.id] = sp; });

      // Group captures by village
      const byVillage = {};
      const paramSet = new Set();
      filtered.forEach(c => {
        if (!byVillage[c.village_id]) {
          byVillage[c.village_id] = {
            name: c.villages?.name || '',
            district: c.villages?.district || '',
            state: c.villages?.state || '',
            caps: {}
          };
        }
        byVillage[c.village_id].caps[c.sub_parameter_id] = c;
        paramSet.add(c.sub_parameter_id);
      });

      // Parameters as columns (only those with captures in the filter)
      const params = [...paramSet].map(id => spMap[id]).filter(Boolean)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const formatVal = c => {
        const parts = [];
        if (c.value_text) parts.push(c.value_text);
        if (c.value_scale != null) parts.push(c.value_scale);
        if (c.value_numeric != null) parts.push(c.value_numeric);
        return parts.join(' / ');
      };

      const rows = [];
      Object.values(byVillage).sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(info => {
        const row = { 'Village': info.name, 'District': info.district, 'State': info.state };
        params.forEach(p => {
          row[p.name] = info.caps[p.id] ? formatVal(info.caps[p.id]) : '';
        });
        rows.push(row);
      });

      this._downloadWorkbook([{ name: 'Partner Parameter Data', rows }], 'partner-village-parameter-data.xlsx');
    } catch (e) {
      console.error('Export error:', e);
      soth.ui.showToast('Export failed: ' + (e.message || 'Unknown'), 'error');
    } finally {
      if (btn) { btn.textContent = 'Export Excel'; btn.disabled = false; }
    }
  },

  deleteVillage: async function (villageId, villageName) {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="modal-content" style="max-width:450px;">
        <h3 style="color:var(--danger);">Delete Village</h3>
        <p style="margin:12px 0;font-size:14px;">
          Are you sure you want to delete <strong>${soth.ui.escapeHtml(villageName)}</strong>?
        </p>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">
          This will permanently delete all captures, org links, and the village record. This action cannot be undone.
        </p>
        <div class="form-actions">
          <button class="btn btn-primary" style="background:var(--danger);border-color:var(--danger);" onclick="soth.admin.doDeleteVillage('${villageId}')">Delete Permanently</button>
          <button class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
        </div>
      </div>`;
    modal.classList.remove('hidden');
  },

  doDeleteVillage: async function (villageId) {
    const result = await soth.auth.deleteVillage({ village_id: villageId });
    document.getElementById('admin-modal').classList.add('hidden');
    if (result.error) { soth.ui.showToast(result.error, 'error'); return; }
    soth.ui.showToast('Village deleted', 'success');
    // Refresh villages keeping the current page (or one page back if the last row on the page was deleted)
    const activeBtn = document.querySelector('.admin-nav-btn.active');
    const section = activeBtn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || 'villages';
    if (section === 'villages') {
      let page = soth.admin._villagesPage || 0;
      // If this page now has no rows, step back one page
      const container = document.getElementById('admin-section-content');
      const rows = container?.querySelectorAll('#village-table tbody tr').length || 0;
      if (page > 0 && rows === 0) page--;
      soth.admin.renderVillages(container, page);
    } else {
      soth.admin.showSection(section);
    }
  }
};
