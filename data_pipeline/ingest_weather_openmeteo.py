"""Per-county weather climatology from Open-Meteo's free historical archive.

Fixes the state-level coarseness in ingest_weather.py — Arizona desert (Tucson)
and Arizona mountains (Flagstaff) get different values, not the same.

For each county centroid, fetch 5 summers (Jun-Aug) and 5 winters (Dec-Feb) of
daily data, then aggregate:
  summer_high_f  = mean of daily Tmax across Jun-Aug 2020-2024
  winter_low_f   = mean of daily Tmin across Dec-Feb 2019-2024
  dew_point_f    = mean of daily dewpoint across Jun-Aug 2020-2024
  annual_precip_in = mean annual precipitation 2020-2024
  annual_snow_in   = mean annual snowfall 2020-2024
  sunshine_pct     = mean ratio of sunshine_duration to daylight_duration 2020-2024

Open-Meteo is free, no API key, 10k calls/day soft limit. We cache per-county
JSON to data/raw/openmeteo/<fips>.json so re-running is cheap.

Run as:
    python -m data_pipeline.ingest_weather_openmeteo
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pandas as pd
import requests

from data_pipeline.common import PROCESSED, RAW, fips5

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
CACHE_DIR = RAW / "openmeteo"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Five-year window of climate-relevant daily aggregates
START = "2019-09-01"  # gives us 5 winters incl. Dec 2019-Feb 2020
END = "2024-08-31"

DAILY_VARS = ",".join([
    "temperature_2m_max",
    "temperature_2m_min",
    "dew_point_2m_mean",
    "precipitation_sum",
    "snowfall_sum",
    "sunshine_duration",
    "daylight_duration",
])


def fetch_county(fips: str, lat: float, lon: float) -> tuple[dict, bool]:
    """Returns (data, from_cache). from_cache=True means no network call was made."""
    cache = CACHE_DIR / f"{fips}.json"
    if cache.exists() and cache.stat().st_size > 1000:
        return json.loads(cache.read_text()), True
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": START,
        "end_date": END,
        "daily": DAILY_VARS,
        "temperature_unit": "fahrenheit",
        "precipitation_unit": "inch",
        "timezone": "America/Chicago",   # one tz for the whole country — fine for daily aggregates
    }
    # Retry-with-backoff on 429 Too Many Requests (free-tier limit is 600/min)
    for attempt in range(6):
        r = requests.get(ARCHIVE_URL, params=params, timeout=60)
        if r.status_code == 429:
            retry_after = r.headers.get("Retry-After")
            wait = int(retry_after) if retry_after and retry_after.isdigit() else 30 * (attempt + 1)
            print(f"  [429] sleeping {wait}s before retry…")
            time.sleep(wait)
            continue
        r.raise_for_status()
        data = r.json()
        if "daily" not in data:
            raise RuntimeError(f"unexpected response for {fips}: {data}")
        cache.write_text(json.dumps(data))
        return data, False
    raise RuntimeError(f"rate-limited too many times for {fips}")


def summarize(data: dict) -> dict:
    d = data["daily"]
    df = pd.DataFrame({
        "date": pd.to_datetime(d["time"]),
        "tmax_f": d["temperature_2m_max"],
        "tmin_f": d["temperature_2m_min"],
        "dewpoint_f": d["dew_point_2m_mean"],
        "precip_in": d["precipitation_sum"],
        "snow_cm": d["snowfall_sum"],
        "sun_sec": d["sunshine_duration"],
        "daylight_sec": d["daylight_duration"],
    })
    df["month"] = df["date"].dt.month
    df["year"] = df["date"].dt.year

    summer = df[df["month"].isin([6, 7, 8])]
    winter = df[df["month"].isin([12, 1, 2])]

    # Annual mean across years (skip incomplete first/last partial years)
    full_years = df.groupby("year").size()
    full = full_years[full_years >= 360].index.tolist()
    by_year = df[df["year"].isin(full)]

    annual_precip_in = by_year.groupby("year")["precip_in"].sum().mean() if len(full) else float("nan")
    # snow comes back in cm from Open-Meteo; convert to inches
    annual_snow_in = by_year.groupby("year")["snow_cm"].sum().mean() / 2.54 if len(full) else float("nan")

    sun_total = by_year["sun_sec"].sum()
    daylight_total = by_year["daylight_sec"].sum()
    sunshine_pct = (sun_total / daylight_total * 100) if daylight_total else float("nan")

    return {
        "summer_high_f":   round(summer["tmax_f"].mean(), 1) if len(summer) else float("nan"),
        "winter_low_f":    round(winter["tmin_f"].mean(), 1) if len(winter) else float("nan"),
        "dew_point_f":     round(summer["dewpoint_f"].mean(), 1) if len(summer) else float("nan"),
        "annual_precip_in": round(annual_precip_in, 1) if pd.notna(annual_precip_in) else float("nan"),
        "annual_snow_in":  round(annual_snow_in, 1) if pd.notna(annual_snow_in) else float("nan"),
        "sunshine_pct":    round(sunshine_pct, 1) if pd.notna(sunshine_pct) else float("nan"),
    }


def run() -> pd.DataFrame:
    counties = pd.read_csv(PROCESSED / "counties.csv", dtype={"fips": str})
    counties["fips"] = counties["fips"].apply(fips5)
    counties = counties.dropna(subset=["lat", "lon"])

    out_rows = []
    n = len(counties)
    print(f"  fetching weather for {n} counties (cached: {len(list(CACHE_DIR.glob('*.json')))})")
    last_log = time.time()
    for i, row in enumerate(counties.itertuples()):
        try:
            data, from_cache = fetch_county(row.fips, float(row.lat), float(row.lon))
        except Exception as e:
            print(f"  [skip] {row.fips} {row.county_name}: {e}", flush=True)
            continue
        try:
            summary = summarize(data)
            summary["fips"] = row.fips
            out_rows.append(summary)
        except Exception as e:
            print(f"  [warn] summarize failed for {row.fips}: {e}", flush=True)
            continue

        # Open-Meteo free tier rate-limits hard. Sleep ONLY after a network call;
        # cache hits skip the sleep so we don't waste time iterating the cached counties.
        if not from_cache:
            time.sleep(0.5)
        if time.time() - last_log > 5:
            print(f"  ... {i+1}/{n} ({(i+1)/n*100:.1f}%)", flush=True)
            last_log = time.time()

    df = pd.DataFrame(out_rows)
    dest = PROCESSED / "weather_county.csv"
    df.to_csv(dest, index=False)
    print(f"  -> {dest}  ({len(df)} rows)")
    return df


if __name__ == "__main__":
    run()
