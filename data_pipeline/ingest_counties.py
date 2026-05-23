"""Seed every other source with the canonical county list.

Source: Census Bureau county gazetteer (TIGER/Line), includes name, state,
land area, lat/lon centroid. ~3,143 rows.
"""
from __future__ import annotations

import zipfile

import pandas as pd

from data_pipeline.common import (
    PROCESSED, RAW, STATE_ABBR_TO_NAME, STATE_FIPS_TO_ABBR, download, fips5,
)

# Census 2024 county gazetteer (tab-delimited, includes centroid lat/lon)
URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip"


def run() -> pd.DataFrame:
    zip_path = download(URL, RAW / "2024_Gaz_counties_national.zip")
    with zipfile.ZipFile(zip_path) as zf:
        inner = [n for n in zf.namelist() if n.endswith(".txt")][0]
        with zf.open(inner) as f:
            df = pd.read_csv(f, sep="\t", encoding="latin-1")

    df.columns = [c.strip() for c in df.columns]
    out = pd.DataFrame({
        "fips": df["GEOID"].apply(fips5),
        "county_name": df["NAME"].str.strip(),
        "state": df["USPS"].str.strip(),
        "land_area_sqmi": df["ALAND_SQMI"],
        "lat": df["INTPTLAT"],
        "lon": df["INTPTLONG"],
    })
    out["state_fips"] = out["fips"].str[:2]
    out["state_name"] = out["state"].map(STATE_ABBR_TO_NAME)

    # Keep only 50 states + DC
    out = out[out["state"].isin(STATE_ABBR_TO_NAME)].reset_index(drop=True)

    dest = PROCESSED / "counties.csv"
    out.to_csv(dest, index=False)
    print(f"  -> {dest}  ({len(out)} rows)")
    return out


if __name__ == "__main__":
    run()
