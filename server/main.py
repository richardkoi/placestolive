"""FastAPI app: serves React build + /api/* endpoints."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from threading import Lock

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from server.schema import ScoreRequest, ScoreResponse, SimilarRequest
from server.scoring import score, similar

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "counties.sqlite"
DIST_DIR = ROOT / "app" / "dist"
CITIES_CSV = ROOT / "data" / "uscities.csv"

app = FastAPI(title="placestolive", version="0.1.0")

# CORS for Vite dev mode (proxy is preferred but this catches direct calls too)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Cached counties DF, invalidated automatically when counties.sqlite mtime changes
# (so re-running the data pipeline takes effect without a server restart).
_counties_cache: dict = {"df": None, "mtime": 0.0}
_cache_lock = Lock()


def load_counties() -> pd.DataFrame:
    if not DB_PATH.exists():
        raise RuntimeError(
            f"counties.sqlite not found at {DB_PATH}. "
            "Run `python -m data_pipeline.build_db` first."
        )
    mtime = DB_PATH.stat().st_mtime
    with _cache_lock:
        if _counties_cache["df"] is None or _counties_cache["mtime"] != mtime:
            with sqlite3.connect(DB_PATH) as conn:
                df = pd.read_sql_query("SELECT * FROM counties", conn)
            df["fips"] = df["fips"].astype(str).str.zfill(5)
            _counties_cache["df"] = df
            _counties_cache["mtime"] = mtime
        return _counties_cache["df"]


_cities_cache: dict = {"df": None}


def load_cities() -> pd.DataFrame:
    if _cities_cache["df"] is None:
        if not CITIES_CSV.exists():
            _cities_cache["df"] = pd.DataFrame(
                columns=["city", "state_id", "lat", "lng", "population"]
            )
        else:
            _cities_cache["df"] = pd.read_csv(
                CITIES_CSV, usecols=["city", "state_id", "lat", "lng", "population"]
            )
    return _cities_cache["df"]


@app.post("/api/reload")
def reload_counties() -> dict:
    """Force-reload counties.sqlite (clears the cache). Useful after re-running the data pipeline."""
    with _cache_lock:
        _counties_cache["df"] = None
        _counties_cache["mtime"] = 0.0
    df = load_counties()
    return {"reloaded": True, "counties": len(df)}


@app.get("/api/health")
def health() -> dict:
    db_ok = DB_PATH.exists()
    try:
        n = len(load_counties()) if db_ok else 0
    except Exception:
        n = 0
    return {"status": "ok" if db_ok and n > 0 else "degraded", "counties": n, "db": str(DB_PATH)}


@app.get("/api/cities")
def cities(q: str = "", limit: int = 10) -> list[dict]:
    """Autocomplete for anchor-city search. Returns top cities by population matching q."""
    df = load_cities()
    if df.empty:
        return []
    q = q.strip().lower()
    if q:
        mask = df["city"].str.lower().str.startswith(q)
        df = df[mask]
    return (
        df.nlargest(limit, "population")
          .rename(columns={"lng": "lon", "state_id": "state"})
          [["city", "state", "lat", "lon", "population"]]
          .to_dict(orient="records")
    )


@app.post("/api/score", response_model=ScoreResponse)
def post_score(req: ScoreRequest) -> ScoreResponse:
    counties = load_counties()
    return score(req, counties)


@app.post("/api/similar", response_model=ScoreResponse)
def post_similar(req: SimilarRequest) -> ScoreResponse:
    counties = load_counties()
    return similar(req, counties)


@app.get("/api/counties/search")
def counties_search(q: str = "", limit: int = 10) -> list[dict]:
    """Autocomplete county/state by name. Used for the similarity anchor picker."""
    df = load_counties()
    q = q.strip().lower()
    if not q:
        return []
    name_lc = df["county_name"].str.lower()
    state_lc = df["state"].str.lower()
    # Match either county name OR state abbr
    mask = name_lc.str.startswith(q) | (state_lc == q[:2])
    matches = df[mask].head(limit)
    return matches[["fips", "county_name", "state"]].to_dict(orient="records")


@app.get("/api/county/{fips}")
def county_detail(fips: str) -> dict:
    counties = load_counties()
    fips = fips.zfill(5)
    row = counties[counties["fips"] == fips]
    if len(row) == 0:
        raise HTTPException(status_code=404, detail=f"County {fips} not found")
    return row.iloc[0].where(pd.notna(row.iloc[0]), None).to_dict()


# ---- Static SPA serving ----------------------------------------------------
# In production, FastAPI serves the built React app from app/dist.
# In dev, frontend is on :5173 (Vite) and proxies /api/* here.
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # Serve index.html for any non-/api path (SPA fallback)
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        # Static asset under dist (e.g. /counties.topo.json, /favicon.ico)
        candidate = DIST_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_DIR / "index.html")
