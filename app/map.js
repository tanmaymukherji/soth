// SoTH Map — BharatAtlas (MapLibre GL + PMTiles) + Leaflet fallback

soth.map = {
  _map: null,
  _pinsGeoJSON: { type: 'FeatureCollection', features: [] },
  _provider: null,

  _loadScripts: async function () {
    if (window.maplibregl && window.pmtiles) return;

    const loadCSS = (id, href) => {
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id; link.rel = 'stylesheet'; link.href = href;
      document.head.appendChild(link);
    };

    const loadJS = (src) => new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-src-hash="${src}"]`);
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.dataset.srcHash = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed: ' + src));
      document.head.appendChild(s);
    });

    loadCSS('maplibre-css', 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css');

    // Load MapLibre first, then pmtiles
    await loadJS('https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js');
    await loadJS('https://cdn.jsdelivr.net/npm/pmtiles@4.4.1/dist/pmtiles.js');
  },

  _setupProtocol: function () {
    if (soth.map._protocol) return;
    if (!window.pmtiles?.Protocol) return;
    const protocol = new window.pmtiles.Protocol({ errorOnMissingTile: false });
    window.maplibregl.addProtocol('pmtiles', protocol.tilev4 || protocol.tile);
    soth.map._protocol = protocol;
  },

  _loadLeaflet: async function () {
    if (window.L) return true;
    const loadJS = (src) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Failed: ' + src));
      document.head.appendChild(s);
    });
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    await loadJS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    return true;
  },

  createMap: async function (containerId, center, zoom) {
    const el = document.getElementById(containerId);
    if (!el) return null;

    const cfg = soth.config();
    center = center || cfg.DEFAULT_MAP_CENTER || { lat: 22.9734, lng: 78.6569 };
    zoom = zoom || cfg.DEFAULT_MAP_ZOOM || 5;

    if (soth.map._map) { soth.map._map.remove(); soth.map._map = null; }
    if (soth.map._provider === 'leaflet') {
      soth.map._markers?.forEach(m => m?.remove?.());
      soth.map._markers = [];
    }

    // Try MapLibre first
    try {
      await soth.map._loadScripts();
      if (window.maplibregl && window.pmtiles?.Protocol) {
        soth.map._setupProtocol();
        const created = soth.map._createMapLibre(el, containerId, center, zoom);
        if (created) return created;
      }
    } catch (e) {
      console.warn('MapLibre init failed, falling back to Leaflet:', e);
    }

    // Fallback to Leaflet
    await soth.map._loadLeaflet();
    if (!window.L) { el.innerHTML = '<div class="map-empty">Map library not available.</div>'; return null; }

    soth.map._provider = 'leaflet';
    soth.map._map = L.map(containerId, { zoomControl: true }).setView([center.lat, center.lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &bull; Data: <a href="https://bharatlas.com">BharatAtlas</a> (LGD)',
      maxZoom: 19,
    }).addTo(soth.map._map);
    return soth.map._map;
  },

  _createMapLibre: function (el, containerId, center, zoom) {
    const BASE = 'https://pub-0429b8e3b5a946e69ea007df844a6f1c.r2.dev';
    const ATTR = '<a href="https://lgdirectory.gov.in" target="_blank">LGD</a> &bull; <a href="https://bharatlas.com" target="_blank">BharatAtlas</a>';

    soth.map._pinsGeoJSON = { type: 'FeatureCollection', features: [] };

    soth.map._provider = 'maplibre';
    soth.map._map = new window.maplibregl.Map({
      container: containerId,
      style: {
        version: 8,
        glyphs: 'https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-fonts@1/glyphs/{fontstack}/{range}.pbf',
        sources: {
          'india-boundary': {
            type: 'vector',
            url: `pmtiles://${BASE}/admin/states/LGD_States.pmtiles`,
            attribution: ATTR,
          },
          'our-pins': {
            type: 'geojson',
            data: soth.map._pinsGeoJSON,
          },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#f0f2f5' } },
          {
            id: 'india-fill',
            type: 'fill',
            source: 'india-boundary',
            'source-layer': 'LGD_States',
            paint: { 'fill-color': '#e2e8f0', 'fill-outline-color': '#94a3b8' },
          },
          {
            id: 'india-border',
            type: 'line',
            source: 'india-boundary',
            'source-layer': 'LGD_States',
            paint: { 'line-color': '#475569', 'line-width': 1.5 },
          },
          {
            id: 'state-label',
            type: 'symbol',
            source: 'india-boundary',
            'source-layer': 'LGD_States',
            minzoom: 4,
            layout: {
              'text-field': ['get', 'STNAME'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 12],
              'text-transform': 'uppercase',
              'text-letter-spacing': 0.05,
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            },
            paint: {
              'text-color': '#334155',
              'text-halo-color': '#ffffff',
              'text-halo-width': 2,
            },
          },
          {
            id: 'our-pins-circle',
            type: 'circle',
            source: 'our-pins',
            paint: {
              'circle-radius': ['case', ['>=', ['zoom'], 10], 8, 6],
              'circle-color': ['get', 'color'],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-opacity': 0.9,
            },
          },
          {
            id: 'our-pins-label',
            type: 'symbol',
            source: 'our-pins',
            minzoom: 10,
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 11,
              'text-offset': [0, 1.5],
              'text-anchor': 'top',
            },
            paint: {
              'text-color': '#1e293b',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.5,
            },
          },
        ],
      },
      center: [center.lng, center.lat],
      zoom: zoom,
      attributionControl: true,
    });

    soth.map._map.on('click', 'our-pins-circle', (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      new window.maplibregl.Popup({ offset: [0, -10] })
        .setLngLat(e.lngLat)
        .setHTML(p.popupHtml || `<strong>${p.name}</strong>`)
        .addTo(soth.map._map);
    });
    soth.map._map.on('mouseenter', 'our-pins-circle', () => { soth.map._map.getCanvas().style.cursor = 'pointer'; });
    soth.map._map.on('mouseleave', 'our-pins-circle', () => { soth.map._map.getCanvas().style.cursor = ''; });

    return soth.map._map;
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
        ${options.maturity != null ? `<br><span style="font-size:12px;">Maturity: ${options.maturity}%</span>` : ''}
        ${options.detailUrl ? `<br><a href="${options.detailUrl}" style="color:#2563eb;font-size:12px;">View details →</a>` : ''}
      </div>`;

    if (soth.map._provider === 'leaflet') {
      if (!soth.map._markers) soth.map._markers = [];
      const marker = L.circleMarker([lat, lng], {
        radius: 7, fillColor: pinColor, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85,
      }).addTo(soth.map._map);
      marker.bindPopup(popupHtml);
      if (options.onClick) marker.on('click', options.onClick);
      soth.map._markers.push(marker);
      return marker;
    }

    // MapLibre: add to GeoJSON source
    soth.map._pinsGeoJSON.features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: village.id, name: village.name, color: pinColor, popupHtml,
        detailUrl: options.detailUrl || '', orgName: org?.name || '',
      },
    });
    const src = soth.map._map.getSource('our-pins');
    if (src) src.setData(soth.map._pinsGeoJSON);
    return village.id;
  },

  addVillages: function (villages, org) {
    if (!soth.map._map || !villages) return;
    const bounds = soth.map._provider === 'leaflet'
      ? [] : new window.maplibregl.LngLatBounds();
    let count = 0;
    villages.forEach(v => {
      const id = soth.map.addVillagePin(v, org);
      if (id) {
        count++;
        if (soth.map._provider === 'leaflet') bounds.push([parseFloat(v.lat), parseFloat(v.lng)]);
        else bounds.extend([parseFloat(v.lng), parseFloat(v.lat)]);
      }
    });
    if (count > 1) {
      if (soth.map._provider === 'leaflet' && soth.map._map.fitBounds) {
        soth.map._map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
      } else if (!bounds.isEmpty()) {
        soth.map._map.fitBounds(bounds, { padding: 50, maxZoom: 10 });
      }
    }
  },

  clearMarkers: function () {
    if (soth.map._provider === 'leaflet') {
      (soth.map._markers || []).forEach(m => m?.remove?.());
      soth.map._markers = [];
    } else {
      soth.map._pinsGeoJSON = { type: 'FeatureCollection', features: [] };
      const src = soth.map._map?.getSource('our-pins');
      if (src) src.setData(soth.map._pinsGeoJSON);
    }
  },

  geocodeViaBharatAtlas: async function (village) {
    try {
      const name = encodeURIComponent(village.name);
      const resp = await fetch(
        `https://bharatlas.com/api/v1/layers/lgd_villages/query?where=vilname11=${name}&select=vilname11,dtname,stname,xmin,ymin,xmax,ymax&limit=10`
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data?.data?.length) return null;
      const match = data.data.find(d =>
        d.dtname?.toLowerCase() === village.district?.toLowerCase() &&
        d.stname?.toLowerCase() === village.state?.toLowerCase()
      );
      if (!match || match.xmin == null) return null;
      const lat = ((parseFloat(match.ymin) || 0) + (parseFloat(match.ymax) || 0)) / 2;
      const lng = ((parseFloat(match.xmin) || 0) + (parseFloat(match.xmax) || 0)) / 2;
      if (!lat || !lng) return null;
      return { lat, lng, label: `${village.name}, ${village.district}, ${village.state} (BharatAtlas)`, source: 'bharatlas' };
    } catch (e) { console.warn('BharatAtlas geocode error:', e); return null; }
  },

  geocodeVillage: async function (village) {
    const key = soth.config().MAPPLS_MAP_KEY;
    if (!key) return null;
    const query = encodeURIComponent(`${village.name}, ${village.district}, ${village.state}, India`);
    const url = `${soth.config().MAPPLS_GEOCODE_URL || 'https://atlas.mappls.com/api/places/search/json'}?query=${query}&region=IND`;
    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
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
