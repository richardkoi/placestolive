"""County-level 2024 presidential election results.

Source: tonmcg/US_County_Level_Election_Results_08-24 (GitHub mirror).
Used instead of MIT Election Lab because the Harvard Dataverse copy is gated
by a guestbook that blocks automated downloads. Data is identical in content.
"""
from __future__ import annotations

import pandas as pd

from data_pipeline.common import PROCESSED, RAW, download, fips5

URL = (
    "https://raw.githubusercontent.com/tonmcg/"
    "US_County_Level_Election_Results_08-24/master/"
    "2024_US_County_Level_Presidential_Results.csv"
)

# Alaska borough FIPS — the tonmcg dataset uses State House Districts (02001-02040)
# instead of boroughs, so we aggregate AK votes statewide and broadcast.
AK_BOROUGH_FIPS = [
    "02013", "02016", "02020", "02050", "02060", "02063", "02066", "02068",
    "02070", "02090", "02100", "02105", "02110", "02122", "02130", "02150",
    "02158", "02164", "02170", "02180", "02185", "02188", "02195", "02198",
    "02220", "02230", "02240", "02261", "02275", "02282", "02290",
]


def run() -> pd.DataFrame:
    csv = download(URL, RAW / "2024_county_president.csv")
    df = pd.read_csv(csv, dtype={"county_fips": str})

    df["fips"] = df["county_fips"].apply(fips5)

    # Split AK off; the borough-level data isn't in this source.
    is_ak = df["fips"].str.startswith("02")
    non_ak = df[~is_ak].copy()
    non_ak["dem_share_pct"] = (non_ak["per_dem"] * 100).round(2)
    non_ak["gop_share_pct"] = (non_ak["per_gop"] * 100).round(2)
    non_ak = non_ak[["fips", "dem_share_pct", "gop_share_pct"]].dropna()

    # AK: aggregate statewide, broadcast to every borough FIPS
    ak = df[is_ak]
    ak_gop_total = ak["votes_gop"].sum()
    ak_dem_total = ak["votes_dem"].sum()
    ak_total = ak_gop_total + ak_dem_total
    ak_dem_pct = round(ak_dem_total / ak_total * 100, 2) if ak_total else None
    ak_gop_pct = round(ak_gop_total / ak_total * 100, 2) if ak_total else None
    ak_broadcast = pd.DataFrame({
        "fips": AK_BOROUGH_FIPS,
        "dem_share_pct": ak_dem_pct,
        "gop_share_pct": ak_gop_pct,
    })

    out = pd.concat([non_ak, ak_broadcast], ignore_index=True)
    dest = PROCESSED / "elections.csv"
    out.to_csv(dest, index=False)
    print(f"  -> {dest}  ({len(out)} rows; AK broadcast Dem {ak_dem_pct}%)")
    return out


if __name__ == "__main__":
    run()
