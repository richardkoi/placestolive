"""USGS Elevation Point Query Service — county-centroid elevation in feet.

Free, no API key. Endpoint:
  https://epqs.nationalmap.gov/v1/json?x={lon}&y={lat}&units=Feet

We cache per-FIPS to data/raw/elevation/*.json so re-running is cheap.
US-only (TNM doesn't cover HI/AK Aleutians well — those get NaN gracefully).

Run as:
    python -m data_pipeline.ingest_elevation
"""
from __future__ import annotations

import json
import time

import pandas as pd
import requests

from data_pipeline.common import PROCESSED, RAW, fips5

URL = "https://epqs.nationalmap.gov/v1/json"
CACHE_DIR = RAW / "elevation"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def fetch_one(fips: str, lat: float, lon: float) -> float | None:
    cache = CACHE_DIR / f"{fips}.json"
    if cache.exists() and cache.stat().st_size > 20:
        data = json.loads(cache.read_text())
    else:
        try:
            r = requests.get(
                URL,
                params={"x": lon, "y": lat, "units": "Feet"},
                timeout=15,
            )
            if r.status_code != 200:
                return None
            data = r.json()
            cache.write_text(json.dumps(data))
        except Exception:
            return None
    v = data.get("value")
    if v is None or v == -1000000:   # USGS sentinel for "no data"
        return None
    try:
        return round(float(v), 1)
    except Exception:
        return None


def run() -> pd.DataFrame:
    counties = pd.read_csv(PROCESSED / "counties.csv", dtype={"fips": str})
    counties["fips"] = counties["fips"].apply(fips5)
    counties = counties.dropna(subset=["lat", "lon"])

    out_rows = []
    n = len(counties)
    cached = len(list(CACHE_DIR.glob("*.json")))
    print(f"  fetching elevation for {n} counties (cached: {cached})")
    last_log = time.time()
    for i, row in enumerate(counties.itertuples()):
        elev = fetch_one(row.fips, float(row.lat), float(row.lon))
        out_rows.append({"fips": row.fips, "elevation_ft": elev})
        # Light pacing — USGS doesn't publish a rate-limit but be polite
        time.sleep(0.05)
        if time.time() - last_log > 5:
            print(f"  ... {i+1}/{n} ({(i+1)/n*100:.1f}%)")
            last_log = time.time()

    df = pd.DataFrame(out_rows)
    dest = PROCESSED / "elevation.csv"
    df.to_csv(dest, index=False)
    got = df["elevation_ft"].notna().sum()
    print(f"  -> {dest}  ({len(df)} rows, {got} populated)")
    return df


if __name__ == "__main__":
    run()
