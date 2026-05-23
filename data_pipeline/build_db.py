"""Master pipeline: run every ingest script, merge on FIPS, write SQLite.

Usage:
    python -m data_pipeline.build_db
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pandas as pd

from data_pipeline import (
    ingest_acs,
    ingest_aqi,
    ingest_counties,
    ingest_elections,
    ingest_fema,
    ingest_geo,
    ingest_health_rankings,
    ingest_state_policy,
    ingest_weather,
)
# Optional ingest scripts — overlay extra data when available
try:
    from data_pipeline import ingest_elevation  # noqa: F401
    HAS_ELEVATION = True
except ImportError:
    HAS_ELEVATION = False
from data_pipeline.common import PROCESSED

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "counties.sqlite"


def _ensure_fips_str(df: pd.DataFrame) -> pd.DataFrame:
    if "fips" in df.columns:
        df = df.copy()
        df["fips"] = df["fips"].astype(str).str.zfill(5)
    return df


def main() -> None:
    print("== STEP 1: counties (canonical list) ==")
    counties = _ensure_fips_str(ingest_counties.run())

    print("\n== STEP 2: FEMA National Risk Index ==")
    fema = _ensure_fips_str(ingest_fema.run())

    print("\n== STEP 3: MIT Election Lab (2020 presidential) ==")
    elections = _ensure_fips_str(ingest_elections.run())

    print("\n== STEP 4: ACS demographics + housing ==")
    acs = _ensure_fips_str(ingest_acs.run())

    print("\n== STEP 5: weather (state-level stub) ==")
    weather = ingest_weather.run()  # keyed by state

    print("\n== STEP 6: state policy (taxes, LGBTQ) ==")
    state_policy = ingest_state_policy.run()  # keyed by state

    print("\n== STEP 7: geography (coast / mountain distance) ==")
    geo = _ensure_fips_str(ingest_geo.run())

    print("\n== STEP 8: County Health Rankings (crime) ==")
    try:
        crime = _ensure_fips_str(ingest_health_rankings.run())
    except Exception as e:
        print(f"  [warn] CHR ingestion failed ({e}); continuing without crime data")
        crime = pd.DataFrame(columns=["fips", "violent_crime_per_100k"])

    print("\n== MERGE ==")
    df = counties.copy()
    for name, table in [("fema", fema), ("elections", elections), ("acs", acs),
                        ("geo", geo), ("crime", crime)]:
        before = len(df.columns)
        df = df.merge(table, on="fips", how="left")
        print(f"  merged {name}: +{len(df.columns) - before} cols, {df.shape[0]} rows")

    # Broadcast state-level tables to all counties in that state.
    # If a per-county weather table from Open-Meteo exists, prefer it over state-level.
    df = df.merge(weather, on="state", how="left")
    df = df.merge(state_policy, on="state", how="left")
    print(f"  merged weather + state_policy (broadcast): {df.shape[1]} cols")

    # Overlay real EPA AQI per-county over state-broadcast aqi_mean
    aqi_csv = PROCESSED / "aqi.csv"
    if aqi_csv.exists():
        epa = pd.read_csv(aqi_csv, dtype={"fips": str})
        epa["fips"] = epa["fips"].str.zfill(5)
        epa = epa.rename(columns={"aqi_mean": "aqi_mean_epa"})
        df = df.merge(epa, on="fips", how="left")
        df["aqi_mean"] = df["aqi_mean_epa"].combine_first(df["aqi_mean"])
        df = df.drop(columns=["aqi_mean_epa"])
        print(f"  overlaid EPA AQI ({epa['aqi_mean_epa'].notna().sum()} counties from real monitors)")

    # Overlay NOAA HOURLY normals (per-county dew point + sunshine % from ~467
    # first-order stations, IDW to county centroids). These two variables aren't
    # in the annual/seasonal product so we get them from the hourly file.
    noaa_hourly_csv = PROCESSED / "weather_noaa_hourly.csv"
    if noaa_hourly_csv.exists():
        nh = pd.read_csv(noaa_hourly_csv, dtype={"fips": str})
        nh["fips"] = nh["fips"].str.zfill(5)
        nh = nh.rename(columns={c: f"{c}_nh" for c in nh.columns if c != "fips"})
        df = df.merge(nh, on="fips", how="left")
        for col in ("dew_point_f", "sunshine_pct"):
            ncol = f"{col}_nh"
            if ncol in df.columns:
                df[col] = df[ncol].combine_first(df[col])
                df = df.drop(columns=[ncol])
        populated_d = nh["dew_point_f_nh"].notna().sum() if "dew_point_f_nh" in nh.columns else 0
        populated_s = nh["sunshine_pct_nh"].notna().sum() if "sunshine_pct_nh" in nh.columns else 0
        print(f"  overlaid NOAA hourly normals (dew_point: {populated_d}, sunshine: {populated_s} counties)")

    # Overlay NOAA Climate Normals 1991-2020 (per-county via nearest-station IDW)
    # if the CSV exists. This is the best per-county weather source we have.
    noaa_csv = PROCESSED / "weather_noaa.csv"
    if noaa_csv.exists():
        noaa = pd.read_csv(noaa_csv, dtype={"fips": str})
        noaa["fips"] = noaa["fips"].str.zfill(5)
        noaa = noaa.rename(columns={c: f"{c}_noaa" for c in noaa.columns if c != "fips"})
        df = df.merge(noaa, on="fips", how="left")
        for col in ["summer_high_f", "winter_low_f", "annual_precip_in", "annual_snow_in"]:
            ncol = f"{col}_noaa"
            if ncol in df.columns:
                df[col] = df[ncol].combine_first(df[col])
                df = df.drop(columns=[ncol])
        populated = noaa["summer_high_f_noaa"].notna().sum() if "summer_high_f_noaa" in noaa.columns else 0
        print(f"  overlaid NOAA Climate Normals 1991-2020 ({populated} counties)")

    # Also overlay Open-Meteo per-county data where available (older partial cache).
    # NOAA takes precedence; this only fills any gaps NOAA didn't cover.
    county_weather_csv = PROCESSED / "weather_county.csv"
    if county_weather_csv.exists():
        cw = pd.read_csv(county_weather_csv, dtype={"fips": str})
        cw["fips"] = cw["fips"].str.zfill(5)
        cw = cw.rename(columns={c: f"{c}_county" for c in cw.columns if c != "fips"})
        df = df.merge(cw, on="fips", how="left")
        # Fill only where NOAA-derived column is NaN
        for col in ["summer_high_f", "winter_low_f", "dew_point_f",
                    "annual_precip_in", "annual_snow_in", "sunshine_pct"]:
            ccol = f"{col}_county"
            if ccol in df.columns:
                df[col] = df[col].combine_first(df[ccol])
                df = df.drop(columns=[ccol])
        print(f"  filled gaps from Open-Meteo ({len(cw)} rows in cache)")

    # Derive: population density (people per sqmi)
    if "population" in df.columns and "land_area_sqmi" in df.columns:
        df["pop_density"] = (df["population"] / df["land_area_sqmi"]).round(2)

    # Elevation — overlay county centroid elevation from USGS if the CSV exists.
    elevation_csv = PROCESSED / "elevation.csv"
    if elevation_csv.exists():
        elev = pd.read_csv(elevation_csv, dtype={"fips": str})
        elev["fips"] = elev["fips"].str.zfill(5)
        df = df.merge(elev, on="fips", how="left")
        got = df["elevation_ft"].notna().sum()
        print(f"  merged elevation ({got} counties populated)")
    else:
        df["elevation_ft"] = float("nan")

    print(f"\nFinal: {df.shape[0]} rows, {df.shape[1]} columns")
    DB.parent.mkdir(parents=True, exist_ok=True)
    if DB.exists():
        DB.unlink()
    with sqlite3.connect(DB) as conn:
        df.to_sql("counties", conn, index=False)
        conn.execute("CREATE INDEX idx_counties_fips ON counties(fips)")
        conn.execute("CREATE INDEX idx_counties_state ON counties(state)")
    print(f"\n  -> wrote {DB}  ({DB.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
