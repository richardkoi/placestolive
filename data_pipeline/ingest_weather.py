"""State-level weather climatology — MVP stub.

NOAA county-level climate normals require complex station-to-county aggregation.
For v1 we ship state-level averages hand-coded from NOAA US Climate Normals
1991-2020 and broadcast to all counties in that state. This is approximate —
e.g. Arizona has huge intrastate variation (Tucson vs Flagstaff). Replace with
a county-level source in v2.

Values are pulled from NOAA state climate summaries and PRISM aggregates.
"""
from __future__ import annotations

import pandas as pd

from data_pipeline.common import PROCESSED, fips5

# (summer_high_f, winter_low_f, dew_point_f, annual_precip_in, annual_snow_in, sunshine_pct, aqi_mean)
STATE_CLIMATE = {
    "AL": (90, 33, 67, 56, 1,  60, 38),
    "AK": (65, 6,  46, 60, 75, 41, 28),
    "AZ": (98, 36, 38, 13, 6,  85, 50),
    "AR": (90, 30, 66, 50, 5,  60, 40),
    "CA": (82, 42, 52, 22, 5,  73, 55),
    "CO": (86, 18, 35, 17, 60, 71, 42),
    "CT": (82, 19, 58, 50, 41, 56, 38),
    "DE": (87, 26, 61, 45, 14, 56, 40),
    "DC": (88, 28, 62, 41, 14, 55, 42),
    "FL": (91, 49, 70, 54, 0,  66, 38),
    "GA": (90, 33, 67, 50, 1,  62, 42),
    "HI": (88, 65, 70, 17, 0,  72, 28),
    "ID": (85, 22, 35, 19, 35, 64, 36),
    "IL": (85, 17, 58, 39, 24, 56, 40),
    "IN": (85, 19, 59, 42, 23, 55, 40),
    "IA": (84, 11, 56, 35, 30, 59, 38),
    "KS": (90, 21, 58, 30, 14, 65, 38),
    "KY": (87, 24, 61, 50, 13, 56, 40),
    "LA": (91, 41, 70, 60, 1,  60, 42),
    "ME": (78, 8,  53, 45, 70, 56, 30),
    "MD": (87, 25, 60, 44, 19, 56, 40),
    "MA": (81, 17, 56, 50, 50, 58, 38),
    "MI": (80, 14, 56, 35, 60, 51, 38),
    "MN": (80, 0,  54, 30, 50, 55, 36),
    "MS": (91, 34, 68, 56, 1,  60, 40),
    "MO": (87, 18, 60, 42, 18, 59, 40),
    "MT": (82, 12, 33, 17, 45, 60, 32),
    "NE": (87, 13, 53, 25, 26, 64, 36),
    "NV": (90, 22, 28, 10, 24, 79, 42),
    "NH": (79, 9,  55, 47, 70, 54, 30),
    "NJ": (85, 22, 59, 48, 22, 56, 42),
    "NM": (89, 24, 35, 14, 12, 76, 38),
    "NY": (81, 13, 56, 45, 60, 54, 38),
    "NC": (88, 30, 64, 48, 5,  60, 40),
    "ND": (82, -3, 49, 18, 36, 59, 34),
    "OH": (84, 21, 59, 40, 28, 53, 40),
    "OK": (92, 27, 60, 36, 8,  64, 40),
    "OR": (78, 33, 47, 40, 5,  56, 38),
    "PA": (83, 19, 58, 42, 40, 53, 40),
    "RI": (81, 21, 58, 47, 33, 58, 36),
    "SC": (90, 35, 67, 49, 1,  62, 42),
    "SD": (85, 8,  50, 21, 38, 62, 34),
    "TN": (88, 29, 64, 53, 5,  58, 42),
    "TX": (93, 38, 62, 30, 1,  64, 42),
    "UT": (88, 22, 30, 13, 50, 73, 40),
    "VT": (78, 9,  54, 43, 80, 53, 30),
    "VA": (87, 28, 62, 44, 14, 58, 42),
    "WA": (75, 30, 45, 40, 12, 50, 36),
    "WV": (83, 23, 60, 47, 32, 52, 40),
    "WI": (80, 7,  55, 33, 50, 54, 36),
    "WY": (82, 11, 30, 13, 50, 65, 32),
}

COLUMNS = ["summer_high_f", "winter_low_f", "dew_point_f",
           "annual_precip_in", "annual_snow_in", "sunshine_pct", "aqi_mean"]


def run() -> pd.DataFrame:
    rows = []
    for st, vals in STATE_CLIMATE.items():
        row = {"state": st}
        row.update(dict(zip(COLUMNS, vals)))
        rows.append(row)
    df = pd.DataFrame(rows)
    dest = PROCESSED / "weather.csv"
    df.to_csv(dest, index=False)
    print(f"  -> {dest}  ({len(df)} rows, state-level)")
    return df


if __name__ == "__main__":
    run()
