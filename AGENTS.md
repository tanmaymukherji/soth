# SoTH — Agent Guide

## Stack
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Backend**: Supabase (Postgres + Auth + RLS)
- **Map**: MapMyIndia / Mappls SDK (loaded dynamically from CDN)
- **Charts**: Chart.js (CDN)
- **Hosting**: GitHub Pages

## Key commands
- `npm install` — Install script dependencies (seed, geocode, bootstrap-admin)
- `node scripts/seed.mjs` — Seed DB from CSVs (set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`)
- `node scripts/geocode.mjs` — Geocode ungeocoded villages (set `MAPPLS_MAP_KEY`)
- `node scripts/bootstrap-admin.mjs --email=admin@example.com` — Create first admin

## Config
Copy `config.example.js` → `config.js` and set:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `MAPPLS_MAP_KEY` (Mappls/MapMyIndia key)
- `BOOTSTRAP_ADMIN_EMAIL`

## Migrations
Run `supabase/migrations/` SQL files in filename order against your Supabase project.

## Important files
- `app/core.js` — Supabase init, auth, data helpers, UI helpers
- `app/map.js` — Mappls SDK loader, map creation, geocoding
- `app/capture.js` — Capture workspace for partners
- `app/admin.js` — Admin console (organisations, themes, proposals, etc.)
- `app/maturity.js` — Maturity score computation
- `app/superset.js` — Superset browser rendering

## MapMyIndia / Mappls
- SDK URLs: `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=<KEY>`
- Geocoding: `https://atlas.mappls.com/api/places/search/json?query=...`
- CSS: `https://apis.mappls.com/vector_map/assets/v3.5/mappls-glob.css`
- API key must be set as `MAPPLS_MAP_KEY` in config.js
