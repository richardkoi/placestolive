"""EPA AQS — Annual AQI by County.

Free, no key. ~996 monitored counties for the latest year. Counties without
a monitor get filled with the state median (from EPA's actual data, not the
hand-coded state-broadcast values in ingest_weather.py).

Source: https://aqs.epa.gov/aqsweb/airdata/annual_aqi_by_county_{year}.zip
"""
from __future__ import annotations

import io
import zipfile

import pandas as pd
import requests

from data_pipeline.common import PROCESSED, RAW, fips5

YEAR = 2024
URL = f"https://aqs.epa.gov/aqsweb/airdata/annual_aqi_by_county_{YEAR}.zip"


def run() -> pd.DataFrame:
    cache = RAW / f"epa_aqi_{YEAR}.zip"
    if not cache.exists():
        print(f"  [download] {URL}")
        r = requests.get(URL, timeout=60)
        r.raise_for_status()
        cache.write_bytes(r.content)
    else:
        print(f"  [cache] {cache.name}")

    with zipfile.ZipFile(cache) as zf:
        with zf.open(zf.namelist()[0]) as f:
            epa = pd.read_csv(f)

    # State + County names → FIPS via counties.csv lookup
    counties = pd.read_csv(PROCESSED / "counties.csv", dtype={"fips": str})
    counties["fips"] = counties["fips"].apply(fips5)
    counties["state_name_lc"] = counties["state_name"].str.lower()
    # Census uses "Foo County", EPA uses "Foo" — strip suffix words to match
    counties["county_name_lc"] = (
        counties["county_name"]
        .str.lower()
        .str.replace(r"\s+(county|parish|borough|census area|municipality|city)$",
                     "", regex=True)
    )

    epa["state_lc"] = epa["State"].str.lower()
    epa["county_lc"] = epa["County"].str.lower()
    merged = epa.merge(
        counties[["fips", "state_name_lc", "county_name_lc", "state"]],
        left_on=["state_lc", "county_lc"],
        right_on=["state_name_lc", "county_name_lc"],
        how="left",
    )

    # Per-county AQI from EPA monitors
    per_county = (
        merged.dropna(subset=["fips"])
        .groupby("fips")
        .agg(aqi_mean=("Median AQI", "mean"))
        .reset_index()
    )
    per_county["aqi_mean"] = per_county["aqi_mean"].round(0).astype(int)

    matched = len(per_county)
    print(f"  matched {matched} counties to EPA monitors")

    # State medians from EPA (better than hand-coded; grounded in real data)
    state_median = (
        merged.dropna(subset=["fips", "state"])
        .groupby("state")["Median AQI"]
        .median()
        .round(0)
        .astype(int)
        .to_dict()
    )

    # Build full county-level output: EPA per-county where available, state-EPA-median fallback
    out = counties[["fips", "state"]].copy()
    out = out.merge(per_county, on="fips", how="left")
    out["aqi_mean"] = out["aqi_mean"].fillna(
        out["state"].map(state_median)
    )
    out = out.drop(columns=["state"])

    populated = out["aqi_mean"].notna().sum()
    dest = PROCESSED / "aqi.csv"
    out.to_csv(dest, index=False)
    print(f"  -> {dest}  ({len(out)} rows, {populated} populated)")
    return out


if __name__ == "__main__":
    run()
