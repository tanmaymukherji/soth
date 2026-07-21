// SoTH Superset — Browse and search the global parameter superset

soth.superset = {
  // Render the superset browser
  render: async function (containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    soth.ui.showLoading(container);
    const themes = await soth.data.themes();
    const allParams = await soth.data.allSubParams();
    const orgs = await soth.data.organizations();

    const paramsByTheme = {};
    allParams.forEach(p => {
      const tid = p.theme_id;
      if (!paramsByTheme[tid]) paramsByTheme[tid] = [];
      paramsByTheme[tid].push(p);
    });

    let html = '<div class="superset-browser">';
    html += '<div class="superset-header"><h2>SoTH Parameter Superset</h2>';
    html += `<span class="superset-count">${allParams.length} parameters across ${themes.length} themes, ${orgs.length} partner organisations</span></div>`;

    for (const theme of themes) {
      const params = paramsByTheme[theme.id] || [];
      html += `<div class="theme-card"><div class="theme-card-header" onclick="this.nextElementSibling.classList.toggle('expanded')">`;
      html += `<span class="theme-name" style="border-left:4px solid ${soth.map.themeColor(theme.name)}">${soth.ui.escapeHtml(theme.name)}</span>`;
      html += `<span class="theme-count">${params.length} parameters</span>`;
      html += `<span class="toggle-icon">▼</span>`;
      html += '</div><div class="theme-card-body">';

      if (!params.length) {
        html += '<p class="empty-state">No parameters defined yet.</p>';
      } else {
        html += '<table class="param-table"><thead><tr>';
        html += '<th>#</th><th>Sub-Parameter</th><th>Ecosystem</th><th>Data Type</th><th>Possible Values</th>';
        html += '<th>Capturing Partners</th>';
        html += '</tr></thead><tbody>';

        params.forEach((p, i) => {
          // Who captures this? Check from current orgs seed data later
          const capturingOrgs = [];  // This would be computed from actual captures
          html += `<tr>
            <td>${i + 1}</td>
            <td><strong>${soth.ui.escapeHtml(p.name)}</strong>
              ${p.description ? `<br><small>${soth.ui.escapeHtml(p.description)}</small>` : ''}
            </td>
            <td>${soth.ui.escapeHtml(p.ecosystem || '')}</td>
            <td>${soth.ui.dataTypeLabel(p.data_type)}</td>
            <td>${p.possible_values?.length ? p.possible_values.join(', ') : '-'}</td>
            <td>${capturingOrgs.length || 'Loading...'}</td>
          </tr>`;
        });
        html += '</tbody></table>';
      }
      html += '</div></div>';
    }

    // Partner coverage section
    html += '<div class="partner-coverage"><h3>Partner Coverage Summary</h3>';
    html += '<table class="param-table"><thead><tr><th>Partner</th>';
    themes.forEach(t => { html += `<th>${soth.ui.escapeHtml(t.name)}</th>`; });
    html += '<th>Overall</th></tr></thead><tbody>';

    for (const org of orgs) {
      const maturity = await soth.maturity.compute(org.id);
      html += `<tr><td><strong>${soth.ui.escapeHtml(org.name)}</strong></td>`;
      themes.forEach(t => {
        const ts = maturity.themes.find(mt => mt.id === t.id);
        const s = ts?.score ?? 0;
        const color = soth.map.maturityColor(s);
        html += `<td style="color:${color};font-weight:bold;">${s}%</td>`;
      });
      html += `<td style="font-weight:bold;">${maturity.overall}%</td></tr>`;
    }

    html += '</tbody></table></div>';
    html += '</div>';

    container.innerHTML = html;
  }
};
