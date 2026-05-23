"""State-level policy: top marginal state income tax and LGBTQ policy tally.

Hand-coded snapshot — refresh annually. Sources:
  - Tax Foundation 2024 individual income tax rates (top marginal)
  - Movement Advancement Project (MAP) State Equality Index 2024
    LGBTQ policy tally scaled to 0-100 (higher = more protective)
"""
from __future__ import annotations

import pandas as pd

from data_pipeline.common import PROCESSED, STATE_FIPS_TO_ABBR, fips5

# Top marginal state individual income tax rate, 2024 (Tax Foundation).
STATE_INCOME_TAX = {
    "AL": 5.0, "AK": 0.0, "AZ": 2.5, "AR": 4.4, "CA": 13.3, "CO": 4.4,
    "CT": 6.99, "DE": 6.6, "DC": 10.75, "FL": 0.0, "GA": 5.39, "HI": 11.0,
    "ID": 5.8, "IL": 4.95, "IN": 3.05, "IA": 5.7, "KS": 5.7, "KY": 4.0,
    "LA": 4.25, "ME": 7.15, "MD": 5.75, "MA": 9.0, "MI": 4.25, "MN": 9.85,
    "MS": 4.7, "MO": 4.8, "MT": 5.9, "NE": 5.84, "NV": 0.0, "NH": 0.0,
    "NJ": 10.75, "NM": 5.9, "NY": 10.9, "NC": 4.5, "ND": 2.5, "OH": 3.5,
    "OK": 4.75, "OR": 9.9, "PA": 3.07, "RI": 5.99, "SC": 6.2, "SD": 0.0,
    "TN": 0.0, "TX": 0.0, "UT": 4.55, "VT": 8.75, "VA": 5.75, "WA": 0.0,
    "WV": 5.12, "WI": 7.65, "WY": 0.0,
}

# MAP State Equality Index 2024, rescaled to 0-100.
# Original tally ranges roughly -20 to +45; mapped here.
LGBTQ_POLICY = {
    "AL": 10, "AK": 30, "AZ": 30, "AR": 5, "CA": 95, "CO": 90, "CT": 95,
    "DE": 90, "DC": 100, "FL": 15, "GA": 25, "HI": 90, "ID": 10, "IL": 95,
    "IN": 30, "IA": 25, "KS": 25, "KY": 20, "LA": 20, "ME": 90, "MD": 90,
    "MA": 95, "MI": 80, "MN": 90, "MS": 5, "MO": 25, "MT": 25, "NE": 25,
    "NV": 90, "NH": 80, "NJ": 95, "NM": 90, "NY": 95, "NC": 35, "ND": 15,
    "OH": 35, "OK": 10, "OR": 90, "PA": 50, "RI": 90, "SC": 20, "SD": 15,
    "TN": 5, "TX": 20, "UT": 25, "VT": 95, "VA": 60, "WA": 95, "WV": 25,
    "WI": 50, "WY": 25,
}


def run() -> pd.DataFrame:
    # State-level CSV; build_db.py will broadcast to all counties in that state.
    rows = []
    for state in STATE_INCOME_TAX:
        rows.append({
            "state": state,
            "state_income_tax_pct": STATE_INCOME_TAX[state],
            "lgbtq_policy_score":   LGBTQ_POLICY.get(state, 50),
        })
    df = pd.DataFrame(rows)
    dest = PROCESSED / "state_policy.csv"
    df.to_csv(dest, index=False)
    print(f"  -> {dest}  ({len(df)} rows)")
    return df


if __name__ == "__main__":
    run()
