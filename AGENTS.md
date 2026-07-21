# SoTH — Agent Guide

## Stack
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Backend**: Supabase (Postgres + Auth + RLS)
- **Map**: BharatAtlas (MapLibre GL + PMTiles from bharatlas.com)
- **Geocoding**: BharatAtlas LGD village boundaries (fallback: Mappls Search API)
- **Charts**: Chart.js (CDN)
- **Hosting**: GitHub Pages

## Key commands
- `npm install` — Install script dependencies (seed, geocode, bootstrap-admin)
- `node scripts/seed.mjs` — Seed DB from CSVs (set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`)
- `node scripts/geocode.mjs` — Geocode ungeocoded villages (set `MAPPLS_MAP_KEY`)
- `node scripts/geocode-bharatlas.mjs --limit=100` — Batch geocode via BharatAtlas API + LGD village bounds
- `node scripts/bootstrap-admin.mjs --email=admin@example.com` — Create first admin

## Config
Copy `config.example.js` → `config.js` and set:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `MAPPLS_MAP_KEY` (Mappls/MapMyIndia key, only for geocoding fallback)
- `BOOTSTRAP_ADMIN_EMAIL`

## Migrations
Run `supabase/migrations/` SQL files in filename order against your Supabase project.

## Important files
- `app/core.js` — Supabase init, auth, data helpers, UI helpers
- `app/map.js` — BharatAtlas map (MapLibre GL), village pins, geocoding
- `app/capture.js` — Capture workspace for partners
- `app/admin.js` — Admin console (organisations, themes, proposals, etc.)
- `app/maturity.js` — Maturity score computation
- `app/superset.js` — Superset browser rendering
- `scripts/geocode-bharatlas.mjs` — Batch geocoding using BharatAtlas LGD village polygons

## Map — BharatAtlas
- **Rendering**: MapLibre GL JS v4 + PMTiles via `pmtiles` protocol
- **Base data**: LGD States + Districts PMTiles from bharatlas.com R2
- **CDN**: `maplibre-gl@4.7.1`, `pmtiles@3.2.1`
- **PMTiles URL**: `https://pub-0429b8e3b5a946e69ea007df844a6f1c.r2.dev/admin/{states,districts}/LGD_{States,Districts}.pmtiles`

## Geocoding (in order of priority)
1. **BharatAtlas LGD villages** — queries `/api/v1/layers/lgd_villages/query` with `vilname11`, computes approximate centroid from `xmin/ymin/xmax/ymax` bounding box
2. **Mappls Search API** — fallback via `https://atlas.mappls.com/api/places/search/json`
3. **API key**: `MAPPLS_MAP_KEY` in config.js (only needed for Mappls fallback)
