"""County Health Rankings (RWJF) — annual county-level health/crime data.

CHR 2024 dropped the standalone "Violent crime rate" column, so we use the
homicide rate (per 100k) and firearm fatality rate as crime proxies — these
are arguably better signals than self-reported violent crime which is heavily
under-reported.

Source: https://www.countyhealthrankings.org/explore-health-rankings/rankings-data-documentation
File: analytic_data2024.csv
"""
from __future__ import annotations

import pandas as pd

from data_pipeline.common import PROCESSED, RAW, download, fips5

URL = "https://www.countyhealthrankings.org/sites/default/files/media/document/analytic_data2024.csv"


def run() -> pd.DataFrame:
    csv = download(URL, RAW / "chr_analytic_2024.csv")
    # Row 0 is descriptive names, row 1 is variable codes. Use row 0 as header.
    df = pd.read_csv(csv, skiprows=[1], low_memory=False)

    fips_col = "5-digit FIPS Code"
    homicide_col = "Homicides raw value"
    firearm_col = "Firearm Fatalities raw value"

    keep = [c for c in [fips_col, homicide_col, firearm_col] if c in df.columns]
    if fips_col not in keep:
        print("  [warn] no FIPS column in CHR; skipping")
        return pd.DataFrame(columns=["fips", "homicide_per_100k", "firearm_deaths_per_100k"])

    out = pd.DataFrame({"fips": df[fips_col].apply(fips5)})
    if homicide_col in df.columns:
        out["homicide_per_100k"] = pd.to_numeric(df[homicide_col], errors="coerce")
    if firearm_col in df.columns:
        out["firearm_deaths_per_100k"] = pd.to_numeric(df[firearm_col], errors="coerce")

    # Drop state-level (county code 000) and US-level rows
    out = out[~out["fips"].str.endswith("000")]
    out = out.dropna(subset=[c for c in out.columns if c != "fips"], how="all")

    dest = PROCESSED / "crime.csv"
    out.to_csv(dest, index=False)
    print(f"  -> {dest}  ({len(out)} rows)")
    return out


if __name__ == "__main__":
    run()
