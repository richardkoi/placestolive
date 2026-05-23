"""Geography: distance from each county centroid to nearest coast / mountains.

Uses county centroids from ingest_counties + a small list of coast anchor
points and major mountain summits. Pure-python haversine.
"""
from __future__ import annotations

import math
from typing import Iterable

import pandas as pd

from data_pipeline.common import PROCESSED

# Anchor points along the US coastline. Sparse but enough for sub-100mi accuracy
# at the county-centroid scale. (lat, lon)
COAST_ANCHORS: list[tuple[float, float]] = [
    # Atlantic
    (44.8, -67.0), (43.7, -69.7), (42.4, -70.9), (41.4, -71.3), (40.7, -73.9),
    (39.4, -74.3), (38.0, -75.5), (36.9, -76.0), (35.2, -75.6), (34.7, -76.7),
    (33.9, -78.0), (33.5, -79.0), (32.8, -79.9), (32.1, -81.1), (30.4, -81.5),
    (29.2, -81.0), (27.8, -80.4), (26.1, -80.1), (25.5, -80.4),
    # Gulf
    (25.1, -80.5), (25.8, -81.4), (27.4, -82.6), (28.5, -82.7), (29.7, -84.3),
    (30.2, -85.7), (30.4, -87.2), (30.3, -88.5), (29.2, -89.7), (29.0, -91.0),
    (28.9, -93.0), (29.3, -94.8), (28.0, -97.0), (26.1, -97.2),
    # Pacific
    (32.5, -117.1), (33.7, -118.2), (34.4, -119.7), (35.4, -120.9),
    (36.6, -121.9), (37.8, -122.5), (38.9, -123.7), (40.4, -124.4),
    (41.7, -124.2), (43.4, -124.3), (44.6, -124.1), (45.5, -123.9),
    (46.9, -124.1), (47.5, -124.4), (48.3, -124.7),
    # Great Lakes (treated as coast for the lakefront states)
    (41.5, -82.7), (41.6, -81.7), (41.7, -83.5), (42.3, -83.0),   # Erie / Detroit
    (43.3, -83.9), (44.0, -83.5), (44.7, -83.3),                  # Huron / Saginaw
    (45.8, -84.7), (45.0, -87.6),                                  # Michigan / Green Bay
    (46.5, -87.4), (46.8, -90.7), (46.8, -92.1),                  # Superior shore
    (43.0, -87.9), (42.0, -87.6), (41.7, -87.5),                  # Chicago / Milwaukee
    (43.0, -78.9), (43.7, -76.5), (44.3, -76.0),                  # Ontario / NY
    # Hawaii — coast anchors on every main island
    (21.3, -157.8), (21.5, -158.0),                                # O'ahu
    (20.7, -156.4), (20.9, -156.7),                                # Maui
    (19.5, -154.9), (19.7, -155.9), (20.0, -155.8),                # Big Island
    (22.1, -159.4), (21.9, -159.5),                                # Kaua'i
    (21.1, -157.0),                                                # Moloka'i / Lana'i
    # Alaska — main population centers + coastal extremes
    (61.2, -149.9), (60.5, -145.8), (60.0, -149.4),                # Anchorage / Cordova / Seward
    (59.0, -135.4), (58.3, -134.4), (57.0, -135.3),                # Skagway / Juneau / Sitka
    (55.3, -131.6),                                                # Ketchikan
    (60.0, -151.0), (59.6, -151.5),                                # Kenai Peninsula
    (58.4, -155.0), (57.8, -152.4),                                # Bristol Bay / Kodiak
    (54.8, -163.4), (52.0, -176.0),                                # Aleutians
    (66.6, -159.5), (64.5, -165.4), (70.4, -148.5), (71.3, -156.8), # Norton/North Slope/Beaufort
]

# Significant mountain summits / ranges (>3000 ft prominence) — sparse anchors.
MOUNTAIN_ANCHORS: list[tuple[float, float]] = [
    # West Coast / Sierra / Cascades
    (44.4, -121.8),  # Three Sisters OR
    (46.9, -121.8),  # Mt Rainier WA
    (37.7, -119.6),  # Yosemite CA
    (36.6, -118.3),  # Mt Whitney CA
    (39.1, -120.1),  # Lake Tahoe CA/NV
    (44.0, -121.6),  # Bend OR
    # Rockies
    (39.6, -106.0),  # Vail CO
    (40.0, -105.5),  # Boulder/Rocky Mtn NP
    (37.7, -106.8),  # San Juan CO
    (46.8, -110.0),  # Bozeman/Yellowstone area
    (43.5, -110.8),  # Tetons WY
    (47.0, -114.0),  # Missoula MT
    (40.4, -111.6),  # Wasatch UT
    # Southwest
    (35.7, -106.0),  # Sangre de Cristo NM
    (35.2, -111.6),  # San Francisco Peaks AZ
    # Appalachians
    (35.6, -82.5),   # Asheville NC
    (36.5, -81.6),   # NC/VA border
    (38.5, -78.5),   # Shenandoah VA
    (39.2, -79.5),   # WV highlands
    (43.9, -71.6),   # White Mtns NH
    (44.5, -72.9),   # Green Mtns VT
    (44.2, -70.9),   # ME mtns
    (44.0, -74.0),   # Adirondacks NY
    (44.0, -73.5),   # High Peaks NY
    # Ozarks (mild)
    (35.8, -93.5),
    # Black Hills SD
    (44.0, -103.5),
    # Hawaii — Mauna Kea / Haleakala / Kaua'i ranges
    (19.8, -155.5),  # Mauna Kea
    (19.5, -155.6),  # Mauna Loa
    (20.7, -156.2),  # Haleakala (Maui)
    (22.1, -159.5),  # Wai'ale'ale (Kaua'i)
    # Alaska — Alaska Range / Denali / Wrangells / Brooks Range
    (63.1, -151.0),  # Denali
    (61.7, -148.8),  # Chugach
    (62.0, -143.5),  # Wrangells
    (68.0, -150.0),  # Brooks Range
    (60.3, -154.0),  # Aleutian Range start
]


def _haversine(lat1, lon1, lat2, lon2):
    R = 3958.8
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    dlat = lat2r - lat1r
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon/2)**2
    return 2 * R * math.asin(min(1, math.sqrt(a)))


def _min_distance(lat: float, lon: float, anchors: Iterable[tuple[float, float]]) -> float:
    return min(_haversine(lat, lon, a, b) for a, b in anchors)


def run() -> pd.DataFrame:
    counties = pd.read_csv(PROCESSED / "counties.csv", dtype={"fips": str})

    rows = []
    for _, r in counties.iterrows():
        if pd.isna(r["lat"]) or pd.isna(r["lon"]):
            continue
        rows.append({
            "fips": str(r["fips"]).zfill(5),
            "dist_to_coast_mi":     round(_min_distance(r["lat"], r["lon"], COAST_ANCHORS), 1),
            "dist_to_mountains_mi": round(_min_distance(r["lat"], r["lon"], MOUNTAIN_ANCHORS), 1),
        })

    df = pd.DataFrame(rows)
    dest = PROCESSED / "geo.csv"
    df.to_csv(dest, index=False)
    print(f"  -> {dest}  ({len(df)} rows)")
    return df


if __name__ == "__main__":
    run()
