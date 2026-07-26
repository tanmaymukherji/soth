// SoTH Capture — Tiered Village workspace (Theme summary + Sub-parameter editor)

soth.capture = {
  currentOrgId: null,
  currentVillageId: null,
  _charts: {},

  init: async function (orgId, villageId) {
    this.currentOrgId = orgId;
    this.currentVillageId = villageId;
    await this.renderTieredWorkspace('capture-workspace');
  },

  // Main entry: renders the two-tier view into container
  renderTieredWorkspace: async function (containerId, opts) {
    opts = opts || {};
    this.currentOrgId = opts.orgId || this.currentOrgId;
    this.currentVillageId = opts.villageId || this.currentVillageId;
    if (!this.currentOrgId || !this.currentVillageId) return;

    const container = document.getElementById(containerId);
    if (!container) return;
    soth.ui.showLoading(container);

    try {
      const [maturity, village] = await Promise.all([
        soth.maturity.computeVillage(this.currentOrgId, this.currentVillageId),
        soth.sb().from('villages').select('*').eq('id', this.currentVillageId).single()
      ]);
      this._renderTier1(container, maturity, village?.data);
      await this._renderTier2Container(container, maturity);
    } catch (e) {
      console.error('TieredWorkspace error:', e);
      container.innerHTML = '<p class="empty-state">Failed to load village data.</p>';
    }
  },

  // -------- Tier 1: Theme summary table + Radar chart --------
  _renderTier1: function (container, maturity, village) {
    const themes = maturity.themes || [];
    const overall = maturity.overall || 0;

    // Radar chart canvas
    const radarId = 'tier1-radar';
    const radarHtml = `<div class="radar-container"><canvas id="${radarId}"></canvas></div>`;

    // Summary table
    let tableHtml = `<table class="theme-summary-table">
      <thead><tr>
        <th>Theme</th><th>Score</th><th>Captured / Total</th><th>Last Update</th><th></th>
      </tr></thead><tbody>`;
    themes.forEach(t => {
      const lastCap = t.captures?.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))[0];
      const color = soth.map.maturityColor(t.score);
      tableHtml += `<tr class="theme-row" data-theme-id="${t.id}" style="cursor:pointer;" onclick="soth.capture.toggleTier2('${t.id}')">
        <td><strong>${soth.ui.escapeHtml(t.name)}</strong></td>
        <td><span class="score-badge" style="background:${color};">${t.score}%</span></td>
        <td>${t.capturedParams} / ${t.totalParams}</td>
        <td>${lastCap ? soth.ui.formatDateTime(lastCap.captured_at) : '—'}</td>
        <td><span class="expand-icon">▸</span></td>
      </tr>`;
    });
    tableHtml += '</tbody></table>';

    container.innerHTML = `
      <div class="tier-summary">
        <div class="tier-header">
          <div class="village-title">
            <h2>${soth.ui.escapeHtml(village?.name || 'Village')}</h2>
            <span class="village-meta">${soth.ui.escapeHtml(village?.district || '')}, ${soth.ui.escapeHtml(village?.state || '')}</span>
          </div>
          <div class="overall-score" style="color:${soth.map.maturityColor(overall)};">${overall}%</div>
        </div>
        <div class="tier1-content">
          ${radarHtml}
          <div class="theme-table-wrap">${tableHtml}</div>
        </div>
      </div>
      <div id="tier2-container" class="tier-detail hidden"></div>
    `;

    // Build radar chart
    if (themes.length) {
      if (this._charts[radarId]) this._charts[radarId].destroy();
      this._charts[radarId] = new Chart(document.getElementById(radarId), {
        type: 'radar',
        data: {
          labels: themes.map(t => t.name),
          datasets: [{
            label: 'Theme Score',
            data: themes.map(t => t.score),
            backgroundColor: 'rgba(37,99,235,0.1)',
            borderColor: '#2563eb',
            pointBackgroundColor: themes.map(t => soth.map.maturityColor(t.score)),
            pointRadius: 5,
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } },
          plugins: { legend: { display: false } }
        }
      });
    }
  },

  // -------- Tier 2: Sub-parameter editable table (accordion) --------
  _renderTier2Container: async function (container, maturity) {
    const allParams = await soth.data.allSubParams();
    const caps = await soth.data.latestCaptures(this.currentOrgId, this.currentVillageId);
    const capMap = {};
    caps.forEach(c => { capMap[c.sub_parameter_id] = c; });

    const paramsByTheme = {};
    allParams.forEach(p => {
      if (!paramsByTheme[p.theme_id]) paramsByTheme[p.theme_id] = [];
      paramsByTheme[p.theme_id].push(p);
    });

    const tier2El = document.getElementById('tier2-container');
    let html = '';
    maturity.themes.forEach(t => {
      const params = paramsByTheme[t.id] || [];
      html += `<div class="tier2-panel" id="tier2-${t.id}" style="display:none;">`;
      html += `<div class="tier2-header">
        <h3>${soth.ui.escapeHtml(t.name)}</h3>
        <button class="btn btn-small btn-outline" onclick="soth.capture.toggleTier2('${t.id}')">Close</button>
      </div>`;
      if (!params.length) {
        html += `<p class="empty-state">No sub-parameters defined for this theme. 
          <button class="btn btn-small btn-primary" onclick="soth.capture.showProposeForm('${t.id}', '${soth.ui.escapeHtml(t.name)}')">+ Propose New</button></p>`;
      } else {
        html += '<table class="param-table"><thead><tr>' +
          '<th>Sub-parameter</th><th>Type</th><th>Stage</th><th>Qualitative</th><th>Quantitative</th><th>Last Updated</th><th></th>' +
          '</tr></thead><tbody>';
        params.forEach(p => {
          const existing = capMap[p.id];
          const val = existing || {};
          const valueText = val.value_text || '';
          const valueScale = val.value_scale;
          const journeyStage = val.journey_stage || 'baseline';

          // Qualitative dropdown options
          const opts = { 'yes': 'Yes', 'no': 'No', 'partially': 'Partially', 'na': 'N/A', 'not_tracking': 'Not Tracking' };
          const matchedKey = Object.keys(opts).find(k => k.toLowerCase() === valueText.toLowerCase()) || '';
          let ddHtml = `<select class="capture-input qcell" data-param-id="${p.id}" data-input-type="qualitative"
            onchange="soth.capture.saveRowCapture('${p.id}')">
            <option value="">-- Select --</option>`;
          for (const [k, v] of Object.entries(opts)) {
            ddHtml += `<option value="${k}" ${matchedKey === k ? 'selected' : ''}>${v}</option>`;
          }
          if (valueText && !matchedKey) {
            ddHtml += `<option value="${soth.ui.escapeHtml(valueText)}" selected>${soth.ui.escapeHtml(valueText)} (custom)</option>`;
          }
          ddHtml += '</select>';

          const pctHtml = `<input type="number" class="capture-input acell" data-param-id="${p.id}" data-input-type="quantitative_scale"
            min="0" max="100" step="1" value="${valueScale != null ? valueScale : ''}" placeholder="0-100"
            onchange="soth.capture.saveRowCapture('${p.id}')">`;

          const stageClass = `stage-${journeyStage}`;
          const lastUpdated = existing ? soth.ui.formatDateTime(existing.captured_at) : '—';

          html += `<tr id="row-${p.id}">
            <td><strong>${soth.ui.escapeHtml(p.name)}</strong>${p.description ? `<br><span class="param-desc">${soth.ui.escapeHtml(p.description)}</span>` : ''}</td>
            <td><span class="type-badge">${soth.ui.dataTypeLabel(p.data_type)}</span></td>
            <td><span class="journey-badge ${stageClass}">${journeyStage}</span></td>
            <td>${ddHtml}</td>
            <td>${pctHtml}</td>
            <td>${lastUpdated}</td>
            <td><button class="btn btn-small btn-outline" onclick="soth.capture.showHistory('${p.id}','${soth.ui.escapeHtml(p.name)}')">History</button></td>
          </tr>`;
        });
        html += '</tbody></table>';
      }
      // Propose button at bottom of each theme
      html += `<div class="propose-new"><button class="btn btn-secondary" onclick="soth.capture.showProposeForm('${t.id}', '${soth.ui.escapeHtml(t.name)}')">+ Propose New Sub-Parameter</button></div>`;
      html += '</div>';
    });
    tier2El.innerHTML = html;
  },

  toggleTier2: function (themeId) {
    const panel = document.getElementById(`tier2-${themeId}`);
    const row = document.querySelector(`.theme-row[data-theme-id="${themeId}"]`);
    const icon = row?.querySelector('.expand-icon');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
      panel.style.display = 'none';
      if (icon) icon.textContent = '▸';
    } else {
      // Close all other panels
      document.querySelectorAll('.tier2-panel').forEach(p => p.style.display = 'none');
      document.querySelectorAll('.expand-icon').forEach(i => i.textContent = '▸');
      panel.style.display = 'block';
      if (icon) icon.textContent = '▾';
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  // Save a single row (both qualitative + quantitative if provided)
  saveRowCapture: async function (subParamId) {
    const row = document.getElementById(`row-${subParamId}`);
    if (!row) return;

    const dd = row.querySelector('[data-input-type="qualitative"]');
    const pct = row.querySelector('[data-input-type="quantitative_scale"]');

    const textVal = dd ? dd.value : '';
    const rawPct = pct ? pct.value.trim() : '';
    const pctVal = rawPct !== '' ? parseInt(rawPct, 10) : null;

    if (!textVal && pctVal == null) return;

    const payload = {
      org_id: this.currentOrgId,
      village_id: this.currentVillageId,
      sub_parameter_id: subParamId,
      data_type: pctVal != null ? 'quantitative_scale' : 'qualitative',
      value_text: textVal || '',
      value_scale: pctVal,
      value_numeric: null,
    };

    try {
      const { data, error } = await soth.data.saveCapture(payload);
      if (error) throw error;

      // Update row UI optimistically
      if (data) {
        const badge = row.querySelector('.journey-badge');
        if (badge) {
          const newStage = soth.maturity.journeyStage([data]);
          badge.className = `journey-badge stage-${newStage}`;
          badge.textContent = newStage;
        }
        const lastTd = row.querySelector('td:last-of-type');
        if (lastTd) {
          const dateTd = lastTd.previousElementSibling;
          if (dateTd) dateTd.textContent = soth.ui.formatDateTime(data.captured_at);
        }
      }

      // Refresh Tier 1 score + radar
      await this._refreshTier1Scores();

      soth.ui.showToast('Saved!', 'success');
    } catch (e) {
      console.error('Save error:', e);
      soth.ui.showToast('Error saving: ' + e.message, 'error');
      // Revert on error - reload row from server
      await this._reloadRow(subParamId);
    }
  },

  _refreshTier1Scores: async function () {
    const maturity = await soth.maturity.computeVillage(this.currentOrgId, this.currentVillageId);
    const themes = maturity.themes || [];

    // Update table badges
    themes.forEach(t => {
      const row = document.querySelector(`.theme-row[data-theme-id="${t.id}"]`);
      if (!row) return;
      const badge = row.querySelector('.score-badge');
      const color = soth.map.maturityColor(t.score);
      if (badge) {
        badge.textContent = t.score + '%';
        badge.style.background = color;
      }
      const lastCap = t.captures?.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))[0];
      const dateTd = row.querySelector('td:nth-child(4)');
      if (dateTd) dateTd.textContent = lastCap ? soth.ui.formatDateTime(lastCap.captured_at) : '—';
    });

    // Update radar chart
    const radarId = 'tier1-radar';
    if (this._charts[radarId]) {
      this._charts[radarId].data.labels = themes.map(t => t.name);
      this._charts[radarId].data.datasets[0].data = themes.map(t => t.score);
      this._charts[radarId].data.datasets[0].pointBackgroundColor = themes.map(t => soth.map.maturityColor(t.score));
      this._charts[radarId].update();
    }

    // Update overall score
    const overallEl = document.querySelector('.overall-score');
    if (overallEl) {
      overallEl.textContent = maturity.overall + '%';
      overallEl.style.color = soth.map.maturityColor(maturity.overall);
    }
  },

  _reloadRow: async function (subParamId) {
    const caps = await soth.data.latestCaptures(this.currentOrgId, this.currentVillageId);
    const cap = caps.find(c => c.sub_parameter_id === subParamId);
    if (!cap) return;
    const row = document.getElementById(`row-${subParamId}`);
    if (!row) return;
    const dd = row.querySelector('[data-input-type="qualitative"]');
    const pct = row.querySelector('[data-input-type="quantitative_scale"]');
    if (dd) dd.value = cap.value_text || '';
    if (pct) pct.value = cap.value_scale != null ? cap.value_scale : '';
  },

  // Keep existing helpers for modals
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
      name, description: desc, data_type: dataType || 'qualitative',
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
        let parts = [];
        if (c.value_text) parts.push(c.value_text);
        if (c.value_scale != null) parts.push('Score: ' + c.value_scale);
        if (c.value_numeric != null) parts.push('Number: ' + c.value_numeric);
        let val = parts.join(' | ') || '-';
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