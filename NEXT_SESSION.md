# placestolive — Session Handoff

## Latest session (2026-05-22 part 2)
Major build session. Highlights:
- **Adversarial review** completed by 3 parallel agents (scoring / pipeline / frontend) — see triaged list below
- **All top-priority bugs fixed:** Census suppression sentinels, Alaska election broadcast, HI/AK coast distances, Great Lakes anchors, scoring NaN handling, frontend race conditions, missing FIELD_LABELS, DEPLOYMENT.md drift, lru_cache → mtime invalidation, dimension renames
- **Continental US toggle** (default on; excludes AK + HI)
- **"Find similar counties" feature** — k-NN via the same scoring engine, with prefs-weighted similarity. Click a county or use the header search box to anchor
- **City labels on the map** — 400 cities from SimpleMaps, zoom-tiered (≥500k always, then ≥250k at zoom 4.5, etc.)
- **Weather UX redesign** — switched range dims (summer high, winter low, rain, home price) to two-handle min/max sliders; switched one-sided dims (snow, sunshine, dew point, AQI, distances) to threshold + direction. Inside range / past threshold = 100, outside = hard-excluded
- **County-level weather pipeline** (Open-Meteo): `ingest_weather_openmeteo.py` fetches per-county climate normals. Currently running in background — see "In progress" below
- **"Rich's Preferences" preset checkbox** — toggles between blank defaults and Rich's snapshot

## In progress
- **Open-Meteo per-county fetch** — was at 212/3144 last check, slow due to free-tier rate limits (600/min). Background task `b6z5uhrlx` is running. Once complete: re-run `python -m data_pipeline.build_db` to overlay county-level data over the state-level fallback. Server auto-detects mtime change.

## Test coverage (added 2026-05-22)
- **73 pytest tests passing in 2 seconds:** `tests/test_scoring.py` (32), `tests/test_api.py` (17), `tests/test_pipeline.py` (24)
- **6 Playwright E2E smoke tests passing in ~12 seconds:** `app/e2e/smoke.spec.ts`
- **UAT manual checklist** at `docs/UAT.md` (12 scenario groups, ~50 checkboxes — covers what the automated suite can't)
- **Run automated suite:** `venvs\placestolive\Scripts\python.exe -m pytest tests/ -v` + `cd app && npm run test:e2e`

## Saved plans for later
- **`PHP_PORT_PLAN.md`** — full plan for porting the app to PHP + MySQL on DreamHost shared hosting (FastAPI doesn't run there since Passenger was retired in 2024). Includes architecture diagram, schema, endpoint specs, time estimate (~10 hrs), trade-offs vs the full-static alternative. **Not started.** Rich's call which deployment route to take.

## Deployment status
- **DreamHost shared CAN'T run the FastAPI backend** (per `docs/dreamhost-tech-stacks.md` — Passenger removed March 2024). Two viable paths:
  - **A. Port to full static** — rewrite scoring in TypeScript, ship counties.sqlite as JSON. ~4-6 hrs. Cleanest for personal exploration tool.
  - **B. Port to PHP + MySQL** — see `PHP_PORT_PLAN.md`. ~10 hrs. Better if you want server-side features later.

## Known gaps still open
1. **Open-Meteo finish + re-build_db** — when background fetch lands
2. **AQI is still state-level** — fix: EPA AirNow per-county API (deferred)
3. **`diversity_pct` excludes Hispanic ethnicity** — using race-only (B02001). To fix: switch to B03002 ("Hispanic or Latino by Race"). Deferred, semantic change
4. **Anchor-city autocomplete** in the score panel (the CountySearch component is wired for similarity mode, but the anchor-city radius filter in /api/score still expects a CSV that doesn't exist)
5. **TopoJSON ships ~3.2 MB** uncompressed — could simplify with mapshaper for faster page loads
6. **Bundle size ~1.2 MB** — code-split MapLibre / dimensions if it ever feels slow

## How to Run
```
start.bat                       :: dev: uvicorn --reload on :8500
scripts\install-service.bat     :: always-on Windows Service (Admin)
```
Then open http://127.0.0.1:8500.

For frontend HMR (optional): `cd app && npm run dev` → http://127.0.0.1:5173 (proxies /api to :8500).

## How to rebuild data
```
venvs\placestolive\Scripts\python.exe -m data_pipeline.build_db
```
Per-county Open-Meteo fetch (only needed to refresh weather):
```
venvs\placestolive\Scripts\python.exe -m data_pipeline.ingest_weather_openmeteo
```

## Architecture decision log (cumulative)
- **No Docker** — native venv + single-process FastAPI, mirrors littleBrother
- **Election data via GitHub mirror** (`tonmcg/US_County_Level_Election_Results_08-24`), not MIT Election Lab — Harvard Dataverse blocks automated downloads with a guestbook. Alaska boroughs broadcast statewide (tonmcg uses State House Districts for AK)
- **FEMA NRI via ArcGIS Feature Service** (paginated `services.arcgis.com/XG15cJAlne2vxtgt/.../FeatureServer/0/query`) — legacy hazards.fema.gov download portal retired in 2025
- **Crime = homicide + firearm deaths**, not violent crime rate — CHR 2024 dropped that column
- **County-level GeoJSON** from `plotly/datasets/geojson-counties-fips.json` (lon/lat), not us-atlas (which is Albers pixel-projected and would not render in MapLibre)
- **Range/threshold UX with hard exclusion** — user explicitly chose "the range IS the hard cutoff" pattern. Out-of-range counties drop out entirely (composite signal comes from one-sided dims where there's actual gradient within survivors)

## Blockers
- None
