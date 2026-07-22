// SoTH Map - BharatAtlas-credited map with village pins (no basemap tiles)

soth.map = {
  _map: null,
  _markers: [],
  _loaded: false,

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

    // Load India boundary + states from BharatAtlas GeoJSON (async, rendered on top of white bg)
    soth.map._loadBharatAtlasBoundaries();

    return soth.map._map;
  },

  // Load BharatAtlas India boundary and state boundaries as GeoJSON layers
  _loadBharatAtlasBoundaries: async function () {
    if (!soth.map._map) return;
    // Fetch both files in parallel
    const [india, states] = await Promise.all([
      fetch('data/india-boundary-bh.geojson').then(r => r.json()).catch(() => null),
      fetch('data/states-bh.geojson').then(r => r.json()).catch(() => null),
    ]);
    // India outline
    if (india) {
      L.geoJSON(india, {
        style: { fillColor: '#e2e8f0', fillOpacity: 0.5, color: '#1e293b', weight: 1.5, opacity: 0.8 },
      }).addTo(soth.map._map);
    }
    // State boundaries
    if (states) {
      L.geoJSON(states, {
        style: { fill: false, color: '#94a3b8', weight: 0.8, opacity: 0.5 },
      }).addTo(soth.map._map);
    }
  },

  addVillagePin: function (village, org, options) {
    if (!soth.map._map) return null;
    options = options || {};
    const lat = parseFloat(village.lat);
    const lng = parseFloat(village.lng);
    if (isNaN(lat) || isNaN(lng)) return null;

    const pinColor = options.color || '#2563eb';
    const popupHtml = `
      <div style="font-family:sans-serif;font-size:13px;line-height:1.4;min-width:180px;">
        <strong>${soth.ui.escapeHtml(village.name)}</strong><br>
        <span style="color:#666;">${soth.ui.escapeHtml(village.district)}, ${soth.ui.escapeHtml(village.state)}</span><br>
        ${org ? `<span style="color:#2563eb;">${soth.ui.escapeHtml(org.name)}</span>` : ''}
        ${options.maturity ? `<br><span style="font-size:12px;">Maturity: ${options.maturity}%</span>` : ''}
        ${options.detailUrl ? `<br><a href="${options.detailUrl}" style="color:#2563eb;font-size:12px;">View details </a>` : ''}
      </div>`;

    const marker = L.circleMarker([lat, lng], {
      radius: 7, fillColor: pinColor, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85,
    }).addTo(soth.map._map);
    marker.bindPopup(popupHtml);
    if (options.onClick) marker.on('click', options.onClick);
    soth.map._markers.push(marker);
    return marker;
  },

  addVillages: function (villages, org) {
    if (!soth.map._map || !villages || !villages.length) return;
    const bounds = [];
    villages.forEach(v => {
      const pin = soth.map.addVillagePin(v, org);
      if (pin && parseFloat(v.lat) && parseFloat(v.lng)) bounds.push([parseFloat(v.lat), parseFloat(v.lng)]);
    });
    if (bounds.length > 1 && soth.map._map?.fitBounds)
      soth.map._map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
  },

  clearMarkers: function () {
    soth.map._markers.forEach(m => m?.remove?.());
    soth.map._markers = [];
  },

  geocodeViaBharatAtlas: async function (village) {
    try {
      const resp = await fetch(
        `https://bharatlas.com/api/v1/layers/lgd_villages/query?where=vilname11=${encodeURIComponent(village.name)}&select=vilname11,dtname,stname,xmin,ymin,xmax,ymax,_lat,_lng&limit=10`
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data?.data?.rows?.length) return null;
      const match = data.data.rows.find(d =>
        d.dtname?.toLowerCase() === village.district?.toLowerCase() &&
        d.stname?.toLowerCase() === village.state?.toLowerCase()
      );
      if (!match || match._lat == null) return null;
      return { lat: match._lat, lng: match._lng, label: `${village.name}, ${village.district}, ${village.state} (BharatAtlas)`, source: 'bharatlas' };
    } catch (e) { console.warn('BharatAtlas geocode error:', e); return null; }
  },

  geocodeVillage: async function (village) {
    const key = soth.config().MAPPLS_MAP_KEY;
    if (!key) return null;
    try {
      const resp = await fetch(
        `${soth.config().MAPPLS_GEOCODE_URL || 'https://atlas.mappls.com/api/places/search/json'}?query=${encodeURIComponent(village.name + ', ' + village.district + ', ' + village.state + ', India')}&region=IND`,
        { headers: { Authorization: `Bearer ${key}` } }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data?.suggestedLocations?.length) {
        const loc = data.suggestedLocations[0];
        return { lat: parseFloat(loc.latitude), lng: parseFloat(loc.longitude), label: loc.placeAddress || loc.placeName || '', placeId: loc.placeId || '' };
      }
      return null;
    } catch (e) { console.warn('Geocode error:', e); return null; }
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
