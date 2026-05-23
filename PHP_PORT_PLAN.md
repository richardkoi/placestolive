# PHP + MySQL Port — Planning Doc

**Status:** Planning only. No code changes yet.

## Why this is viable
DreamHost shared hosting supports PHP 8 + MySQL natively. Same stack as Rich's `clarkstonweather` and `weatherapp` projects, so the deploy pattern is already familiar. No backend hosting cost beyond what DreamHost already charges.

## Target architecture
```
                  ┌──────────────────────────────────────┐
   browser ───▶   │  https://richknitter.com/placestolive │
                  │                                       │
                  │  index.html  ◀──── static React build │
                  │  assets/*.js                          │
                  │  counties.geojson                     │
                  │  cities.geojson                       │
                  │                                       │
                  │  api/score.php       ─┐               │
                  │  api/similar.php      │  PHP 8.x      │
                  │  api/county.php       │  on Apache    │
                  │  api/counties-search.php              │
                  │  api/health.php       ─┘              │
                  │       │                                │
                  │       ▼                                │
                  │  MySQL  (counties table, ~3,144 rows) │
                  └──────────────────────────────────────┘
```

## What stays vs what changes

| Component | Today (FastAPI) | After port |
|---|---|---|
| `data_pipeline/*.py` (FEMA, ACS, etc.) | Python | **Unchanged** — still run locally to refresh data |
| `data/counties.sqlite` | SQLite, served by API | Built locally, exported to MySQL via load script |
| `server/main.py` + `server/scoring.py` | FastAPI + pandas | **Rewritten as PHP** under `api/` |
| `server/schema.py` | Pydantic | PHP request validation (small custom validator) |
| `app/` (React + Vite + TS) | Unchanged | **Unchanged** — same build, just deployed as static |
| `app/src/lib/api.ts` | fetch `/api/*` | **Unchanged** — endpoint paths match |
| `start.bat`, shawl service | Local dev only | Same locally; replaced by PHP server in dev |

## MySQL schema
One table mirroring the SQLite schema:

```sql
CREATE TABLE counties (
  fips                       VARCHAR(5) PRIMARY KEY,
  county_name                VARCHAR(80) NOT NULL,
  state                      CHAR(2) NOT NULL,
  state_name                 VARCHAR(40),
  lat                        DECIMAL(9,6),
  lon                        DECIMAL(9,6),
  land_area_sqmi             DECIMAL(10,2),

  -- politics
  dem_share_pct              DECIMAL(5,2),
  gop_share_pct              DECIMAL(5,2),

  -- demographics + cost (ACS)
  population                 INT,
  pop_density                DECIMAL(10,2),
  median_age                 DECIMAL(4,1),
  diversity_pct              DECIMAL(5,2),
  bachelors_pct              DECIMAL(5,2),
  median_home_value          INT,
  median_rent                INT,
  median_household_income    INT,
  property_tax_pct           DECIMAL(6,3),
  state_income_tax_pct       DECIMAL(5,2),
  lgbtq_policy_score         SMALLINT,

  -- crime
  homicide_per_100k          DECIMAL(6,2),
  firearm_deaths_per_100k    DECIMAL(6,2),

  -- FEMA hazards
  fema_risk_score            DECIMAL(5,2),
  fema_hurricane             DECIMAL(5,2),
  fema_tornado               DECIMAL(5,2),
  fema_wildfire              DECIMAL(5,2),
  fema_flood                 DECIMAL(5,2),
  fema_earthquake            DECIMAL(5,2),
  fema_heat                  DECIMAL(5,2),
  fema_winter_weather        DECIMAL(5,2),
  fema_drought               DECIMAL(5,2),

  -- weather (Open-Meteo per-county + state-level fallback)
  summer_high_f              DECIMAL(5,1),
  winter_low_f               DECIMAL(5,1),
  dew_point_f                DECIMAL(5,1),
  annual_precip_in           DECIMAL(5,1),
  annual_snow_in             DECIMAL(5,1),
  sunshine_pct               DECIMAL(5,1),
  aqi_mean                   SMALLINT,

  -- geography
  dist_to_coast_mi           DECIMAL(6,1),
  dist_to_mountains_mi       DECIMAL(6,1),
  elevation_ft               DECIMAL(7,1),

  KEY idx_state (state),
  KEY idx_dem (dem_share_pct),
  KEY idx_home (median_home_value)
);
```

Total size: ~1 MB. Negligible for shared MySQL.

## API endpoints (PHP)

All endpoints accept JSON via `Content-Type: application/json` and return JSON. CORS headers set centrally via `api/_common.php`.

| Endpoint | Method | Body / params | Returns |
|---|---|---|---|
| `api/score.php`              | POST | `ScoreRequest` JSON                          | `ScoreResponse` |
| `api/similar.php`            | POST | `SimilarRequest` JSON                        | `ScoreResponse` |
| `api/county.php?fips=06037`  | GET  | `fips` query param                           | one county dict |
| `api/counties-search.php?q=ashe` | GET | `q` query param                          | array of `{fips, county_name, state}` |
| `api/health.php`             | GET  | —                                            | `{status, counties}` |

Frontend's `app/src/lib/api.ts` already calls these paths — no changes needed there.

## Scoring engine in PHP

Pure-PHP port of `server/scoring.py`. Key functions:

```php
function match_linear_target(array $values, float $target, float $decay): array
function match_percentile(array $values, string $better): array
function match_range(array $values, float $lo, float $hi): array
function match_one_sided(array $values, float $threshold, float $best, string $direction): array
function match_categorical_lean(array $values, string $lean_key): array

function score(array $req, array $counties): array
function similar(array $req, array $counties): array
```

`$counties` is loaded once per request via `SELECT * FROM counties` (3,144 rows × 42 cols ≈ 1 MB). Fast enough to read fresh every request; no need for a cache layer.

**Performance estimate:** ~50 ms per request on shared hosting (single query, in-PHP scoring loop over 3,144 × 25 dims = 78k operations).

## File layout on DreamHost
```
richknitter.com/placestolive/
├── index.html                  ← React build
├── assets/
│   ├── index-xxxx.js
│   └── index-xxxx.css
├── counties.geojson            ← shipped from app/public/
├── cities.geojson
├── favicon.svg
├── api/
│   ├── _common.php             ← DB connection, CORS, JSON helpers
│   ├── _scoring.php            ← scoring engine functions
│   ├── score.php
│   ├── similar.php
│   ├── county.php
│   ├── counties-search.php
│   └── health.php
└── .htaccess                   ← URL rewrite for SPA (optional)
```

DB credentials read from environment via `getenv("PLACESTOLIVE_DB_HOST")` etc. — DreamHost panel sets these per-domain.

## Dev workflow
1. **Local dev** — install PHP 8 (via XAMPP or `winget install PHP.PHP`). Run `php -S 127.0.0.1:8500 -t app/dist` to serve the built frontend + PHP. Frontend HMR continues via `npm run dev` proxying to `:8500`.
2. **Schema + data refresh** — `python -m data_pipeline.build_db` produces `counties.sqlite` as today. New `data_pipeline/export_to_mysql.py` reads it and emits `counties.sql` (CREATE + INSERTs). Locally that imports to a local MySQL via XAMPP; on deploy, the same `counties.sql` is piped into DreamHost MySQL via SSH.
3. **Deploy** — `rsync` `app/dist/`, `api/`, `.htaccess`, and the `counties.sql` to `richknitter.com/placestolive/`. Then `ssh dreamhost mysql -u user -p db < counties.sql` to load fresh data.

## Build plan / time estimate

| Phase | Work | Est. hrs |
|---|---|---|
| 1. MySQL schema + data load | Write `data_pipeline/export_to_mysql.py` (SQLite → SQL dump); test local MySQL import | 1 |
| 2. PHP scoring engine | Port `server/scoring.py` → `api/_scoring.php`; line-by-line, handle 5 modes (linear_target, percentile, categorical, range, one_sided); ~300 lines of PHP | 3 |
| 3. PHP endpoints | Each of score / similar / county / counties-search / health — wraps scoring engine + JSON handling | 2 |
| 4. Local PHP dev setup | Install PHP, configure to serve static + API | 1 |
| 5. End-to-end local testing | Verify every endpoint matches FastAPI behavior (regression tests on known prefs) | 1 |
| 6. DreamHost setup | Create MySQL DB in panel, set env vars, run initial schema load via SSH | 1 |
| 7. Deploy + DNS | rsync, .htaccess for clean URLs, verify production | 1 |
| **Total** | | **~10 hrs** |

## Trade-offs vs option A (full static)

| Concern | PHP + MySQL | Full static (in-browser scoring) |
|---|---|---|
| Hosting cost | $0 (existing DreamHost) | $0 (existing DreamHost) |
| Deploy effort first time | ~10 hrs | ~4-6 hrs |
| Data refresh cycle | Pipeline → SQLite → export SQL → SSH+import | Pipeline → SQLite → JSON → rsync |
| Page-load weight | ~700 KB (just frontend + geojson) | ~1.5 MB (adds counties.json) |
| Slider responsiveness | 50-200 ms per change (network) | Instant (no network) |
| Works offline | No (needs API) | Yes (after initial load) |
| Future server-side features | Easy to add (user accounts, saved presets, popular searches) | Would require backend |
| Stack consistency | PHP layer feels foreign to the rest of the Python codebase | Pure TypeScript matches existing frontend |
| Debuggability | phpMyAdmin for ad-hoc queries; PHP logs in DreamHost panel | Browser DevTools only |

## Open questions before building

1. **MySQL database name** — DreamHost panel; we'd create one specifically for placestolive. Name suggestion: `placestolive` or `richknitter_placestolive`.
2. **Subdomain or subdirectory** — `richknitter.com/placestolive/` (subdirectory, simplest) or `placestolive.richknitter.com` (subdomain, cleaner URLs, requires DNS).
3. **Open-Meteo cache** — the 3,000+ raw JSONs stay local; only the processed values go to MySQL. ~1 MB total there.
4. **Future ambitions** — if there's any plan to add user accounts, saved profiles, or sharing/social features later, PHP+MySQL wins. If this stays a one-person tool, option A wins on pure simplicity.

## My recommendation
**Option A (full static) is still the better fit unless you want server-side features later.** The PHP port is ~2x the work and adds infrastructure (MySQL, env vars, SSH-based data loads) for marginal benefit. The dataset is small enough (1 MB compressed) that shipping it client-side is the cleaner architecture.

That said, PHP+MySQL is fully viable and uses a stack you already know.
