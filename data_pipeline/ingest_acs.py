"""Census American Community Survey 5-year — county demographics + housing.

Uses Census API. As of 2024 a free key is REQUIRED for every request.
Set the CENSUS_API_KEY environment variable; get one at:
  https://api.census.gov/data/key_signup.html

If no key is set, this script writes an empty CSV and the merge step skips
these columns (housing, demographics, education, age, diversity).

Variables (latest 5-year vintage):
  B01003_001E - total population
  B25077_001E - median home value
  B25064_001E - median gross rent
  B25103_001E - median real estate taxes paid
  B19013_001E - median household income
  B01002_001E - median age
  B03002_001E - total for Hispanic/Latino by race
  B03002_003E - White alone, not Hispanic or Latino
  B15003_001E - total 25+
  B15003_022E + ..025E - bachelor's degree or higher count

`diversity_pct` is computed as 100 - (% Non-Hispanic White alone), which
correctly accounts for Hispanic ethnicity (B02001 alone would undercount
diversity in heavily-Hispanic counties).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd
import requests

from data_pipeline.common import PROCESSED, RAW, fips5

ACS_YEAR = 2023  # 5-year vintage; bump when newer release lands
VARS = [
    "B01003_001E", "B25077_001E", "B25064_001E", "B25103_001E",
    "B19013_001E", "B01002_001E",
    "B03002_001E", "B03002_003E",
    "B15003_001E", "B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E",
]
URL_FMT = (
    "https://api.census.gov/data/{year}/acs/acs5?get={vars}"
    "&for=county:*&in=state:*&key={key}"
)

EMPTY_COLUMNS = [
    "fips", "population", "median_home_value", "median_rent",
    "median_household_income", "median_age", "diversity_pct",
    "bachelors_pct", "property_tax_pct",
]


def run() -> pd.DataFrame:
    cache = RAW / f"acs_{ACS_YEAR}.json"
    if cache.exists():
        print(f"  [cache] {cache.name}")
        data = json.loads(cache.read_text())
    else:
        key = os.environ.get("CENSUS_API_KEY")
        if not key:
            print("  [skip] CENSUS_API_KEY not set; ACS columns will be empty.")
            print("         Get a free key at https://api.census.gov/data/key_signup.html")
            empty = pd.DataFrame(columns=EMPTY_COLUMNS)
            empty.to_csv(PROCESSED / "acs.csv", index=False)
            return empty
        url = URL_FMT.format(year=ACS_YEAR, vars=",".join(VARS), key=key)
        print(f"  [download] Census ACS {ACS_YEAR} 5-year (with key)")
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        data = r.json()
        cache.write_text(json.dumps(data))

    cols = data[0]
    rows = data[1:]
    df = pd.DataFrame(rows, columns=cols)

    # FIPS = state + county (Census API returns them split)
    df["fips"] = (df["state"].astype(str).str.zfill(2) + df["county"].astype(str).str.zfill(3)).apply(fips5)

    # Census uses sentinel values for suppressed/unavailable data — strip them before any math.
    SUPPRESSED = {-666666666, -999999999, -888888888, -222222222, -333333333,
                  -555555555, -111111111}
    def num(c):
        s = pd.to_numeric(df[c], errors="coerce")
        return s.where(~s.isin(SUPPRESSED))

    out = pd.DataFrame({
        "fips": df["fips"],
        "population":         num("B01003_001E"),
        "median_home_value":  num("B25077_001E"),
        "median_rent":        num("B25064_001E"),
        "median_tax_paid":    num("B25103_001E"),
        "median_household_income": num("B19013_001E"),
        "median_age":         num("B01002_001E"),
    })

    # Diversity = 100 - (% Non-Hispanic White alone).
    # B03002_001E = total population (Hispanic-aware table).
    # B03002_003E = White alone, not Hispanic or Latino.
    total_pop_b03002 = num("B03002_001E")
    nh_white = num("B03002_003E")
    out["diversity_pct"] = ((1 - nh_white / total_pop_b03002) * 100).round(2)

    total_25 = num("B15003_001E")
    bach_plus = sum(num(c) for c in ["B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E"])
    out["bachelors_pct"] = (bach_plus / total_25 * 100).round(2)

    # Effective property tax % = median_tax_paid / median_home_value.
    valid = out["median_home_value"] > 0
    out["property_tax_pct"] = (
        (out["median_tax_paid"] / out["median_home_value"] * 100).where(valid).round(3)
    )
    out = out.drop(columns=["median_tax_paid"])

    dest = PROCESSED / "acs.csv"
    out.to_csv(dest, index=False)
    print(f"  -> {dest}  ({len(out)} rows)")
    return out


if __name__ == "__main__":
    run()
