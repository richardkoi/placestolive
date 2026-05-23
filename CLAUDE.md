# placestolive — Project Context

## What this is
A US-wide "where should I live?" recommender. The user inputs personal preferences across multiple dimensions (climate, politics, cost of living, crime, demographics, natural disaster risk, geography), and the app returns a ranked list of ~3,143 US counties best matching those preferences — visualized as a heatmap and a top-N list, with click-through detail. Personal exploration tool, deployed to richknitter.com/placestolive.

See `C:\Users\richa\.claude\plans\elegant-zooming-yeti.md` for the full MVP plan.

## Tech stack
- **Backend:** Python 3.11+, FastAPI, Pydantic, SQLite (read-only at runtime). Single process — FastAPI serves the built React app as static files AND the `/api/*` routes on one port (`8500`). Same pattern as littleBrother.
- **Frontend:** React + Vite + TypeScript + Tailwind, MapLibre GL JS (choropleth). Built artifacts live in `app/dist/` and are served by FastAPI in production.
- **Data pipeline:** Python scripts (pandas) — offline ingestion of NOAA, MIT Election Lab, Zillow, FBI NIBRS, FEMA NRI, Census ACS, TIGER/Line
- **DB:** SQLite — single denormalized `counties` table keyed by 5-digit FIPS
- **Runtime:** Native venv (`venvs/placestolive/`). No Docker.
  - **Always-on:** installed as Windows Service `placestolive` via [shawl](https://github.com/mtkennerly/shawl) (`scripts\install-service.bat`). Auto-starts on boot. Same pattern as littleBrother.
  - **Dev:** `start.bat` runs uvicorn with `--reload` directly.
- **Tests:** pytest (pipeline + scoring), Vitest (frontend)

## How to run
**Install as a service (recommended — set-and-forget):**
```
scripts\install-service.bat    :: run as Administrator
net start placestolive
net stop placestolive
```
Open http://127.0.0.1:8500. Auto-starts on boot.

**Dev mode (hot-reload uvicorn on :8500):**
```
start.bat
```
For frontend HMR add a second terminal: `cd app && npm run dev` (Vite on :5173, proxies `/api/*` to :8500).

## Conventions
- Python: ruff for lint+format, mypy optional, pytest for tests
- TS/React: ESLint + Prettier (Vite defaults), Vitest for tests
- FIPS codes are always 5-digit zero-padded strings (e.g. `"06037"` for LA County)
- One ingestion script per data source under `data_pipeline/`; each emits a CSV keyed by FIPS
- All scoring logic lives in `api/scoring.py` as pure functions (easy to unit-test)

## Gotchas
<!-- Fill in as discovered during build -->
