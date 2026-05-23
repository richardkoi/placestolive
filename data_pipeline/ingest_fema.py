"""FEMA National Risk Index — county-level natural-hazard risk.

The legacy hazards.fema.gov download portal was retired in 2025. We now query
the FEMA-published ArcGIS Feature Service directly:

  https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/
    National_Risk_Index_Counties/FeatureServer/0/query

The service caps at 2000 records per request, so we page through.
"""
from __future__ import annotations

import json

import pandas as pd
import requests

from data_pipeline.common import PROCESSED, RAW, fips5

URL = (
    "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/"
    "National_Risk_Index_Counties/FeatureServer/0/query"
)

# FEMA NRI field -> our schema. CFLD = coastal flood, IFLD = inland (riverine) flood.
HAZARD_MAP = {
    "RISK_SCORE":  "fema_risk_score",     # composite, 0-100
    "HRCN_RISKS":  "fema_hurricane",
    "TRND_RISKS":  "fema_tornado",
    "WFIR_RISKS":  "fema_wildfire",
    "CFLD_RISKS":  "fema_flood_coastal",
    "IFLD_RISKS":  "fema_flood_river",
    "ERQK_RISKS":  "fema_earthquake",
    "HWAV_RISKS":  "fema_heat",
    "WNTW_RISKS":  "fema_winter_weather",
    "DRGT_RISKS":  "fema_drought",
}


def _fetch_all() -> list[dict]:
    fields = ["STCOFIPS"] + list(HAZARD_MAP.keys())
    out_fields = ",".join(fields)
    offset = 0
    features: list[dict] = []
    while True:
        params = {
            "where": "1=1",
            "outFields": out_fields,
            "returnGeometry": "false",
            "resultOffset": str(offset),
            "resultRecordCount": "2000",
            "orderByFields": "STCOFIPS",
            "f": "json",
        }
        r = requests.get(URL, params=params, timeout=60)
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            raise RuntimeError(f"ArcGIS error: {data['error']}")
        batch = data.get("features", [])
        if not batch:
            break
        features.extend(batch)
        print(f"  fetched {len(features)} so far ...")
        if len(batch) < 2000:
            break
        offset += 2000
    return features


def run() -> pd.DataFrame:
    cache = RAW / "fema_nri.json"
    if cache.exists():
        print(f"  [cache] {cache.name}")
        features = json.loads(cache.read_text())
    else:
        print("  [download] FEMA NRI ArcGIS service ...")
        features = _fetch_all()
        cache.write_text(json.dumps(features))

    rows = [f["attributes"] for f in features]
    df = pd.DataFrame(rows)
    df["fips"] = df["STCOFIPS"].apply(fips5)
    df = df.rename(columns=HAZARD_MAP).drop(columns=["STCOFIPS"])

    # Merge coastal + riverine flood into one column (max risk)
    if "fema_flood_coastal" in df.columns and "fema_flood_river" in df.columns:
        df["fema_flood"] = df[["fema_flood_coastal", "fema_flood_river"]].max(axis=1)
        df = df.drop(columns=["fema_flood_coastal", "fema_flood_river"])

    dest = PROCESSED / "fema.csv"
    df.to_csv(dest, index=False)
    print(f"  -> {dest}  ({len(df)} rows)")
    return df


if __name__ == "__main__":
    run()
