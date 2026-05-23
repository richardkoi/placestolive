"""NOAA Hourly Climate Normals 1991-2020 — per-county dew point + sunshine %.

The annual/seasonal normals (ingest_weather_noaa.py) don't include dew point or
sunshine. Those live in the *hourly* normals product, which has fewer stations
(~467 nationally, vs 15,616 for annuals) but covers exactly what we need:
  HLY-DEWP-NORMAL   — average dew point for each (month, hour-of-day)
  HLY-CLOD-PCTCLR   — % of hours that are CLEAR sky
  HLY-CLOD-PCTFEW   — % of hours with few clouds
  HLY-CLOD-PCTSCT   — % scattered
  HLY-CLOD-PCTBKN   — % broken
  HLY-CLOD-PCTOVC   — % overcast

We aggregate per-station:
  summer_dew_point_f = mean of HLY-DEWP-NORMAL over JJA months
  sunshine_pct       = mean of (PCTCLR + PCTFEW) over daylight hours, all months

Then map to counties via IDW from the 3 nearest stations (with a fallback to
the single nearest if all 3 are >100 mi away).

Source: https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals
"""
from __future__ import annotations

import math
import tarfile

import pandas as pd
import requests

from data_pipeline.common import PROCESSED, RAW, fips5

NORMALS_URL = (
    "https://www.ncei.noaa.gov/data/normals-hourly/1991-2020/archive/"
    "us-climate-normals_1991-2020_v1.0.0_hourly_multivariate_by-station_c20210423.tar.gz"
)
TAR_PATH = RAW / "noaa_normals_hourly_1991-2020.tar.gz"
EXTRACT_DIR = RAW / "noaa_normals_hourly"

K_NEAREST = 3
MAX_DIST_MI = 100   # hourly stations are sparse; loosen the cap


def _haversine(lat1, lon1, lat2, lon2):
    R = 3958.8
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    dlat = lat2r - lat1r
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon/2)**2
    return 2 * R * math.asin(min(1, math.sqrt(a)))


def _download():
    if TAR_PATH.exists() and TAR_PATH.stat().st_size > 100_000_000:
        print(f"  [cache] {TAR_PATH.name}")
        return
    print(f"  [download] {NORMALS_URL} (~222 MB)")
    r = requests.get(NORMALS_URL, timeout=300, stream=True)
    r.raise_for_status()
    with TAR_PATH.open("wb") as f:
        downloaded = 0
        for chunk in r.iter_content(chunk_size=1 << 20):
            f.write(chunk)
            downloaded += len(chunk)
            if downloaded % (20 << 20) == 0:
                print(f"    {downloaded / 1024 / 1024:.0f} MB ...")
    print(f"    saved {TAR_PATH.stat().st_size / 1024 / 1024:.0f} MB")


def _extract():
    if EXTRACT_DIR.exists() and any(EXTRACT_DIR.glob("**/*.csv")):
        n = len(list(EXTRACT_DIR.glob("**/*.csv")))
        print(f"  [cache] extracted ({n} CSVs)")
        return
    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"  [extract] {TAR_PATH.name}")
    with tarfile.open(TAR_PATH, "r:gz") as tf:
        members = [m for m in tf.getmembers() if m.name.endswith(".csv")]
        tf.extractall(EXTRACT_DIR, members=members)
    print(f"    extracted {len(list(EXTRACT_DIR.glob('**/*.csv')))} files")


def _aggregate_station(p) -> dict | None:
    """Read one station CSV and return summer dew point + sunshine % aggregates."""
    try:
        df = pd.read_csv(p)
    except Exception:
        return None
    if df.empty:
        return None
    df.columns = [c.strip('"').strip() for c in df.columns]
    if "STATION" not in df.columns:
        return None

    # Metadata from first row
    first = df.iloc[0]
    try:
        sid = str(first["STATION"]).strip('"').strip()
        lat = float(first["LATITUDE"])
        lon = float(first["LONGITUDE"])
    except (KeyError, ValueError):
        return None

    # DATE column is "MM-DDTHH:MM:SS" — parse out month + hour
    if "DATE" not in df.columns:
        return None
    df["_month"] = pd.to_numeric(df["DATE"].astype(str).str.strip('"').str[:2], errors="coerce")
    df["_hour"] = pd.to_numeric(df["DATE"].astype(str).str.strip('"').str[6:8], errors="coerce")

    def num(col):
        if col not in df.columns:
            return None
        s = pd.to_numeric(df[col], errors="coerce")
        return s.where(s > -999)   # NOAA missing-value sentinel

    dew = num("HLY-DEWP-NORMAL")
    clr = num("HLY-CLOD-PCTCLR")
    few = num("HLY-CLOD-PCTFEW")

    # Summer dew point: rows where month ∈ {6, 7, 8}
    summer_mask = df["_month"].isin([6, 7, 8])
    summer_dew = dew[summer_mask].mean() if dew is not None and summer_mask.any() else None

    # Sunshine %: average of (PCTCLR + PCTFEW) across DAYLIGHT hours (10am-4pm local) and all months.
    # Restricting to peak-daylight hours avoids cloud-cover at night skewing the avg.
    daylight = df["_hour"].between(10, 16)
    if clr is not None and few is not None and daylight.any():
        sun_series = clr.where(clr.notna(), 0) + few.where(few.notna(), 0)
        sunshine_pct = sun_series[daylight].mean()
    else:
        sunshine_pct = None

    return {
        "station": sid, "lat": lat, "lon": lon,
        "summer_dew_point_f": float(summer_dew) if pd.notna(summer_dew) else None,
        "sunshine_pct":       float(sunshine_pct) if pd.notna(sunshine_pct) else None,
    }


def _load_stations() -> pd.DataFrame:
    csv_files = list(EXTRACT_DIR.glob("**/*.csv"))
    if not csv_files:
        raise RuntimeError("No CSV files extracted")
    print(f"  parsing {len(csv_files)} hourly station CSVs ...")
    rows = []
    for i, p in enumerate(csv_files):
        agg = _aggregate_station(p)
        if agg:
            rows.append(agg)
        if (i + 1) % 100 == 0:
            print(f"    ... {i+1}/{len(csv_files)}")
    df = pd.DataFrame(rows)
    # Keep only stations with at least one usable variable
    usable = df["summer_dew_point_f"].notna() | df["sunshine_pct"].notna()
    df = df[usable].reset_index(drop=True)
    print(f"  -> {len(df)} stations with usable hourly data")
    return df


def _aggregate_for_county(lat: float, lon: float, stations: pd.DataFrame) -> dict:
    # Hourly stations are sparse — use a wider bounding box
    box_deg = 250 / 69.0
    candidates = stations[
        (stations["lat"].between(lat - box_deg, lat + box_deg))
        & (stations["lon"].between(lon - box_deg, lon + box_deg))
    ]
    if candidates.empty:
        candidates = stations
    dist = candidates.apply(lambda r: _haversine(lat, lon, r["lat"], r["lon"]), axis=1)
    nearest = candidates.assign(_dist=dist).nsmallest(K_NEAREST * 3, "_dist")
    in_range = nearest[nearest["_dist"] <= MAX_DIST_MI]
    if len(in_range) == 0:
        in_range = nearest.head(1)

    out = {}
    for v in ("summer_dew_point_f", "sunshine_pct"):
        have = in_range[in_range[v].notna()].head(K_NEAREST)
        if have.empty:
            continue
        w = 1.0 / (have["_dist"] + 1)
        out[v] = float((have[v] * w).sum() / w.sum())
    return out


def run() -> pd.DataFrame:
    _download()
    _extract()
    stations = _load_stations()

    counties = pd.read_csv(PROCESSED / "counties.csv", dtype={"fips": str})
    counties["fips"] = counties["fips"].apply(fips5)
    counties = counties.dropna(subset=["lat", "lon"])
    print(f"  mapping {len(counties)} counties to nearest hourly stations ...")

    out = []
    for i, row in enumerate(counties.itertuples()):
        agg = _aggregate_for_county(float(row.lat), float(row.lon), stations)
        out.append({
            "fips": row.fips,
            "dew_point_f": round(agg["summer_dew_point_f"], 1) if "summer_dew_point_f" in agg else None,
            "sunshine_pct": round(agg["sunshine_pct"], 1) if "sunshine_pct" in agg else None,
        })
        if (i + 1) % 500 == 0:
            print(f"    ... {i+1}/{len(counties)}")

    df = pd.DataFrame(out)
    dest = PROCESSED / "weather_noaa_hourly.csv"
    df.to_csv(dest, index=False)
    dewn = df["dew_point_f"].notna().sum()
    sun = df["sunshine_pct"].notna().sum()
    print(f"  -> {dest}  ({len(df)} rows · dew_point: {dewn} · sunshine: {sun})")
    return df


if __name__ == "__main__":
    run()
