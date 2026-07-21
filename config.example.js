// Copy this file to config.js and fill in the values.
// config.js is git-ignored.

window.APP_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  // Mappls / MapMyIndia SDK key (required for the India map).
  MAPPLS_MAP_KEY: '',
  // Optional: Mappls geocoding "search" endpoint base
  MAPPLS_GEOCODE_URL: 'https://atlas.mappls.com/api/places/search/json',
  // Brand
  BRAND_NAME: 'Sense of The House (SoTH)',
  // First-admin bootstrap email (the one supplied via scripts/bootstrap-admin.mjs)
  BOOTSTRAP_ADMIN_EMAIL: '',
  // Mappls map view default center (India)
  DEFAULT_MAP_CENTER: { lat: 22.9734, lng: 78.6569 },
  DEFAULT_MAP_ZOOM: 5,
};
