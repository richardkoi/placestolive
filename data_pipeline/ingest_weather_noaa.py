"""NOAA Climate Normals 1991-2020 — county-level via nearest-station aggregation.

Downloads NCEI's bulk tar.gz containing 30-year normals for ~10,000 US weather
stations, then maps each county centroid to its 3 nearest stations and averages
by inverse-distance weight.

This is the proper way to populate per-county climate normals when API-based
sources (Open-Meteo, etc.) are blocked or rate-limited. It's a one-time download
and is reproducible without network at the county-mapping stage.

Source: https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals
"""
from __future__ import annotations

import math
import tarfile
from pathlib import Path

import pandas as pd
import requests

from data_pipeline.common import PROCESSED, RAW, fips5

NORMALS_URL = (
    "https://www.ncei.noaa.gov/data/normals-annualseasonal/1991-2020/archive/"
    "us-climate-normals_1991-2020_v1.0.1_annualseasonal_multivariate_by-station_c20230404.tar.gz"
)
TAR_PATH = RAW / "noaa_normals_1991-2020.tar.gz"
EXTRACT_DIR = RAW / "noaa_normals"

# Variables we want from each station's CSV
VARS = [
    "JJA-TMAX-NORMAL",   # summer max temp °F  -> summer_high_f
    "DJF-TMIN-NORMAL",   # winter min temp °F  -> winter_low_f
    "ANN-TAVG-NORMAL",   # annual avg
    "ANN-PRCP-NORMAL",   # annual precipitation in inches
    "ANN-SNOW-NORMAL",   # annual snowfall in inches
    "JJA-TAVG-NORMAL",   # summer avg (used to derive dew-point estimate)
]
K_NEAREST = 3            # number of stations to average per county
MAX_DIST_MI = 60         # ignore stations farther than this; fall back to single nearest


def _haversine(lat1, lon1, lat2, lon2):
    """Miles between two lat/lon points."""
    R = 3958.8
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    dlat = lat2r - lat1r
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon/2)**2
    return 2 * R * math.asin(min(1, math.sqrt(a)))


def _download():
    if TAR_PATH.exists() and TAR_PATH.stat().st_size > 50_000_000:
        print(f"  [cache] {TAR_PATH.name}")
        return
    print(f"  [download] {NORMALS_URL}")
    r = requests.get(NORMALS_URL, timeout=120, stream=True)
    r.raise_for_status()
    with TAR_PATH.open("wb") as f:
        for chunk in r.iter_content(chunk_size=1 << 20):
            f.write(chunk)
    print(f"    saved {TAR_PATH.stat().st_size / 1024 / 1024:.0f} MB")


def _extract():
    if EXTRACT_DIR.exists() and any(EXTRACT_DIR.glob("**/*.csv")):
        n = len(list(EXTRACT_DIR.glob("**/*.csv")))
        print(f"  [cache] extracted ({n} CSVs)")
        return
    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"  [extract] {TAR_PATH.name}")
    with tarfile.open(TAR_PATH, "r:gz") as tf:
        # Only extract the per-station CSVs
        members = [m for m in tf.getmembers() if m.name.endswith(".csv")]
        tf.extractall(EXTRACT_DIR, members=members)
    print(f"    extracted {len(list(EXTRACT_DIR.glob('**/*.csv')))} files")


def _load_stations() -> pd.DataFrame:
    """Walk extracted CSVs, build one row per station with the variables we care about."""
    rows = []
    csv_files = list(EXTRACT_DIR.glob("**/*.csv"))
    if not csv_files:
        raise RuntimeError("No CSV files extracted")
    print(f"  parsing {len(csv_files)} station CSVs ...")
    for i, p in enumerate(csv_files):
        try:
            df = pd.read_csv(p, nrows=1)  # one data row per station
        except Exception:
            continue
        if df.empty:
            continue
        # Strip surrounding quotes from column names (NCEI CSVs are quoted oddly)
        df.columns = [c.strip('"').strip() for c in df.columns]
        row = df.iloc[0]
        try:
            r = {
                "station": str(row["STATION"]).strip('"').strip(),
                "lat": float(row["LATITUDE"]),
                "lon": float(row["LONGITUDE"]),
                "elev_m": float(row["ELEVATION"]) if pd.notna(row["ELEVATION"]) else None,
            }
        except (ValueError, KeyError):
            continue
        if pd.isna(r["lat"]) or pd.isna(r["lon"]):
            continue
        for v in VARS:
            if v in df.columns:
                val = pd.to_numeric(row[v], errors="coerce")
                # NOAA uses sentinel -9999 for missing
                if pd.notna(val) and val > -999:
                    r[v] = float(val)
        rows.append(r)
        if (i + 1) % 1000 == 0:
            print(f"    ... {i+1}/{len(csv_files)}")
    stations = pd.DataFrame(rows)
    # Drop stations with no useful data
    has_any = stations[VARS].notna().any(axis=1)
    stations = stations[has_any].reset_index(drop=True)
    print(f"  -> {len(stations)} stations with usable data")
    return stations


def _aggregate_for_county(lat: float, lon: float, stations: pd.DataFrame) -> dict:
    """Inverse-distance-weighted average of the K nearest stations for each variable."""
    # Cheap pre-filter via bounding box (~80 mi)
    box_deg = 80 / 69.0
    candidates = stations[
        (stations["lat"].between(lat - box_deg, lat + box_deg))
        & (stations["lon"].between(lon - box_deg, lon + box_deg))
    ]
    if candidates.empty:
        candidates = stations  # fall back to full set; will be slow but rare
    # Compute distances
    dist = candidates.apply(
        lambda r: _haversine(lat, lon, r["lat"], r["lon"]), axis=1
    )
    nearest = candidates.assign(_dist=dist).nsmallest(K_NEAREST * 3, "_dist")
    # Cap by max distance unless that empties the set
    in_range = nearest[nearest["_dist"] <= MAX_DIST_MI]
    if len(in_range) == 0:
        in_range = nearest.head(1)   # single nearest as last-resort fallback

    # For each variable, IDW over the K nearest that have data
    out = {}
    for v in VARS:
        if v not in in_range.columns:
            continue
        have = in_range[in_range[v].notna()].head(K_NEAREST)
        if have.empty:
            continue
        weights = 1.0 / (have["_dist"] + 1)   # +1 to avoid div-by-zero
        out[v] = float((have[v] * weights).sum() / weights.sum())
    return out


def run() -> pd.DataFrame:
    _download()
    _extract()
    stations = _load_stations()

    counties = pd.read_csv(PROCESSED / "counties.csv", dtype={"fips": str})
    counties["fips"] = counties["fips"].apply(fips5)
    counties = counties.dropna(subset=["lat", "lon"])
    print(f"  mapping {len(counties)} counties to nearest stations ...")

    out_rows = []
    for i, row in enumerate(counties.itertuples()):
        agg = _aggregate_for_county(float(row.lat), float(row.lon), stations)
        out_rows.append({
            "fips": row.fips,
            "summer_high_f": agg.get("JJA-TMAX-NORMAL"),
            "winter_low_f":  agg.get("DJF-TMIN-NORMAL"),
            "summer_avg_f":  agg.get("JJA-TAVG-NORMAL"),
            "annual_avg_f":  agg.get("ANN-TAVG-NORMAL"),
            "annual_precip_in": agg.get("ANN-PRCP-NORMAL"),
            "annual_snow_in":   agg.get("ANN-SNOW-NORMAL"),
        })
        if (i + 1) % 500 == 0:
            print(f"    ... {i+1}/{len(counties)}")

    df = pd.DataFrame(out_rows)
    # Round for cleanliness
    for col in df.columns:
        if col == "fips":
            continue
        df[col] = df[col].round(1)

    dest = PROCESSED / "weather_noaa.csv"
    df.to_csv(dest, index=False)
    populated = df.drop(columns=["fips"]).notna().any(axis=1).sum()
    print(f"  -> {dest}  ({len(df)} rows, {populated} populated)")
    return df


if __name__ == "__main__":
    run()
