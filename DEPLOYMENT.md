# placestolive — Deployment

## Local

**First-time setup (run once):**
```
python -m venv venvs\placestolive
venvs\placestolive\Scripts\pip install -r server\requirements.txt
cd app && npm install && npm run build
winget install mtkennerly.shawl
```

**Production-like (always-on Windows Service via shawl):**
```
scripts\install-service.bat    :: run as Administrator
net start placestolive
net stop placestolive
scripts\uninstall-service.bat  :: to remove
```
Auto-starts on boot. Same pattern as littleBrother. Open http://127.0.0.1:8500.

**Dev mode (hot-reload uvicorn):**
```
start.bat
```
Add a second terminal for frontend HMR:
```
cd app && npm run dev     :: Vite on :5173, proxies /api/* to :8500
```

## Rebuilding the dataset
```
venvs\placestolive\Scripts\python.exe -m data_pipeline.build_db
```
The server auto-detects `data/counties.sqlite` mtime changes — no restart needed. To force-clear the cache without an mtime change, hit `POST /api/reload`.

## Server (future: DreamHost)
Not deployed publicly yet. The single-process FastAPI + native venv pattern works locally; for `richknitter.com/placestolive/` deployment plan to:
1. Build the frontend: `cd app && npm run build` → static files in `app/dist/`
2. Deploy the FastAPI server (`server.main:app`) as a Passenger Python app or behind reverse proxy
3. Ship `data/counties.sqlite` alongside the API
4. See `D:\googledrive\AI\docs\dreamhost.md` for the canonical DreamHost recipe

## Environment
Runtime needs no secrets — all data is pre-computed into `data/counties.sqlite`.

Pipeline scripts (offline, only needed to refresh data) read from `.env` in project root:
- `CENSUS_API_KEY` — **required** for ACS demographics + housing. Free key at https://api.census.gov/data/key_signup.html (must activate via emailed link)

`.env` is gitignored; never commit it.
