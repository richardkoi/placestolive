# placestolive — Session Handoff

## 🚀 LIVE
**Production:** https://www.richknitter.com/placestolive/
**GitHub:** https://github.com/richardkoi/placestolive (public, master)
**Deployed:** 2026-05-22 (full-static via scp to DreamHost)

## Architecture at a glance
Pure-static SPA — no backend at runtime.
- **Frontend**: React + Vite + TypeScript + Tailwind v4 + MapLibre GL JS
- **Scoring engine**: TypeScript port of original `server/scoring.py`, runs in-browser
- **Data**: `counties.json` (740KB raw, 130KB gzipped) shipped alongside the bundle
- **FastAPI backend**: still exists in `server/` — used only for local dev + automated tests
- **Total wire size**: ~1.5MB gzipped (~5MB raw assets including 3.2MB GeoJSON)

## Data coverage
| Source | Coverage |
|---|---|
| NOAA Annual Climate Normals 1991-2020 (summer/winter/precip/snow) | 3,128 of 3,144 |
| NOAA Hourly Climate Normals 1991-2020 (dew_point + sunshine) | 3,144 / 3,144 |
| EPA AQS Annual AQI by County 2024 | 3,105 from real monitors + state-EPA median fill |
| Census ACS 2023 (home_price, rent, income, age, diversity, education) | All counties |
| 2024 election (tonmcg) | All except AK boroughs are statewide-broadcast (3 AK FIPS truly missing) |
| FEMA NRI 2025 (9 hazards, composite + heat wave exposed in UI) | All counties |
| County Health Rankings 2024 (homicide + firearm deaths) | 2,287 / 3,144 (rural counties suppressed by CHR for privacy) |
| USGS Elevation Point Query Service | 3,136 / 3,144 |
| TIGER/Line county centroids | All 3,144 |
| SimpleMaps top 400 US cities (for map labels) | n/a, used as map decoration |

## Done in the latest session
1. **Per-county weather** via NOAA Climate Normals 1991-2020 (annual + hourly products)
2. **EPA AQI per-county** replacing hand-coded state values
3. **USGS elevation populated** (column previously all NULL)
4. **Census ACS refreshed** to 2023 + Hispanic-aware diversity_pct via B03002
5. **3 new filters** added: median_age, population, heat_wave_risk (Disasters and Community groups expanded)
6. **Quiz onboarding flow**: theme picker → per-theme questions → summary preview → apply
7. **Theme system**: light/dark + 7 map palettes (4 fun + 3 colorblind-safe), settings popover
8. **Font size +25%** + slider layout (label/value on one line above, full-width slider)
9. **GitHub repo** + **DreamHost deploy** as full-static (TypeScript scoring port, in-browser data)

## Local dev
```
start.bat            # uvicorn --reload on :8500 (used only for /api/* tests now)
cd app && npm run dev # Vite dev server on :5173 with HMR
```

## How to rebuild data
```
venvs\placestolive\Scripts\python.exe -m data_pipeline.build_db
venvs\placestolive\Scripts\python.exe -m data_pipeline.export_json   # → app/public/counties.json
```

## How to deploy
```
cd app && npm run build
scp -i ~/.ssh/stratus_deploy -r dist/* dh_haa4gt@iad1-shared-b7-42.dreamhost.com:richknitter.com/placestolive/
```
**Caveat:** scp leaves stale files on the server. Long-term, install rsync on Windows
(Git for Windows portable rsync or MSYS2) and use the recipe in `docs/dreamhost.md` with --delete.

## Known open items / future polish
1. **No CI/CD yet** — `docs/dreamhost.md` documents a GitHub Actions workflow but it's not installed in this repo. `git push` doesn't trigger a redeploy. Easy add: `.github/workflows/deploy.yml` runs `npm ci && npm run build && rsync`.
2. **Stale-file accumulation on DreamHost** because scp lacks --delete. Manual cleanup needed when removing files.
3. **CHR crime data has ~1,776 NULL counties** (privacy suppression) — when user enables homicide_rate filter, rural counties may drop out silently.
4. **Open-Meteo per-county weather** (218 cached) was partially fetched then abandoned due to IP rate-limit ban. NOAA Climate Normals replaced this entirely; the 218 cache is now legacy. Could delete `data/raw/openmeteo/` to save ~30MB disk.
5. **Bundle size 1.3MB** (gzipped 340KB) — MapLibre dominates. Could code-split if it ever feels slow.

## Saved plans / docs
- **`docs/BUILD_YOUR_OWN.md`** — narrative + prompt patterns for replicating this app. Linked from /docs.html in the live site.
- **`docs/UAT.md`** — 12-group manual test checklist for pre-deploy verification.
- **`PHP_PORT_PLAN.md`** — the alternative deploy path (PHP+MySQL). Not started; not needed unless server-side features become a requirement.

## Test inventory
- **73 pytest backend tests** in `tests/` — scoring engine, API endpoints, pipeline transforms. Run with `venvs/placestolive/Scripts/python.exe -m pytest tests/ -q`
- **6 Playwright E2E smoke tests** in `app/e2e/smoke.spec.ts` — load, prefs, similar mode, search, continental toggle, preset
- **4 Playwright quiz QA tests** in `app/e2e/quiz-qa.spec.ts` — welcome→theme picker→question→summary→applied flow
- **UAT manual checklist** in `docs/UAT.md`
- Run all automated: `venvs/placestolive/Scripts/python.exe -m pytest tests/ && cd app && npm run test:e2e`

## Architecture decisions (cumulative)
- **Full-static deploy** (not PHP+MySQL) — chosen 2026-05-22 because DreamHost retired Passenger and dataset is small enough to ship to browser. See `PHP_PORT_PLAN.md` for the alternative.
- **NOAA Climate Normals over Open-Meteo** — Open-Meteo's archive endpoint blocked our IP (and ProtonVPN's). NOAA is a one-shot bulk download with no rate limits.
- **In-browser scoring** — eliminates network round-trip per slider change. Instant feedback. ~1ms per re-score.
- **Combined range/threshold as hard cutoff** — user explicitly chose this UX over "soft preference + separate hard limit". Out-of-range counties are excluded from results.
- **No Docker** — native venv + Vite. Mirrors littleBrother pattern.
- **Aliasing in MapView** for CT planning regions / AK borough renames — old GeoJSON FIPS map to new DB FIPS via a hand-curated table.

## Suggested next session
Quick wins (any could go solo):
- **GitHub Actions workflow** to auto-deploy on push to master (~30 min)
- **Code-split MapLibre** to shrink initial bundle below 500KB warning threshold
- **Replace scp with rsync** locally (install via MSYS2 or use WSL) for clean deploys with --delete
- **Track Open-Meteo IP ban** — retry the archive endpoint occasionally; if it's lifted, fill in any NOAA gaps (currently NOAA covers 99.5%)
- **Add an "explore by region" mode** as a counterpart to "similar" — show a heatmap of one specific metric across the map

Bigger investments (would be their own session):
- **Save user presets to localStorage** (named profiles) — already plumbed for "Rich's Preferences" hardcoded one
- **Walkability + school quality** — would need EPA Smart Location Database + GreatSchools/NCES, ~3 hrs of pipeline work each
- **Mobile-responsive layout** — currently desktop-only by design
- **County-level dew point from NOAA hourly normals** is already done; could expand to derived metrics like "feels-like" or heat index
