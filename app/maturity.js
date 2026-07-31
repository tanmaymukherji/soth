// SoTH Maturity - Computes partner maturity scores per theme

soth.maturity = {
  // Compute maturity for a single org across themes
  compute: async function (orgId) {
    try {
      const sb = soth.sb();
      if (!sb) return { themes: [], overall: 0 };
      const themes = await soth.data.themes();
      const villages = await soth.data.orgVillages(orgId);
      const villageIds = villages.map(v => v.village_id);
      const totalVillages = villageIds.length;
      if (!themes.length || !totalVillages) return { themes: [], overall: 0 };

      // Get all captures for this org (village filter is redundant - captures belong to org's villages)
      const { data: allCaps } = await sb.from('latest_captures').select('*')
        .eq('org_id', orgId);
      const capMap = {};
      (allCaps || []).forEach(c => {
        if (!capMap[c.sub_parameter_id]) capMap[c.sub_parameter_id] = new Set();
        capMap[c.sub_parameter_id].add(c.village_id);
      });

    // Count recent captures (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    const recentCount = (allCaps || []).filter(c => c.captured_at >= ninetyDaysAgo).length;

    const themeScores = themes.map(theme => {
      const params = theme.sub_params || [];
      const totalParams = params.length;
      if (!totalParams) return { ...theme, score: 0, capturedParams: 0, coveredVillages: 0, recentCaptures: 0 };

      let capturedParams = 0;
      const coveredVillageSet = new Set();

      params.forEach(p => {
        if (capMap[p.id]?.size) {
          capturedParams++;
          capMap[p.id].forEach(vid => coveredVillageSet.add(vid));
        }
      });

      const coveredVillages = coveredVillageSet.size;
      const paramCoverage = totalParams ? capturedParams / totalParams : 0;
      const villageCoverage = totalVillages ? coveredVillages / totalVillages : 0;
      const recency = totalParams * totalVillages > 0
        ? Math.min(recentCount / (totalParams * totalVillages), 1) : 0;

      const score = Math.round(
        (0.4 * paramCoverage + 0.4 * villageCoverage + 0.2 * recency) * 100
      );

      return {
        ...theme,
        score,
        capturedParams,
        totalParams,
        coveredVillages,
        totalVillages,
        recentCaptures: recentCount
      };
    });

    // Pre-load sub_params for each theme efficiently
    const allSubParams = await soth.data.allSubParams();
    const subParamsByTheme = {};
    allSubParams.forEach(sp => {
      if (!subParamsByTheme[sp.theme_id]) subParamsByTheme[sp.theme_id] = [];
      subParamsByTheme[sp.theme_id]?.push(sp);
    });
    themeScores.forEach(ts => {
      ts.sub_params = subParamsByTheme[ts.id] || [];
    });
    // Recompute with counts
    const finalScores = themeScores.map(theme => {
      const params = subParamsByTheme[theme.id] || [];
      const totalParams = params.length;
      let capturedParams = 0;
      const coveredVillageSet = new Set();
      params.forEach(p => {
        if (capMap[p.id]?.size) {
          capturedParams++;
          capMap[p.id].forEach(vid => coveredVillageSet.add(vid));
        }
      });
      const coveredVillages = coveredVillageSet.size;
      const paramCoverage = totalParams ? capturedParams / totalParams : 0;
      const villageCoverage = totalVillages ? coveredVillages / totalVillages : 0;
      const recency = totalParams * totalVillages > 0
        ? Math.min(recentCount / (totalParams * totalVillages), 1) : 0;
      const score = Math.round(
        (0.4 * paramCoverage + 0.4 * villageCoverage + 0.2 * recency) * 100
      );
      return { ...theme, score, capturedParams, totalParams, coveredVillages, totalVillages, recentCaptures: recentCount };
    });

    const overall = finalScores.length
      ? Math.round(finalScores.reduce((s, t) => s + t.score, 0) / finalScores.length)
      : 0;

    return { themes: finalScores, overall };
    } catch (e) {
      console.warn('SoTH: maturity.compute error:', e);
      return { themes: [], overall: 0 };
    }
  },

  // Get journey stage for a (org, village, param)
  journeyStage: function (captures) {
    const stages = ['awareness', 'baseline', 'tracked', 'achieved'];
    const latest = captures.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at))[0];
    if (!latest) return 'awareness';
    const idx = stages.indexOf(latest.journey_stage);
    return idx >= 0 ? latest.journey_stage : 'baseline';
  },

  // Compute per-theme village score = average of value_scale on latest captures.
  // Text answers map to Yes=100, Partially=50, No=0; N/A and Not Tracking are
  // excluded. Returns { themes:[{id,name,score,capturedParams,totalParams,captures}], overall }.
  computeVillage: async function (orgId, villageId) {
    try {
      const sb = soth.sb();
      if (!sb) return { themes: [], overall: 0 };
      const themes = await soth.data.themes();
      const allParams = await soth.data.allSubParams();
      const caps = await soth.data.latestCaptures(orgId, villageId);
      const capMap = {};
      caps.forEach(c => { capMap[c.sub_parameter_id] = c; });

      const excluded = new Set(['na', 'n/a', 'not_tracking']);

      const scoreFor = function (cap) {
        if (!cap) return null;
        if (cap.value_scale != null) return cap.value_scale;
        const key = (cap.value_text || '').trim().toLowerCase();
        if (excluded.has(key)) return null;
        return soth.scoring.qualScore(cap.value_text);
      };

      const paramsByTheme = {};
      allParams.forEach(p => {
        if (!paramsByTheme[p.theme_id]) paramsByTheme[p.theme_id] = [];
        paramsByTheme[p.theme_id].push(p);
      });

      const themeScores = themes.map(theme => {
        const params = paramsByTheme[theme.id] || [];
        let sum = 0;
        let counted = 0;
        let capturedParams = 0;
        const themeCaptures = [];
        params.forEach(p => {
          const cap = capMap[p.id];
          if (!cap) return;
          capturedParams++;
          themeCaptures.push(cap);
          const s = scoreFor(cap);
          if (s != null) { sum += s; counted++; }
        });
        const score = counted ? Math.round(sum / counted) : 0;
        return {
          ...theme,
          score,
          capturedParams,
          totalParams: params.length,
          captures: themeCaptures
        };
      });

      const scored = themeScores.filter(t => t.capturedParams > 0);
      const overall = scored.length
        ? Math.round(scored.reduce((s, t) => s + t.score, 0) / scored.length)
        : 0;

      return { themes: themeScores, overall };
    } catch (e) {
      console.warn('SoTH: maturity.computeVillage error:', e);
      return { themes: [], overall: 0 };
    }
  }
};
