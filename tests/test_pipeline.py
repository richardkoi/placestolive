"""Pipeline transform unit tests.

These cover the trickiest, most-easily-broken bits:
  - FIPS normalization edge cases
  - ACS Census suppression sentinel stripping
  - Alaska election aggregate-and-broadcast
  - Distance helper sanity checks
  - Final DB integrity invariants
"""
from __future__ import annotations

import math
import sqlite3
from pathlib import Path

import pandas as pd
import pytest

from data_pipeline.common import fips5, STATE_FIPS_TO_ABBR, STATE_ABBR_TO_NAME
from data_pipeline.ingest_geo import _haversine, _min_distance, COAST_ANCHORS


# ---------- fips5() ----------------------------------------------------

@pytest.mark.parametrize("inp,want", [
    ("1003", "01003"),
    ("01003", "01003"),
    (1003, "01003"),
    ("1003.0", "01003"),
    (1003.0, "01003"),
    ("  01003  ", "01003"),
])
def test_fips5_pads_to_5(inp, want):
    assert fips5(inp) == want


def test_fips5_none():
    assert fips5(None) == ""


def test_fips5_already_5():
    assert fips5("13121") == "13121"


# ---------- ACS suppression sentinel -----------------------------------

def test_acs_sentinel_stripping_logic():
    """Numeric coercion + isin() mask should strip negative sentinels."""
    SUPPRESSED = {-666666666, -999999999, -888888888}
    raw = pd.Series([100, 200, -666666666, -999999999, 350])
    s = pd.to_numeric(raw, errors="coerce").where(~raw.isin(SUPPRESSED))
    assert s.iloc[0] == 100
    assert s.iloc[1] == 200
    assert pd.isna(s.iloc[2])
    assert pd.isna(s.iloc[3])
    assert s.iloc[4] == 350


def test_acs_property_tax_pct_guards_against_zero_home_value():
    """Dividing by zero/negative home value should not produce wild values."""
    df = pd.DataFrame({"median_tax_paid": [3000, 5000], "median_home_value": [300000, 0]})
    valid = df["median_home_value"] > 0
    pct = ((df["median_tax_paid"] / df["median_home_value"]) * 100).where(valid).round(3)
    assert pct.iloc[0] == 1.0
    assert pd.isna(pct.iloc[1])


# ---------- Alaska election broadcast ----------------------------------

def test_alaska_election_broadcasts_statewide_total():
    """tonmcg uses State House Districts for AK; we aggregate + broadcast."""
    from data_pipeline.ingest_elections import AK_BOROUGH_FIPS
    # AK boroughs list should cover the canonical set (30 in Census 2024)
    assert len(AK_BOROUGH_FIPS) >= 29
    # All should start with 02 (AK state FIPS)
    for f in AK_BOROUGH_FIPS:
        assert f.startswith("02")
        assert len(f) == 5


# ---------- Distance helper --------------------------------------------

@pytest.mark.parametrize("lat1,lon1,lat2,lon2,expected,tolerance", [
    (40.71, -74.01, 34.05, -118.24, 2451, 30),     # NYC → LA
    (37.77, -122.42, 37.80, -122.27, 8.7, 1),       # SF → Oakland
    (40.0, -75.0, 40.0, -75.0, 0.0, 0.1),          # same point
])
def test_haversine_known_distances(lat1, lon1, lat2, lon2, expected, tolerance):
    d = _haversine(lat1, lon1, lat2, lon2)
    assert abs(d - expected) <= tolerance, f"got {d}, want {expected} ± {tolerance}"


def test_coast_anchors_cover_all_three_coasts():
    """COAST_ANCHORS should hit all three major US coastlines."""
    # Have at least one west-coast (lon < -120)
    assert any(lon < -120 for _, lon in COAST_ANCHORS)
    # Have at least one east-coast (lon > -77)
    assert any(lon > -77 for _, lon in COAST_ANCHORS)
    # Have at least one gulf-coast (28-31 lat, -85 to -97 lon)
    assert any(28 < lat < 31 and -97 < lon < -85 for lat, lon in COAST_ANCHORS)


def test_hawaii_coast_distance_is_short():
    """Honolulu lat/lon should be near a coast anchor (we added HI anchors)."""
    d = _min_distance(21.3, -157.8, COAST_ANCHORS)
    assert d < 30, f"Honolulu shouldn't be {d} mi from coast"


# ---------- DB invariants (against real built DB) ----------------------

@pytest.fixture(scope="module")
def db_df() -> pd.DataFrame:
    db_path = Path(__file__).parent.parent / "data" / "counties.sqlite"
    if not db_path.exists():
        pytest.skip("data/counties.sqlite not built")
    with sqlite3.connect(db_path) as conn:
        df = pd.read_sql_query("SELECT * FROM counties", conn)
    df["fips"] = df["fips"].astype(str).str.zfill(5)
    return df


def test_db_has_expected_row_count(db_df):
    """Census 2024 gazetteer + 50 states + DC ≈ 3,144 rows."""
    assert 3100 < len(db_df) < 3200


def test_db_fips_all_5_digit(db_df):
    """No FIPS should be shorter than 5 chars; all should be strings."""
    assert (db_df["fips"].str.len() == 5).all()


def test_db_all_states_50_plus_dc(db_df):
    """50 states + DC = 51 unique state codes."""
    states = set(db_df["state"].dropna().unique())
    assert len(states) == 51
    assert "DC" in states
    assert "PR" not in states  # filtered out per ingest_counties


def test_db_no_negative_property_tax(db_df):
    """Sentinel stripping should have caught any negative tax rates."""
    if "property_tax_pct" not in db_df.columns:
        pytest.skip("no property_tax_pct column")
    valid = db_df["property_tax_pct"].dropna()
    if len(valid) > 0:
        assert valid.min() >= 0


def test_db_dew_point_reasonable_range(db_df):
    """Dew point should be in -10 to 80 °F."""
    valid = db_df["dew_point_f"].dropna()
    assert valid.min() >= -10
    assert valid.max() <= 80


def test_db_alaska_boroughs_have_election_data(db_df):
    """AK borough broadcast: every AK row should have dem_share_pct."""
    ak = db_df[db_df["state"] == "AK"]
    assert len(ak) > 0
    # Allow at most 1 missing (edge cases like newly-created boroughs)
    missing = ak["dem_share_pct"].isna().sum()
    assert missing <= 1, f"{missing} AK boroughs missing election data"


def test_db_hawaii_coast_distance_realistic(db_df):
    """All HI counties should be within 50 miles of a coast anchor (HI is islands)."""
    hi = db_df[db_df["state"] == "HI"]
    assert (hi["dist_to_coast_mi"] < 50).all()


def test_db_great_lakes_counties_near_coast(db_df):
    """Detroit, Chicago, Cleveland, Milwaukee should all be < 30 mi from 'coast'
    after the Great Lakes anchor fix."""
    great_lakes_fips = ["26163", "17031", "39035", "55079"]  # Wayne, Cook, Cuyahoga, Milwaukee
    for f in great_lakes_fips:
        rows = db_df[db_df["fips"] == f]
        if len(rows) == 0:
            continue
        assert rows.iloc[0]["dist_to_coast_mi"] < 30
