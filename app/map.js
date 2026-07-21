// SoTH Map — BharatAtlas (MapLibre GL + PMTiles) + Mappls geocoding

soth.map = {
  _map: null,
  _pinsGeoJSON: { type: 'FeatureCollection', features: [] },
  _provider: 'bharatlas',

  _loadDeps: async function () {
    if (window.maplibregl && window.pmtiles?.Protocol) return true;

    // Load MapLibre CSS
    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    // Load MapLibre JS + pmtiles in parallel
    const load = (src) => new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.dataset.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed: ' + src));
      document.head.appendChild(s);
    });

    await Promise.all([
      load('https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js'),
      load('https://cdn.jsdelivr.net/npm/pmtiles@3.2.1/dist/pmtiles.js'),
    ]);

    if (window.pmtiles?.Protocol) {
      soth.map._pmtilesProtocol = new window.pmtiles.Protocol();
      window.maplibregl.addProtocol('pmtiles', soth.map._pmtilesProtocol.tile);
    }
    return true;
  },

  createMap: async function (containerId, center, zoom) {
    await soth.map._loadDeps();

    const el = document.getElementById(containerId);
    if (!el) return null;

    const cfg = soth.config();
    center = center || cfg.DEFAULT_MAP_CENTER || { lat: 22.9734, lng: 78.6569 };
    zoom = zoom || cfg.DEFAULT_MAP_ZOOM || 5;

    if (soth.map._map) {
      soth.map._map.remove();
      soth.map._map = null;
    }

    soth.map._pinsGeoJSON = { type: 'FeatureCollection', features: [] };

    // BharatAtlas PMTiles URLs
    const BASE = 'https://pub-0429b8e3b5a946e69ea007df844a6f1c.r2.dev';
    const ATTR = 'Boundaries: <a href="https://lgdirectory.gov.in" target="_blank">LGD</a> · Atlas: <a href="https://bharatlas.com" target="_blank">BharatAtlas</a>';

    soth.map._map = new window.maplibregl.Map({
      container: containerId,
      style: {
        version: 8,
        sources: {
          'states': {
            type: 'vector',
            url: `pmtiles://${BASE}/admin/states/LGD_States.pmtiles`,
            attribution: ATTR,
          },
          'districts': {
            type: 'vector',
            url: `pmtiles://${BASE}/admin/districts/LGD_Districts.pmtiles`,
            attribution: ATTR,
          },
          'our-pins': {
            type: 'geojson',
            data: soth.map._pinsGeoJSON,
          },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#f3f4f6' } },
          {
            id: 'states-fill', type: 'fill', source: 'states',
            'source-layer': 'LGD_States',
            paint: { 'fill-color': '#e2e8f0', 'fill-outline-color': '#94a3b8' },
          },
          {
            id: 'states-border', type: 'line', source: 'states',
            'source-layer': 'LGD_States',
            paint: { 'line-color': '#64748b', 'line-width': 1 },
          },
          {
            id: 'states-label', type: 'symbol', source: 'states',
            'source-layer': 'LGD_States',
            minzoom: 4,
            layout: {
              'text-field': ['get', 'STNAME'],
              'text-size': 10,
              'text-transform': 'uppercase',
              'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
              'text-letter-spacing': 0.05,
            },
            paint: { 'text-color': '#475569', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
          },
          {
            id: 'districts-border', type: 'line', source: 'districts',
            'source-layer': 'LGD_Districts',
            minzoom: 7,
            paint: { 'line-color': '#cbd5e1', 'line-width': 0.5 },
          },
          {
            id: 'our-pins-circle', type: 'circle', source: 'our-pins',
            paint: {
              'circle-radius': ['case', ['>=', ['zoom'], 10], 8, 6],
              'circle-color': ['get', 'color'],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-opacity': 0.9,
            },
          },
          {
            id: 'our-pins-label', type: 'symbol', source: 'our-pins',
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

    // Add popups on click
    soth.map._map.on('click', 'our-pins-circle', (e) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      new window.maplibregl.Popup({ offset: [0, -10] })
        .setLngLat(e.lngLat)
        .setHTML(p.popupHtml || `<strong>${p.name}</strong>`)
        .addTo(soth.map._map);
    });
    soth.map._map.on('mouseenter', 'our-pins-circle', () => {
      soth.map._map.getCanvas().style.cursor = 'pointer';
    });
    soth.map._map.on('mouseleave', 'our-pins-circle', () => {
      soth.map._map.getCanvas().style.cursor = '';
    });

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

    // Store in GeoJSON source
    soth.map._pinsGeoJSON.features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: village.id,
        name: village.name,
        color: pinColor,
        popupHtml,
        detailUrl: options.detailUrl || '',
        orgName: org?.name || '',
      },
    });

    // Update the source data on the map
    const src = soth.map._map.getSource('our-pins');
    if (src) src.setData(soth.map._pinsGeoJSON);

    return village.id;
  },

  addVillages: function (villages, org) {
    if (!soth.map._map) return;
    if (!villages) return;

    const bounds = new window.maplibregl.LngLatBounds();
    let count = 0;
    (villages).forEach(v => {
      const id = soth.map.addVillagePin(v, org);
      if (id) {
        count++;
        bounds.extend([parseFloat(v.lng), parseFloat(v.lat)]);
      }
    });
    if (count > 1 && !bounds.isEmpty()) {
      soth.map._map.fitBounds(bounds, { padding: 50, maxZoom: 10 });
    }
  },

  clearMarkers: function () {
    soth.map._pinsGeoJSON = { type: 'FeatureCollection', features: [] };
    const src = soth.map._map?.getSource('our-pins');
    if (src) src.setData(soth.map._pinsGeoJSON);
  },

  // Mappls geocoding via REST API (kept from original)
  geocodeVillage: async function (village) {
    const key = soth.config().MAPPLS_MAP_KEY;
    if (!key) return null;
    const query = encodeURIComponent(`${village.name}, ${village.district}, ${village.state}, India`);
    const url = `${soth.config().MAPPLS_GEOCODE_URL || 'https://atlas.mappls.com/api/places/search/json'}?query=${query}&region=IND`;

    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` }
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data?.suggestedLocations?.length) {
        const loc = data.suggestedLocations[0];
        return {
          lat: parseFloat(loc.latitude),
          lng: parseFloat(loc.longitude),
          label: loc.placeAddress || loc.placeName || '',
          placeId: loc.placeId || ''
        };
      }
      return null;
    } catch (e) {
      console.warn('Geocode error:', e);
      return null;
    }
  },

  // BharatAtlas geocoding — uses LGD village bounding box for approximate coords
  geocodeViaBharatAtlas: async function (village) {
    try {
      const name = encodeURIComponent(village.name);
      const resp = await fetch(
        `https://bharatlas.com/api/v1/layers/lgd_villages/query?where=vilname11=${name}&select=vilname11,dtname,stname,xmin,ymin,xmax,ymax&limit=10`
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data?.data?.length) return null;
      // Match by district+state
      const match = data.data.find(d =>
        d.dtname?.toLowerCase() === village.district?.toLowerCase() &&
        d.stname?.toLowerCase() === village.state?.toLowerCase()
      );
      if (!match) return null;
      // Compute approximate centroid from bounding box
      const lat = ((parseFloat(match.ymin) || 0) + (parseFloat(match.ymax) || 0)) / 2;
      const lng = ((parseFloat(match.xmin) || 0) + (parseFloat(match.xmax) || 0)) / 2;
      if (!lat || !lng) return { found: true, lat: null, lng: null, source: 'bharatlas-nogeom' };
      return { lat, lng, label: `${village.name}, ${village.district}, ${village.state} (BharatAtlas)`, source: 'bharatlas' };
    } catch (e) {
      console.warn('BharatAtlas geocode error:', e);
      return null;
    }
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
      'Migration': '#f97316', 'Idealogy/ Thinking/ Unity': '#e11d48', 'Empathy': '#be185d',
    };
    return colors[themeName] || '#6b7280';
  }
};
