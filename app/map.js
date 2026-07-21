// SoTH Map — Mappls/MapMyIndia integration

soth.map = {
  _map: null,
  _markers: [],
  _loaded: false,
  _loadPromise: null,

  // Load the Mappls SDK dynamically (mirrors gre-mis-dashboard pattern)
  ensureSDK: async function () {
    if (window.mappls?.Map && soth.map._loaded) return true;
    if (soth.map._loadPromise) return soth.map._loadPromise;

    const key = String(soth.config().MAPPLS_MAP_KEY || '').trim();
    if (!key) {
      console.warn('SoTH Map: MAPPLS_MAP_KEY not set in config.js');
      return false;
    }

    // Inject CSS
    if (!document.getElementById('mappls-web-sdk-css')) {
      const link = document.createElement('link');
      link.id = 'mappls-web-sdk-css';
      link.rel = 'stylesheet';
      link.href = 'https://apis.mappls.com/vector_map/assets/v3.5/mappls-glob.css';
      document.head.appendChild(link);
    }

    const urls = [
      `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${encodeURIComponent(key)}`,
      `https://sdk.mappls.com/map/sdk/web?v=3.0&layer=vector&access_token=${encodeURIComponent(key)}`,
      `https://apis.mappls.com/advancedmaps/api/${encodeURIComponent(key)}/map_sdk?layer=vector&v=3.0`,
    ];

    soth.map._loadPromise = (async () => {
      for (const src of urls) {
        try {
          await new Promise((resolve, reject) => {
            document.querySelectorAll("script[data-mappls-sdk='true']").forEach(n => n.remove());
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;
            script.dataset.mapplsSdk = 'true';
            const timeout = setTimeout(() => reject(new Error('timeout')), 30000);
            script.onload = () => { clearTimeout(timeout); window.mappls?.Map ? resolve(true) : reject(new Error('Mappls unavailable')); };
            script.onerror = () => { clearTimeout(timeout); reject(new Error('load error')); };
            document.head.appendChild(script);
          });
          soth.map._loaded = true;
          return true;
        } catch (e) {
          console.warn('Mappls SDK attempt failed:', src, e);
        }
      }
      soth.map._loaded = false;
      return false;
    })();

    const loaded = await soth.map._loadPromise;
    if (!loaded) soth.map._loadPromise = null;
    return loaded;
  },

  // Create or re-create a map in the given element
  createMap: async function (containerId, center, zoom) {
    const ready = await soth.map.ensureSDK();
    if (!ready || !window.mappls) {
      document.getElementById(containerId).innerHTML =
        '<div class="map-empty">Map requires a valid Mappls SDK key in <code>config.js</code>.<br>' +
        'Set <code>MAPPLS_MAP_KEY</code> to your Mappls/MapMyIndia API key.</div>';
      return null;
    }

    const cfg = soth.config();
    center = center || cfg.DEFAULT_MAP_CENTER || { lat: 22.9734, lng: 78.6569 };
    zoom = zoom || cfg.DEFAULT_MAP_ZOOM || 5;

    // Remove old map
    if (soth.map._map) {
      soth.map._map.remove();
      soth.map._map = null;
    }
    soth.map._markers.forEach(m => m?.remove?.());
    soth.map._markers = [];

    soth.map._map = new window.mappls.Map(containerId, {
      center,
      zoom,
      zoomControl: true,
      geolocation: false,
      location: false,
    });

    return soth.map._map;
  },

  // Add a village pin
  addVillagePin: function (village, org, options) {
    if (!soth.map._map) return null;
    options = options || {};
    const lat = parseFloat(village.lat);
    const lng = parseFloat(village.lng);
    if (isNaN(lat) || isNaN(lng)) return null;

    const popupHtml = `
      <div style="font-family:sans-serif;font-size:13px;line-height:1.4;min-width:180px;">
        <strong>${soth.ui.escapeHtml(village.name)}</strong><br>
        <span style="color:#666;">${soth.ui.escapeHtml(village.district)}, ${soth.ui.escapeHtml(village.state)}</span><br>
        ${org ? `<span style="color:#2563eb;">${soth.ui.escapeHtml(org.name)}</span>` : ''}
        ${options.maturity != null ? `<br><span style="font-size:12px;">Maturity: ${options.maturity}%</span>` : ''}
        ${options.detailUrl ? `<br><a href="${options.detailUrl}" style="color:#2563eb;font-size:12px;">View details →</a>` : ''}
      </div>`;

    const pinColor = options.color || '#2563eb';
    const markerHtml = `<div style="width:20px;height:20px;border-radius:50%;background:${pinColor};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;"></div>`;

    const marker = new window.mappls.Marker({
      map: soth.map._map,
      position: { lat, lng },
      html: markerHtml,
      popupHtml,
      popupOptions: { autoClose: true, offset: { bottom: [0, -10] } },
      fitbounds: false,
    });

    if (options.onClick) {
      marker?.on?.('click', options.onClick);
      marker?.addListener?.('click', options.onClick);
    }

    soth.map._markers.push(marker);
    return marker;
  },

  // Add multiple pins
  addVillages: function (villages, org) {
    if (!soth.map._map) return;
    if (!villages || !villages.length) return;

    const boundsCoords = [];
    villages.forEach(v => {
      const pin = soth.map.addVillagePin(v, org);
      if (pin && parseFloat(v.lat) && parseFloat(v.lng)) {
        boundsCoords.push([parseFloat(v.lng), parseFloat(v.lat)]);
      }
    });

    if (boundsCoords.length > 1 && soth.map._map?.fitBounds) {
      soth.map._map.fitBounds(boundsCoords, { padding: 50, maxZoom: 10 });
    }
  },

  // Clear all markers
  clearMarkers: function () {
    soth.map._markers.forEach(m => m?.remove?.());
    soth.map._markers = [];
  },

  // Geocode a village by name + district + state via Mappls search API
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

  // Color by maturity level
  maturityColor: function (pct) {
    if (pct >= 75) return '#16a34a';
    if (pct >= 50) return '#ca8a04';
    if (pct >= 25) return '#ea580c';
    return '#dc2626';
  },

  // Color by theme (hash-based)
  themeColor: function (themeName) {
    const colors = {
      'Agro ecology': '#16a34a',
      'Energy': '#f59e0b',
      'Biodiversity / Forest': '#059669',
      'Soil': '#92400e',
      'Water': '#2563eb',
      'Gender and Inclusion': '#d946ef',
      'Health and Nurtition': '#ec4899',
      'Health': '#ec4899',
      'Healthcare': '#f472b6',
      'Instituition': '#6366f1',
      'Export-Import': '#14b8a6',
      'Livelihood basket': '#0891b2',
      'Income / Expense': '#0ea5e9',
      'Waste': '#71717a',
      'Education': '#84cc16',
      'Commons': '#65a30d',
      'Air': '#94a3b8',
      'Youth and employment': '#a855f7',
      'Migration': '#f97316',
      'Idealogy/ Thinking/ Unity': '#e11d48',
      'Empathy': '#be185d',
    };
    return colors[themeName] || '#6b7280';
  }
};
