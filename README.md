# Sense of The House (SoTH)

A web platform that visualizes the **SOTH superset landscape** — themes, sub-parameters, organizations, villages and maturity — across India on a Mappls / MapMyIndia powered map, with deep-zoom analytics, comparative dashboards and a Partner login.

> Architecture mirrors [LPAT](https://github.com/tanmaymukherji/LPAT) and [gre-mis-dashboard](https://github.com/tanmaymukherji/gre-mis-dashboard):
> vanilla HTML / CSS / JS frontend, Supabase (Postgres + Auth + RLS), GitHub Pages hosting, CDN-loaded Supabase JS + Mappls SDK, single `config.example.js` → `config.js` pattern.

---

## Quick start

1. **Create a Supabase project** and run migrations in `supabase/migrations/` (in order, by filename).
2. **Seed the database** with `node scripts/seed.mjs` (inserts themes, parameters, partner seed coverage from the two CSVs at repo root: `../SOTH parameters- Superset.csv` & `../SOTH places list.csv`).
3. **Geocode villages** by running `node scripts/geocode.mjs` (queries Mappls text-search and backfills `lat/lng`).
4. **Bootstrap first admin** by running `node scripts/bootstrap-admin.mjs --email <email>` then register with that same email in the UI on first visit.
5. **Configure** by copying `config.example.js` → `config.js` and filling in your Supabase URL/anon key + Mappls key.
6. **Serve locally** with `python -m http.server 8080` (or any static server).
7. **Deploy** to GitHub Pages via `.github/workflows/deploy-pages.yml`.

---

## Project Structure

```
soth/
├── config.example.js               # Template config (commit-safe)
├── config.js                       # Real config (git-ignored)
├── index.html                      # Public landing page (India map)
├── login.html                      # Auth: login/signup/forgot
├── dashboard.html                  # Partner dashboard
├── village.html                    # Village workspace (capture + history)
├── compare.html                    # Compare view
├── superset.html                   # Superset browser
├── admin.html                      # Admin console
├── app/
│   ├── core.js                     # Supabase init, auth helpers
│   ├── map.js                      # Mappls loader + map rendering
│   ├── superset.js                 # Superset / partner coverage data
│   ├── capture.js                  # Capture workspace + history
│   ├── admin.js                    # Admin console
│   ├── ui.js                       # Shared UI helpers
│   └── maturity.js                 # Maturity computation
├── styles/
│   └── app.css                     # Application styling
├── data/
│   └── lgd.js                      # Local Government Directory (states + districts)
├── supabase/
│   ├── config.toml                 # Supabase CLI project metadata
│   └── migrations/                 # SQL migrations (run in order)
├── scripts/                        # Node-based seeders & admin tools
│   ├── seed.mjs
│   ├── geocode.mjs
│   └── bootstrap-admin.mjs
├── .github/workflows/
│   └── deploy-pages.yml
├── .nojekyll
└── README.md
```

---

## Roles

- **`partner`** — Can capture data for their own villages, propose new sub-parameters.
- **`partner_admin`** — Same as partner + create partner users.
- **`soth_admin`** — Manages themes/parameters/orgs/users globally, approves proposed sub-parameters, edits any data.

---

## License

Internal use.
