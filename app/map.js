// SoTH Map - Village pins on map (no basemap tiles, no boundaries)

soth.map = {
  _map: null,
  _markers: [],
  _loaded: false,
  _boundariesPromise: null,

  _loadLeaflet: async function () {
    if (window.L) { soth.map._loaded = true; return true; }
    if (soth.map._loadPromise) return soth.map._loadPromise;
    soth.map._loadPromise = new Promise((resolve, reject) => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css'; link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      if (document.getElementById('leaflet-js')) { resolve(true); return; }
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => { soth.map._loaded = true; resolve(true); };
      script.onerror = () => { reject(new Error('Leaflet load failed')); };
      document.head.appendChild(script);
    });
    return soth.map._loadPromise;
  },

  createMap: async function (containerId, center, zoom) {
    const el = document.getElementById(containerId);
    if (!el) return null;
    try { await soth.map._loadLeaflet(); }
    catch (e) { el.innerHTML = '<div class="map-empty">Failed to load map library.</div>'; return null; }
    if (!window.L) { el.innerHTML = '<div class="map-empty">Map library not available.</div>'; return null; }

    const cfg = soth.config();
    center = center || cfg.DEFAULT_MAP_CENTER || { lat: 22.9734, lng: 78.6569 };
    zoom = zoom || cfg.DEFAULT_MAP_ZOOM || 5;

    if (soth.map._map) { soth.map._map.remove(); soth.map._map = null; }
    soth.map._markers.forEach(m => m?.remove?.()); soth.map._markers = [];

    soth.map._map = L.map(containerId, {
      zoomControl: true,
      attributionControl: true,
    }).setView([center.lat, center.lng], zoom);

    L.control.attribution({ prefix: false }).addTo(soth.map._map);
    soth.map._map.attributionControl.addAttribution('Boundaries: <a href="https://lgdirectory.gov.in" target="_blank">LGD</a> via <a href="https://bharatatlas.com" target="_blank">BharatAtlas</a>');

    // Load boundaries async; caller should await _boundariesPromise before adding markers
    soth.map._boundariesPromise = soth.map._loadBoundaries();

    return soth.map._map;
  },

  _loadBoundaries: async function () {
    if (!soth.map._map) return;
    try {
      const [india, states] = await Promise.all([
        fetch('data/india-boundary-bh.geojson').then(r => r.json()).catch(() => null),
        fetch('data/states-bh.geojson').then(r => r.json()).catch(() => null),
      ]);
      if (india) {
        L.geoJSON(india, {
          style: { fillColor: '#e2e8f0', fillOpacity: 0.5, color: '#1e293b', weight: 1.5, opacity: 0.8 },
        }).addTo(soth.map._map);
      }
      if (states) {
        L.geoJSON(states, {
          style: { fill: false, color: '#94a3b8', weight: 0.8, opacity: 0.5 },
        }).addTo(soth.map._map);
      }
    } catch (e) { console.warn('SoTH: boundary load error:', e); }
  },

  // Add a pin for one or more villages at the same coordinate.
  // options:
  //   villages  — array of { id, name, district, state, block, gp }
  //   org       — the org object (for single-org pins)
  //   allOrgs   — array of { id, name, maturity, color } (for multi-org pins)
  //   color     — pin colour
  //   maturity  — maturity percentage (used for single-org display)
  addVillagePin: function (options) {
    if (!soth.map._map) return null;
    const lat = parseFloat(options.lat);
    const lng = parseFloat(options.lng);
    if (isNaN(lat) || isNaN(lng)) return null;

    const pinColor = options.color || '#2563eb';
    const villages = options.villages || [];
    const allOrgs = options.allOrgs || [];
    const villageCount = villages.length;

    // Build popup content
    const pinKey = `pin_${lat}_${lng}`;
    if (!soth.map._pinClickRegistry) soth.map._pinClickRegistry = {};

    // Store all villages and orgs for this pin
    soth.map._pinClickRegistry[pinKey] = {
      villages: villages.map(v => ({ id: v.id, name: v.name, district: v.district })),
      orgs: allOrgs.map(o => ({ id: o.id, name: o.name })),
    };

    let popupHtml = '';

    if (villageCount === 1) {
      // Single village at this coordinate
      const v = villages[0];
      popupHtml = `<div style="font-family:sans-serif;font-size:13px;line-height:1.4;min-width:180px;max-width:320px;">
        <strong style="font-size:14px;">${soth.ui.escapeHtml(v.name)}</strong><br>
        <span style="color:#666;font-size:12px;">${soth.ui.escapeHtml(v.district || '')}, ${soth.ui.escapeHtml(v.state || '')}</span>`;
      if (allOrgs.length === 1) {
        popupHtml += `<div style="margin-top:4px;">
          <span style="color:#2563eb;font-weight:500;font-size:13px;">${soth.ui.escapeHtml(allOrgs[0].name)}</span>
          <span style="font-size:11px;color:#666;"> — ${allOrgs[0].maturity}%</span>
        </div>`;
        popupHtml += `<div style="margin-top:4px;"><button onclick="soth.map.openVillageFromPin('${pinKey}',0,0)" style="font-size:11px;color:#2563eb;background:none;border:none;cursor:pointer;padding:2px 0;text-decoration:underline;">View details</button></div>`;
      } else if (allOrgs.length > 1) {
        popupHtml += `<div style="margin-top:6px;">`;
        allOrgs.forEach((o, idx) => {
          popupHtml += `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:3px;">
            <span><span style="color:${o.color};font-weight:500;font-size:12px;">${soth.ui.escapeHtml(o.name)}</span> <span style="font-size:11px;color:#666;">${o.maturity}%</span></span>
            <button onclick="soth.map.openVillageFromPin('${pinKey}',0,${idx})" style="font-size:11px;color:#2563eb;background:none;border:none;cursor:pointer;padding:2px 4px;text-decoration:underline;">View details</button>
          </div>`;
        });
        popupHtml += `</div>`;
      } else {
        popupHtml += `<div style="margin-top:4px;"><button onclick="soth.map.openVillageFromPin('${pinKey}',0,0)" style="font-size:11px;color:#2563eb;background:none;border:none;cursor:pointer;padding:2px 0;text-decoration:underline;">View details</button></div>`;
      }
      popupHtml += `</div>`;

    } else {
      // Multiple villages at same coordinate
      popupHtml = `<div style="font-family:sans-serif;font-size:13px;line-height:1.4;min-width:220px;max-width:360px;">
        <strong style="font-size:14px;">${villageCount} villages</strong><br>
        <span style="color:#666;font-size:12px;">Same coordinates</span>
        <div style="margin-top:8px;max-height:250px;overflow-y:auto;">`;
      villages.forEach((v, vIdx) => {
        popupHtml += `<div style="padding:6px 0;border-bottom:1px solid #e5e7eb;">
          <strong style="font-size:13px;">${soth.ui.escapeHtml(v.name)}</strong>
          <span style="color:#888;font-size:11px;"> — ${soth.ui.escapeHtml(v.district || '')}</span>`;
        if (allOrgs.length) {
          allOrgs.forEach((o, oIdx) => {
            popupHtml += `<div style="margin-top:2px;"><button onclick="soth.map.openVillageFromPin('${pinKey}',${vIdx},${oIdx})" style="font-size:11px;color:#2563eb;background:none;border:none;cursor:pointer;padding:0;text-decoration:underline;">View details — ${soth.ui.escapeHtml(o.name)}</button></div>`;
          });
        } else {
          popupHtml += `<div style="margin-top:2px;"><button onclick="soth.map.openVillageFromPin('${pinKey}',${vIdx},0)" style="font-size:11px;color:#2563eb;background:none;border:none;cursor:pointer;padding:0;text-decoration:underline;">View details</button></div>`;
        }
        popupHtml += `</div>`;
      });
      popupHtml += `</div></div>`;
    }

    // Radius: slightly bigger for multi-village pins
    const radius = villageCount > 1 ? 7 + Math.min(villageCount, 20) * 0.5 : 7;

    const marker = L.circleMarker([lat, lng], {
      radius, fillColor: pinColor, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85,
    }).addTo(soth.map._map);
    marker.bindPopup(popupHtml, { maxHeight: 350 });
    soth.map._markers.push(marker);
    return marker;
  },

  // Open the side panel from a pin click — looks up village + org from the registry
  openVillageFromPin: function (pinKey, villageIdx, orgIdx) {
    const entry = soth.map._pinClickRegistry?.[pinKey];
    if (!entry) return;
    const village = entry.villages[villageIdx];
    const org = entry.orgs[orgIdx];
    if (!village) return;
    if (soth.map._map) soth.map._map.closePopup();
    if (typeof soth.openVillageInPanel === 'function') {
      soth.openVillageInPanel(org?.id, village.id, village.name);
    }
  },

  addVillages: function (villages, org) {
    if (!soth.map._map || !villages || !villages.length) return;
    const bounds = [];
    villages.forEach(v => {
      const pin = soth.map.addVillagePin({
        lat: v.lat, lng: v.lng,
        villages: [{ id: v.id, name: v.name, district: v.district, state: v.state }],
        allOrgs: org ? [{ id: org.id, name: org.name, maturity: 0, color: '#2563eb' }] : [],
        color: '#2563eb',
      });
      if (pin && parseFloat(v.lat) && parseFloat(v.lng)) bounds.push([parseFloat(v.lat), parseFloat(v.lng)]);
    });
    if (bounds.length > 1 && soth.map._map?.fitBounds)
      soth.map._map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
  },

  clearMarkers: function () {
    soth.map._markers.forEach(m => m?.remove?.());
    soth.map._markers = [];
    soth.map._pinClickRegistry = {};
  },

  // Helper: clean village name (remove parenthetical suffixes, extra spaces)
  _cleanVillageName: function (name) {
    let n = name.replace(/\([^)]*\)/g, '').replace(/[_,]/g, ' ').trim();
    n = n.replace(/\s+/g, ' ').trim();
    return n;
  },

  // Helper: generate name variations for LGD lookup
  _nameVariations: function (name) {
    const n = name.trim();
    const vars = [n];
    if (n.endsWith('i')) vars.push(n.slice(0, -1) + 'e');
    if (n.endsWith('y')) vars.push(n.slice(0, -1) + 'i');
    if (n.endsWith('u')) vars.push(n.slice(0, -1) + 'a');
    if (n.endsWith('a')) vars.push(n.slice(0, -1));
    if (n.endsWith('e')) vars.push(n.slice(0, -1));
    for (const pair of [['ll', 'l'], ['tt', 't'], ['pp', 'p'], ['nn', 'n'], ['mm', 'm'], ['rr', 'r']]) {
      if (n.includes(pair[0])) vars.push(n.replace(pair[0], pair[1]));
    }
    return [...new Set(vars)];
  },

  geocodeViaBharatAtlas: async function (village) {
    const baseName = soth.map._cleanVillageName(village.name);
    const nameForms = soth.map._nameVariations(baseName);
    if (!nameForms.includes(village.name.trim())) nameForms.unshift(village.name.trim());
    if (!nameForms.includes(baseName)) nameForms.unshift(baseName);

    for (const nf of nameForms) {
      try {
        const resp = await fetch(
          `https://bharatlas.com/api/v1/layers/lgd_villages/query?where=vilname11=${encodeURIComponent(nf)}&select=vilname11,dtname,stname,xmin,ymin,xmax,ymax,vil_lgd&limit=10`
        );
        if (!resp.ok) continue;
        const data = await resp.json();
        if (!data?.data?.rows?.length) continue;
        let match = data.data.rows.find(d =>
          d.dtname?.toLowerCase() === village.district?.toLowerCase() &&
          d.stname?.toLowerCase() === village.state?.toLowerCase()
        );
        if (!match) {
          match = data.data.rows.find(d =>
            d.stname?.toLowerCase() === village.state?.toLowerCase()
          );
        }
        if (!match) match = data.data.rows[0];
        if (match.xmin == null) continue;
        const lat = ((parseFloat(match.ymin) || 0) + (parseFloat(match.ymax) || 0)) / 2;
        const lng = ((parseFloat(match.xmin) || 0) + (parseFloat(match.xmax) || 0)) / 2;
        if (!lat || !lng) continue;
        return { lat, lng, label: `${village.name}, ${village.district}, ${village.state} (LGD via BharatAtlas)`, source: 'bharatlas' };
      } catch (e) { /* try next variation */ }
    }
    if (village.district) {
      try {
        const q = encodeURIComponent(`${village.district}, ${village.state}, India`);
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
          headers: { 'User-Agent': 'SoTH/1.0' }
        });
        if (r.ok) {
          const data = await r.json();
          if (data?.length) {
            const loc = data[0];
            return { lat: parseFloat(loc.lat), lng: parseFloat(loc.lon), label: `${village.district} district, ${village.state}`, source: 'district-fallback' };
          }
        }
      } catch (e) {}
    }
    return null;
  },

  geocodeViaGramEEE: async function (village) {
    const baseUrl = soth.config().GRAMEEE_LGD_URL || '';
    if (!baseUrl) return null;
    try {
      const resp = await fetch(
        `${baseUrl}/api/lgd/search?q=${encodeURIComponent(village.name)}`
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data?.villages?.length) return null;
      const match = data.villages.find(v =>
        v.district_name?.toLowerCase() === village.district?.toLowerCase() &&
        v.state_name?.toLowerCase() === village.state?.toLowerCase()
      ) || data.villages[0];
      if (match.lat && match.lng) {
        return { lat: parseFloat(match.lat), lng: parseFloat(match.lng), label: `${village.name} (LGD via GramEEE)`, source: 'grameee' };
      }
      if (match.latitude && match.longitude) {
        return { lat: parseFloat(match.latitude), lng: parseFloat(match.longitude), label: `${village.name} (LGD via GramEEE)`, source: 'grameee' };
      }
      return null;
    } catch (e) { return null; }
  },

  _applyGeocode: async function (village, result) {
    if (!village?.id || !result?.lat) return;
    try {
      // Route through Edge Function (service key) to bypass RLS for custom auth
      const res = await soth.auth.updateVillage({
        village_id: village.id,
        lat: result.lat, lng: result.lng,
        geocode_source: result.source || 'unknown',
        geocode_label: result.label || '',
        geocoded_at: new Date().toISOString(),
        geocode_status: 'geocoded'
      });
      if (res.error) console.warn('applyGeocode error:', res.error);
    } catch (e) { console.warn('applyGeocode error:', e); }
  },

  maturityColor: function (pct) {
    if (pct >= 75) return '#16a34a';
    if (pct >= 50) return '#ca8a04';
    if (pct >= 25) return '#ea580c';
    return '#dc2626';
  },

  themeColor: function (themeName) {
    const colors = {
      'Agro ecology': '#16a34a', 'Energy': '#f59e0b', 'Biodiversity / Forest': '#059669',
      'Soil': '#92400e', 'Water': '#2563eb', 'Gender and Inclusion': '#d946ef',
      'Health and Nurtition': '#ec4899', 'Health': '#ec4899', 'Healthcare': '#f472b6',
      'Instituition': '#6366f1', 'Export-Import': '#14b8a6', 'Livelihood basket': '#0891b2',
      'Income / Expense': '#0ea5e9', 'Waste': '#71717a', 'Education': '#84cc16',
      'Commons': '#65a30d', 'Air': '#94a3b8', 'Youth and employment': '#a855f7',
      'Migration': '#f97316', 'Idealogy/ Thinking/ Unity': '#e11d48', 'Emapthy': '#be185d',
    };
    return colors[themeName] || '#6b7280';
  }
};
