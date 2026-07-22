// SoTH Capture — Village workspace for partners to capture parameters

soth.capture = {
  currentOrgId: null,
  currentVillageId: null,
  themeFilters: {},

  init: async function (orgId, villageId) {
    this.currentOrgId = orgId;
    this.currentVillageId = villageId;
    await this.renderCaptureWorkspace('capture-workspace');
  },

  renderCaptureWorkspace: async function (containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    soth.ui.showLoading(container);

    const themes = await soth.data.themes();
    const allParams = await soth.data.allSubParams();
    const caps = await soth.data.latestCaptures(this.currentOrgId, this.currentVillageId);

    // Build capture map
    const capMap = {};
    caps.forEach(c => { capMap[c.sub_parameter_id] = c; });

    const paramsByTheme = {};
    allParams.forEach(p => {
      if (!paramsByTheme[p.theme_id]) paramsByTheme[p.theme_id] = [];
      paramsByTheme[p.theme_id].push(p);
    });

    let html = '<div class="capture-workspace">';
    html += '<div class="capture-tabs">';
    themes.forEach((t, i) => {
      const active = i === 0 ? ' active' : '';
      html += `<button class="tab-btn${active}" data-theme-id="${t.id}" onclick="soth.capture.switchTheme('${t.id}')">
        ${soth.ui.escapeHtml(t.name)}</button>`;
    });
    html += '</div>';

    // Render each theme panel
    themes.forEach(async (t, i) => {
      // We'll switch via JS, pre-render all
    });

    // Render all panels (first visible)
    themes.forEach((t, i) => {
      const params = paramsByTheme[t.id] || [];
      const display = i === 0 ? 'block' : 'none';
      html += `<div class="theme-panel" id="panel-${t.id}" style="display:${display}">`;
      html += `<h3>${soth.ui.escapeHtml(t.name)}</h3>`;
      html += `<p class="theme-desc">${soth.ui.escapeHtml(t.description || '')}</p>`;

      if (!params.length) {
        html += '<p class="empty-state">No sub-parameters defined for this theme.</p>';
      } else {
        html += '<div class="param-list">';
        params.forEach(p => {
          const existing = capMap[p.id];
          html += this.renderParamCard(p, existing);
        });
        html += '</div>';
      }

      // Propose new parameter
      html += `<div class="propose-new"><button class="btn btn-secondary" onclick="soth.capture.showProposeForm('${t.id}', '${soth.ui.escapeHtml(t.name)}')">+ Propose New Sub-Parameter</button></div>`;
      html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
  },

  renderParamCard: function (param, existing) {
    const val = existing || {};
    const valueText = val.value_text || '';
    const valueScale = val.value_scale;
    const valueNumeric = val.value_numeric;
    const journeyStage = val.journey_stage || 'baseline';

    let inputHtml = '';
    if (param.data_type === 'qualitative') {
      const opts = { 'yes': 'Yes', 'no': 'No', 'partially': 'Partially', 'na': 'N/A', 'not_tracking': 'Not Tracking' };
      // Case-insensitive match for existing value
      const matchedKey = Object.keys(opts).find(k => k.toLowerCase() === valueText.toLowerCase()) || '';
      inputHtml = `<select class="capture-input" data-param-id="${param.id}" data-type="qualitative"
        onchange="soth.capture.saveCapture('${param.id}','qualitative',this.value,null,null)">
        <option value="">-- Select --</option>
        ${Object.entries(opts).map(([k, v]) => `<option value="${k}" ${matchedKey === k ? 'selected' : ''}>${v}</option>`).join('')}
        ${valueText && !matchedKey ? `<option value="${soth.ui.escapeHtml(valueText)}" selected>${soth.ui.escapeHtml(valueText)} (custom)</option>` : ''}
      </select>`;
    } else if (param.data_type === 'quantitative_scale') {
      const maxScale = param.scale?.max || 5;
      inputHtml = '<div class="scale-group">';
      for (let i = 0; i <= maxScale; i++) {
        const sel = valueScale === i ? ' selected' : '';
        inputHtml += `<button class="scale-btn${sel}" onclick="soth.capture.saveCapture('${param.id}','quantitative_scale',null,${i},null)">${i}</button>`;
      }
      inputHtml += '</div>';
    } else if (param.data_type === 'quantitative_numeric') {
      inputHtml = `<input type="number" class="capture-input" data-param-id="${param.id}"
        value="${valueNumeric != null ? valueNumeric : ''}" placeholder="Enter value"
        onchange="soth.capture.saveCapture('${param.id}','quantitative_numeric',null,null,this.value)">`;
    } else {
      inputHtml = `<textarea class="capture-input" data-param-id="${param.id}" rows="2"
        placeholder="Enter notes / evidence"
        onchange="soth.capture.saveCapture('${param.id}','text',this.value,null,null)">${soth.ui.escapeHtml(valueText)}</textarea>`;
    }

    return `<div class="param-card" id="param-card-${param.id}">
      <div class="param-card-header">
        <div class="param-name">${soth.ui.escapeHtml(param.name)}</div>
        <div class="param-meta">${soth.ui.dataTypeLabel(param.data_type)}</div>
      </div>
      ${param.description ? `<div class="param-desc">${soth.ui.escapeHtml(param.description)}</div>` : ''}
      <div class="param-input-area">${inputHtml}</div>
      <div class="param-footer">
        <span class="journey-badge stage-${journeyStage}">${journeyStage}</span>
        ${existing?.captured_at ? `<span class="captured-at">Last: ${soth.ui.formatDate(existing.captured_at)}</span>` : ''}
        <button class="btn btn-small btn-outline" onclick="soth.capture.showHistory('${param.id}','${soth.ui.escapeHtml(param.name)}')">History</button>
      </div>
    </div>`;
  },

  saveCapture: async function (subParamId, dataType, textVal, scaleVal, numVal) {
    const payload = {
      org_id: this.currentOrgId,
      village_id: this.currentVillageId,
      sub_parameter_id: subParamId,
      data_type: dataType,
      value_text: textVal || '',
      value_scale: scaleVal != null ? parseInt(scaleVal) : null,
      value_numeric: numVal != null ? parseFloat(numVal) : null,
    };
    const { data, error } = await soth.data.saveCapture(payload);
    if (error) {
      soth.ui.showToast('Error saving: ' + error.message, 'error');
    } else {
      soth.ui.showToast('Saved!', 'success');
      // Refresh the card
      const caps = await soth.data.latestCaptures(this.currentOrgId, this.currentVillageId);
      const capMap = {};
      caps.forEach(c => { capMap[c.sub_parameter_id] = c; });
      const allParams = await soth.data.allSubParams();
      const param = allParams.find(p => p.id === subParamId);
      if (param) {
        const card = document.getElementById(`param-card-${subParamId}`);
        if (card) {
          card.outerHTML = this.renderParamCard(param, capMap[subParamId]);
        }
      }
    }
  },

  switchTheme: function (themeId) {
    document.querySelectorAll('.theme-panel').forEach(el => el.style.display = 'none');
    const panel = document.getElementById(`panel-${themeId}`);
    if (panel) panel.style.display = 'block';
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const btn = document.querySelector(`.tab-btn[data-theme-id="${themeId}"]`);
    if (btn) btn.classList.add('active');
  },

  showProposeForm: function (themeId, themeName) {
    const form = document.getElementById('propose-form');
    if (!form) return;
    document.getElementById('propose-theme-id').value = themeId;
    document.getElementById('propose-theme-name').textContent = themeName;
    document.getElementById('propose-modal').classList.remove('hidden');
  },

  submitProposal: async function () {
    const themeId = document.getElementById('propose-theme-id').value;
    const name = document.getElementById('propose-name').value.trim();
    const desc = document.getElementById('propose-desc').value.trim();
    const dataType = document.getElementById('propose-data-type').value;

    if (!name) { soth.ui.showToast('Parameter name is required', 'error'); return; }

    const sb = soth.sb();
    const { data, error } = await sb.from('proposed_sub_parameters').insert({
      theme_id: themeId || null,
      suggested_theme_name: !themeId ? document.getElementById('propose-theme-name').textContent : '',
      name, description, data_type: dataType || 'qualitative',
      proposed_by_org_id: soth.currentProfile?.org_id,
      proposed_by_user_id: soth.currentUser?.id,
      status: 'pending'
    }).select().single();

    if (error) { soth.ui.showToast('Error: ' + error.message, 'error'); return; }
    soth.ui.showToast('Proposal submitted for admin review!', 'success');
    document.getElementById('propose-modal').classList.add('hidden');
    document.getElementById('propose-form').reset();
  },

  showHistory: async function (subParamId, paramName) {
    const sb = soth.sb();
    const { data } = await sb.from('captures')
      .select('*')
      .eq('org_id', this.currentOrgId)
      .eq('village_id', this.currentVillageId)
      .eq('sub_parameter_id', subParamId)
      .order('captured_at', { ascending: false });

    const modal = document.getElementById('history-modal');
    if (!modal) return;
    const body = document.getElementById('history-body');
    let html = `<h4>History: ${soth.ui.escapeHtml(paramName)}</h4>`;
    if (!data || !data.length) {
      html += '<p class="empty-state">No captures yet.</p>';
    } else {
      html += '<table class="param-table"><thead><tr><th>Date</th><th>Value</th><th>Journey</th><th>Captured By</th></tr></thead><tbody>';
      data.forEach(c => {
        let val = c.value_text || '';
        if (c.value_scale != null) val = `Scale: ${c.value_scale}`;
        if (c.value_numeric != null) val = `Number: ${c.value_numeric}`;
        html += `<tr>
          <td>${soth.ui.formatDateTime(c.captured_at)}</td>
          <td>${soth.ui.escapeHtml(val)}</td>
          <td><span class="journey-badge stage-${c.journey_stage}">${c.journey_stage}</span></td>
          <td>${c.captured_by || '-'}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
    body.innerHTML = html;
    modal.classList.remove('hidden');
  }
};
