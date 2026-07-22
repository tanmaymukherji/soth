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
      default: content.innerHTML = '<p>Select a section.</p>';
    }
  },

  renderOrgs: async function (container) {
    const sb = soth.sb();
    const { data: orgs } = await sb.from('organizations').select('*').order('name');

    let html = '<div class="admin-section"><h2>Organisations</h2>';
    html += `<button class="btn btn-primary" onclick="soth.admin.showOrgForm()">+ Add Organisation</button>`;
    html += '<table class="param-table"><thead><tr><th>Name</th><th>Slug</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    (orgs || []).forEach(o => {
      html += `<tr>
        <td><strong>${soth.ui.escapeHtml(o.name)}</strong></td>
        <td>${soth.ui.escapeHtml(o.slug)}</td>
        <td>${soth.ui.escapeHtml(o.contact_email)}</td>
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
    let org = { name: '', slug: '', contact_email: '' };
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
        contact_email: document.getElementById('org-email').value.trim()
      };
      let error;
      if (orgId) {
        ({ error } = await sb.from('organizations').update(payload).eq('id', orgId));
      } else {
        ({ error } = await sb.from('organizations').insert(payload));
      }
      if (error) { soth.ui.showToast(error.message, 'error'); return; }
      soth.ui.showToast('Saved!', 'success');
      modal.classList.add('hidden');
      soth.admin.showSection('orgs');
    };
  },

  toggleOrgStatus: async function (orgId, currentStatus) {
    const sb = soth.sb();
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const { error } = await sb.from('organizations').update({ status: newStatus }).eq('id', orgId);
    if (error) { soth.ui.showToast(error.message, 'error'); return; }
    soth.ui.showToast('Status updated', 'success');
    soth.admin.showSection('orgs');
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
              <td>${p.ecosystem || ''}</td>
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
    let theme = { name: '', description: '', swaraj_tag: '', sort_order: 0 };
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
          <label>Swaraj Tag<input type="text" id="t-swaraj" value="${soth.ui.escapeHtml(theme.swaraj_tag || '')}"></label>
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
        swaraj_tag: document.getElementById('t-swaraj').value.trim(),
        sort_order: parseInt(document.getElementById('t-order').value) || 0
      };
      let error;
      if (themeId) ({ error } = await sb.from('themes').update(payload).eq('id', themeId));
      else ({ error } = await sb.from('themes').insert(payload));
      if (error) { soth.ui.showToast(error.message, 'error'); return; }
      soth.ui.showToast('Saved!', 'success');
      modal.classList.add('hidden');
      soth.admin.showSection('themes');
    };
  },

  showParamForm: async function (themeId, paramId) {
    const sb = soth.sb();
    const { data: themes } = await sb.from('themes').select('id, name').eq('status', 'active');
    let param = { name: '', description: '', data_type: 'qualitative', ecosystem: '', possible_values: [] };
    if (paramId) {
      const { data } = await sb.from('sub_parameters').select('*').eq('id', paramId).single();
      if (data) param = data;
    }

    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    const themeOptions = (themes || []).map(t =>
      `<option value="${t.id}" ${(themeId || param.theme_id) === t.id ? 'selected' : ''}>${soth.ui.escapeHtml(t.name)}</option>`).join('');

    modal.innerHTML = `
      <div class="modal-content">
        <h3>${paramId ? 'Edit' : 'Add'} Sub-Parameter</h3>
        <form id="param-form">
          <label>Theme *<select id="p-theme" required>${themeOptions}</select></label>
          <label>Name *<input type="text" id="p-name" value="${soth.ui.escapeHtml(param.name)}" required></label>
          <label>Description<textarea id="p-desc" rows="2">${soth.ui.escapeHtml(param.description || '')}</textarea></label>
          <label>Data Type *<select id="p-dtype" onchange="soth.admin.toggleScaleFields()">
            <option value="qualitative" ${param.data_type === 'qualitative' ? 'selected' : ''}>Qualitative</option>
            <option value="quantitative_scale" ${param.data_type === 'quantitative_scale' ? 'selected' : ''}>Quantitative (Scale)</option>
            <option value="quantitative_numeric" ${param.data_type === 'quantitative_numeric' ? 'selected' : ''}>Quantitative (Number)</option>
            <option value="text" ${param.data_type === 'text' ? 'selected' : ''}>Text</option>
          </select></label>
          <label>Ecosystem<input type="text" id="p-eco" value="${soth.ui.escapeHtml(param.ecosystem || '')}"></label>
          <div id="scale-fields" style="display:${param.data_type === 'quantitative_scale' ? 'block' : 'none'}">
            <label>Scale Max<input type="number" id="p-scale-max" value="${param.scale?.max ?? 5}" min="1" max="100"></label>
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
      const payload = {
        theme_id: document.getElementById('p-theme').value,
        name: document.getElementById('p-name').value.trim(),
        description: document.getElementById('p-desc').value.trim(),
        data_type: document.getElementById('p-dtype').value,
        ecosystem: document.getElementById('p-eco').value.trim(),
        scale: document.getElementById('p-dtype').value === 'quantitative_scale'
          ? { max: parseInt(document.getElementById('p-scale-max').value) || 5 } : null
      };
      let error;
      if (paramId) {
        const { error: e } = await sb.from('sub_parameters').update(payload).eq('id', paramId);
        error = e;
      } else {
        const { error: e } = await sb.from('sub_parameters').insert(payload);
        error = e;
      }
      if (error) { soth.ui.showToast(error.message, 'error'); return; }
      soth.ui.showToast('Saved!', 'success');
      modal.classList.add('hidden');
      soth.admin.showSection('themes');
    };
  },

  toggleScaleFields: function () {
    const dtype = document.getElementById('p-dtype')?.value;
    document.getElementById('scale-fields').style.display = dtype === 'quantitative_scale' ? 'block' : 'none';
  },

  toggleParamStatus: async function (paramId) {
    const sb = soth.sb();
    const { data: param } = await sb.from('sub_parameters').select('status').eq('id', paramId).single();
    const newStatus = param?.status === 'active' ? 'inactive' : 'active';
    await sb.from('sub_parameters').update({ status: newStatus }).eq('id', paramId);
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

    // Insert as sub_parameter
    const { error: insertErr } = await sb.from('sub_parameters').insert({
      theme_id: themeId || prop.theme_id,
      name: prop.name,
      description: prop.description,
      data_type: prop.data_type || 'qualitative',
      scale: prop.scale,
      possible_values: prop.possible_values || [],
      ecosystem: prop.ecosystem || '',
      created_by_org_id: prop.proposed_by_org_id,
      approved_by: soth.currentUser?.id,
      status: 'active', version: 1
    });
    if (insertErr) { soth.ui.showToast('Error:' + insertErr.message, 'error'); return; }

    // Mark proposal approved
    await sb.from('proposed_sub_parameters').update({
      status: 'approved', reviewed_by: soth.currentUser?.id, reviewed_at: new Date().toISOString()
    }).eq('id', proposalId);

    soth.audit.log('proposal_approved', 'proposed_sub_parameters', proposalId);

    document.getElementById('admin-modal').classList.add('hidden');
    soth.ui.showToast('Proposal approved and added to superset!', 'success');
    soth.admin.showSection('proposals');
  },

  rejectProposal: async function (proposalId) {
    const reason = prompt('Rejection reason (optional):');
    const sb = soth.sb();
    await sb.from('proposed_sub_parameters').update({
      status: 'rejected', reviewed_by: soth.currentUser?.id, reviewed_at: new Date().toISOString(),
      rejection_reason: reason || ''
    }).eq('id', proposalId);
    soth.ui.showToast('Proposal rejected', 'info');
    soth.admin.showSection('proposals');
  },

  renderVillages: async function (container, page) {
    const sb = soth.sb();
    page = page || 0;
    const PER_PAGE = 100;
    const offset = page * PER_PAGE;

    const { data: villages } = await sb.from('villages').select('*')
      .order('state', { ascending: true }).order('district', { ascending: true }).order('name', { ascending: true })
      .range(offset, offset + PER_PAGE - 1);

    const { count } = await sb.from('villages').select('*', { count: 'exact', head: true });
    const totalPages = Math.ceil((count || 0) / PER_PAGE);

    let html = '<div class="admin-section"><h2>Villages</h2>';
    html += `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="text" id="village-search-input" placeholder="Search by name..." style="flex:1;min-width:200px;"
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
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';

    // Pagination
    html += '<div style="display:flex;gap:8px;margin-top:12px;align-items:center;">';
    if (page > 0) html += `<button class="btn btn-small" onclick="soth.admin.renderVillages(container, ${page - 1})">Previous</button>`;
    html += `<span style="font-size:13px;color:var(--gray-500);">Page ${page + 1} of ${totalPages}</span>`;
    if (page < totalPages - 1) html += `<button class="btn btn-small" onclick="soth.admin.renderVillages(container, ${page + 1})">Next</button>`;
    html += '</div></div>';
    container.innerHTML = html;
  },

  _allVillages: null,

  filterVillages: async function (query) {
    const q = query.toLowerCase().trim();
    const container = document.getElementById('village-table-container');
    if (!container) return;
    const sb = soth.sb();
    if (!soth.admin._allVillages) {
      const { data } = await sb.from('villages').select('*').order('name').limit(2000);
      soth.admin._allVillages = data || [];
    }
    const filtered = q ? soth.admin._allVillages.filter(v =>
      v.name.toLowerCase().includes(q) || v.district.toLowerCase().includes(q) || v.state.toLowerCase().includes(q)
    ) : soth.admin._allVillages;
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
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    if (filtered.length > 200) html += `<p style="font-size:12px;color:var(--gray-500);">Showing 200 of ${filtered.length} matches</p>`;
    container.innerHTML = html;
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
      let error;
      if (villageId) ({ error } = await sb.from('villages').update(payload).eq('id', villageId));
      else ({ error } = await sb.from('villages').insert(payload));
      if (error) { soth.ui.showToast(error.message, 'error'); return; }
      soth.ui.showToast('Saved!', 'success');
      modal.classList.add('hidden');
      soth.admin.showSection('villages');
    };
  },

  geocodeSingle: async function (villageId) {
    const sb = soth.sb();
    const { data: v } = await sb.from('villages').select('*').eq('id', villageId).single();
    if (!v) return;

    // Geocode via BharatAtlas LGD (government data)
    let result = await soth.map.geocodeViaBharatAtlas(v);
    // Fallback: GramEEE-hosted LGD data
    if (!result?.lat) result = await soth.map.geocodeViaGramEEE(v);

    if (result?.lat) {
      await sb.from('villages').update({
        lat: result.lat, lng: result.lng,
        geocode_source: result.source || 'unknown',
        geocode_label: result.label || '',
        geocoded_at: new Date().toISOString(),
        geocode_status: 'geocoded'
      }).eq('id', villageId);
      soth.ui.showToast(`Geocoded via ${result.source}!`, 'success');
    } else {
      await sb.from('villages').update({ geocode_status: 'unmatched' }).eq('id', villageId);
      soth.ui.showToast('Could not geocode with any method', 'error');
    }
    soth.admin.showSection('villages');
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
    const sb = soth.sb();
    const { data: users } = await sb.from('profiles').select('*, organizations(name)').limit(200);
    const { data: orgs } = await sb.from('organizations').select('id, name').eq('status', 'active');

    let html = '<div class="admin-section"><h2>Users</h2>';
    html += '<p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Users create their own accounts via the Login page. Admin can assign roles, orgs, and approve pending users.</p>';
    html += '<table class="param-table"><thead><tr><th>Name</th><th>Email</th><th>Org</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    (users || []).forEach(u => {
      html += `<tr>
        <td>${soth.ui.escapeHtml(u.full_name || '')}</td>
        <td>${soth.ui.escapeHtml(u.email || u.id.substring(0, 12))}</td>
        <td>${soth.ui.escapeHtml(u.organizations?.name || u.org_id?.substring(0, 8) || '-')}</td>
        <td><span class="status-badge">${u.role}</span></td>
        <td><span class="status-badge status-${u.status}">${u.status}</span></td>
        <td nowrap>
          <button class="btn btn-small" onclick="soth.admin.changeUserRole('${u.id}')">Role</button>
          <button class="btn btn-small btn-outline" onclick="soth.admin.changeUserOrg('${u.id}')">Org</button>
          <button class="btn btn-small btn-outline" onclick="soth.admin.approveUser('${u.id}')">${u.status === 'pending' ? 'Approve' : ''}</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    html += '<p style="font-size:12px;color:var(--gray-500);margin-top:8px;">Users sign up with status <strong>pending</strong>. Admin must approve and assign org for org-level data access.</p>';
    html += '</div>';
    container.innerHTML = html;
  },

  changeUserRole: async function (userId) {
    const sb = soth.sb();
    const { data: profile } = await sb.from('profiles').select('role').eq('id', userId).single();
    const modal = document.getElementById('admin-modal');
    const current = profile?.role || 'partner';
    const roles = ['partner', 'partner_admin', 'soth_admin'];
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Change User Role</h3>
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">Current role: <strong>${current}</strong></p>
        <select id="new-role-select">
          ${roles.map(r => `<option value="${r}" ${r === current ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="soth.admin.doChangeRole('${userId}')">Save</button>
          <button class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
        </div>
      </div>`;
    modal.classList.remove('hidden');
  },

  doChangeRole: async function (userId) {
    const newRole = document.getElementById('new-role-select')?.value;
    if (!newRole || !['partner', 'partner_admin', 'soth_admin'].includes(newRole)) return;
    const sb = soth.sb();
    await sb.from('profiles').update({ role: newRole }).eq('id', userId);
    soth.ui.showToast('Role updated', 'success');
    document.getElementById('admin-modal').classList.add('hidden');
    soth.admin.showSection('users');
  },

  changeUserOrg: async function (userId) {
    const sb = soth.sb();
    const { data: orgs } = await sb.from('organizations').select('id, name').eq('status', 'active');
    const modal = document.getElementById('admin-modal');
    const opts = orgs.map(o => `<option value="${o.id}">${soth.ui.escapeHtml(o.name)}</option>`).join('');
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Assign Organisation</h3>
        <select id="assign-org-select">${opts}</select>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="soth.admin.doAssignOrg('${userId}')">Assign</button>
          <button class="btn btn-outline" onclick="document.getElementById('admin-modal').classList.add('hidden')">Cancel</button>
        </div>
      </div>`;
    modal.classList.remove('hidden');
  },

  doAssignOrg: async function (userId) {
    const orgId = document.getElementById('assign-org-select')?.value;
    if (!orgId) return;
    const sb = soth.sb();
    await sb.from('profiles').update({ org_id: orgId }).eq('id', userId);
    soth.ui.showToast('Org assigned', 'success');
    document.getElementById('admin-modal').classList.add('hidden');
    soth.admin.showSection('users');
  },

  approveUser: async function (userId) {
    const sb = soth.sb();
    await sb.from('profiles').update({ status: 'active' }).eq('id', userId);
    soth.ui.showToast('User approved', 'success');
    soth.admin.showSection('users');
  },

  renderGeocoding: async function (container) {
    const sb = soth.sb();
    const { data: pending } = await sb.from('villages').select('*')
      .in('geocode_status', ['pending', 'unmatched', 'failed'])
      .limit(500);

    let html = '<div class="admin-section"><h2>Geocoding Queue (' + (pending?.length || 0) + ' remaining)</h2>';
    html += `<button class="btn btn-primary" onclick="soth.admin.batchGeocode()">Batch Geocode All</button>`;
    html += `<p style="font-size:12px;color:var(--gray-500);margin:8px 0;">Uses BharatAtlas LGD data (Government Local Government Directory). Edit village form allows manual coordinate entry.</p>`;
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
          <td><button class="btn btn-small" onclick="soth.admin.geocodeSingle('${v.id}')">Geocode</button></td>
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
        await sb.from('villages').update({
          lat: result.lat, lng: result.lng,
          geocode_source: result.source || 'unknown',
          geocode_label: result.label || '',
          geocoded_at: new Date().toISOString(),
          geocode_status: 'geocoded'
        }).eq('id', v.id);
        count++;
      } else {
        await sb.from('villages').update({ geocode_status: 'unmatched' }).eq('id', v.id);
      }
      // Throttle to avoid rate limits
      await new Promise(r => setTimeout(r, 400));
    }

    if (btn) { btn.textContent = 'Batch Geocode All'; btn.disabled = false; }
    soth.ui.showToast(`Geocoded ${count} / ${pending?.length || 0} villages`, count > 0 ? 'success' : 'info');
    soth.admin.showSection('geocoding');
  }
};
