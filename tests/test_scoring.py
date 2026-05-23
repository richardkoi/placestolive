"""Unit tests for the scoring engine.

Covers each match_* helper, the score() composite, similar(), hard-filter
semantics, weight=0 disable, NaN handling, and continental_only flag.
"""
from __future__ import annotations

import math

import pandas as pd
import pytest

from server import scoring
from server.schema import Dimension, ScoreRequest, SimilarRequest


# ---------- match_linear_target -----------------------------------------

def test_linear_target_peak_at_target():
    s = scoring._match_linear_target(pd.Series([82.0]), 82.0, decay=15)
    assert s.iloc[0] == pytest.approx(100.0)


def test_linear_target_falloff_symmetric():
    s = scoring._match_linear_target(pd.Series([75.0, 89.0]), 82.0, decay=14)
    # |75-82|=7, |89-82|=7 → both 50
    assert s.iloc[0] == pytest.approx(50.0)
    assert s.iloc[1] == pytest.approx(50.0)


def test_linear_target_zero_at_decay_edge():
    s = scoring._match_linear_target(pd.Series([67.0]), 82.0, decay=15)
    assert s.iloc[0] == pytest.approx(0.0)


def test_linear_target_clamps_to_zero_far_out():
    s = scoring._match_linear_target(pd.Series([50.0, 120.0]), 82.0, decay=15)
    assert (s >= 0).all()
    assert s.iloc[0] == 0.0


def test_linear_target_nan_propagates():
    s = scoring._match_linear_target(pd.Series([float("nan")]), 80.0, decay=10)
    assert pd.isna(s.iloc[0])


# ---------- match_percentile --------------------------------------------

def test_percentile_lower_better_ranks_lowest_highest():
    vals = pd.Series([10.0, 20.0, 30.0, 40.0, 50.0])
    s = scoring._match_percentile(vals, better="lower")
    # 10 is lowest → highest score; 50 is highest → lowest score
    assert s.iloc[0] > s.iloc[-1]
    assert s.iloc[0] == pytest.approx(100.0, abs=20)
    assert s.iloc[-1] == pytest.approx(0.0, abs=20)


def test_percentile_higher_better_inverts():
    vals = pd.Series([10.0, 20.0, 30.0, 40.0, 50.0])
    s = scoring._match_percentile(vals, better="higher")
    assert s.iloc[0] < s.iloc[-1]


def test_percentile_nan_returns_nan():
    """The fixed behavior: NaN values get NaN, NOT a fake neutral 50."""
    vals = pd.Series([10.0, float("nan"), 30.0])
    s = scoring._match_percentile(vals, better="lower")
    assert pd.isna(s.iloc[1])


# ---------- match_range -------------------------------------------------

def test_range_inside_scores_100():
    s = scoring._match_range(pd.Series([80.0, 85.0]), 75.0, 90.0)
    assert s.iloc[0] == 100.0
    assert s.iloc[1] == 100.0


def test_range_outside_returns_nan():
    s = scoring._match_range(pd.Series([60.0, 100.0]), 75.0, 90.0)
    assert pd.isna(s.iloc[0])
    assert pd.isna(s.iloc[1])


def test_range_boundary_inclusive():
    s = scoring._match_range(pd.Series([75.0, 90.0]), 75.0, 90.0)
    assert s.iloc[0] == 100.0
    assert s.iloc[1] == 100.0


# ---------- match_one_sided ---------------------------------------------

def test_one_sided_lower_at_threshold_scores_zero():
    s = scoring._match_one_sided(pd.Series([60.0]), threshold=60, best=20, direction="lower")
    assert s.iloc[0] == pytest.approx(0.0)


def test_one_sided_lower_at_best_scores_100():
    s = scoring._match_one_sided(pd.Series([20.0]), threshold=60, best=20, direction="lower")
    assert s.iloc[0] == pytest.approx(100.0)


def test_one_sided_lower_past_threshold_returns_nan():
    s = scoring._match_one_sided(pd.Series([70.0]), threshold=60, best=20, direction="lower")
    assert pd.isna(s.iloc[0])


def test_one_sided_higher_inverted():
    s = scoring._match_one_sided(pd.Series([95.0, 60.0, 40.0]),
                                  threshold=60, best=95, direction="higher")
    # 95 = best → 100
    assert s.iloc[0] == pytest.approx(100.0)
    # at threshold → 0
    assert s.iloc[1] == pytest.approx(0.0)
    # below threshold (wrong side) → NaN
    assert pd.isna(s.iloc[2])


# ---------- match_categorical_lean --------------------------------------

def test_categorical_strong_d_peaks_at_dem_80():
    # Decay is 30 pct-pts. 80 → 100 match; 65 → ~50 match; 50 → 0 (at edge);
    # below 50 → clamped to 0. Use values inside the decay window for ordering.
    s = scoring._match_categorical_lean(pd.Series([80.0, 70.0, 60.0]), "strong_d")
    assert s.iloc[0] > s.iloc[1] > s.iloc[2]
    assert s.iloc[0] == pytest.approx(100.0)


def test_categorical_strong_r_inverts():
    # strong_r target = 20% Dem. Use 20, 30, 40 to stay inside decay window.
    s = scoring._match_categorical_lean(pd.Series([20.0, 30.0, 40.0]), "strong_r")
    assert s.iloc[0] > s.iloc[1] > s.iloc[2]
    assert s.iloc[0] == pytest.approx(100.0)


# ---------- end-to-end score() -----------------------------------------

def test_score_returns_all_counties(tiny_counties):
    req = ScoreRequest(continental_only=False, limit=10)
    res = scoring.score(req, tiny_counties)
    assert res.total_before_filter == 6
    assert res.total_after_filter == 6
    assert len(res.top) == 6


def test_score_weight_zero_dim_is_ignored(tiny_counties):
    # A dim with weight=0 should NOT apply its filter or scoring
    req = ScoreRequest(
        dew_point=Dimension(weight=0, threshold=50, direction="lower"),  # would exclude FL+TX
        continental_only=False,
        limit=10,
    )
    res = scoring.score(req, tiny_counties)
    # All 6 survive because weight=0 disables both
    assert res.total_after_filter == 6


def test_score_range_excludes_out_of_range(tiny_counties):
    # Home price range [200k, 500k] → drops SF ($1.4M)
    req = ScoreRequest(
        home_price=Dimension(weight=5, range_min=200_000, range_max=500_000),
        limit=10,
    )
    res = scoring.score(req, tiny_counties)
    fips_returned = {c.fips for c in res.top}
    assert "06075" not in fips_returned  # SF excluded
    assert "48201" in fips_returned       # Houston in range


def test_score_one_sided_excludes_past_threshold(tiny_counties):
    # Dew point ≤ 55 → only counties with summer dew ≤ 55 survive
    req = ScoreRequest(
        dew_point=Dimension(weight=5, threshold=55, direction="lower"),
        continental_only=False,
        limit=10,
    )
    res = scoring.score(req, tiny_counties)
    fips = {c.fips for c in res.top}
    # SF (52), Bristol Bay (45), NM (35) survive; VT (56), TX (70), FL (73) excluded
    assert fips == {"06075", "02060", "35001"}


def test_score_politics_strong_d_ranks_blue_higher(tiny_counties):
    req = ScoreRequest(
        politics=Dimension(weight=10, political_lean="strong_d"),
        limit=10,
    )
    res = scoring.score(req, tiny_counties)
    # SF (85% D) should rank above TX (49% D)
    sf_score = next(c.score for c in res.top if c.fips == "06075")
    tx_score = next(c.score for c in res.top if c.fips == "48201")
    assert sf_score > tx_score


def test_score_continental_only_drops_alaska(tiny_counties):
    req = ScoreRequest(continental_only=True, limit=10)
    res = scoring.score(req, tiny_counties)
    fips = {c.fips for c in res.top}
    assert "02060" not in fips           # AK Bristol Bay dropped
    assert res.total_after_filter == 5


def test_score_continental_off_includes_alaska(tiny_counties):
    req = ScoreRequest(continental_only=False, limit=10)
    res = scoring.score(req, tiny_counties)
    assert "02060" in {c.fips for c in res.top}


def test_score_breakdown_returns_none_for_missing_data(tiny_counties):
    """Bristol Bay AK has NaN homicide rate — breakdown should be None, not 0.0."""
    req = ScoreRequest(
        homicide_rate=Dimension(weight=5, direction="lower"),
        continental_only=False,
        limit=10,
    )
    res = scoring.score(req, tiny_counties)
    bb = next(c for c in res.top if c.fips == "02060")
    assert bb.breakdown.get("homicide_rate") is None


def test_score_missing_dim_data_doesnt_poison_composite(tiny_counties):
    """A county missing data on one dim should still score on the dims it has."""
    # Pick a lean Bristol Bay (43% Dem) can actually match — lean_r target is 40% Dem.
    req = ScoreRequest(
        homicide_rate=Dimension(weight=5, direction="lower"),
        politics=Dimension(weight=5, political_lean="lean_r"),
        continental_only=False,
        limit=10,
    )
    res = scoring.score(req, tiny_counties)
    bb = next(c for c in res.top if c.fips == "02060")
    # Bristol Bay has NaN homicide, but its politics is close to lean_r target → score > 0
    assert bb.score > 0
    # Homicide should be None in breakdown, not 0
    assert bb.breakdown.get("homicide_rate") is None


def test_score_no_enabled_dims_returns_neutral_50(tiny_counties):
    req = ScoreRequest(limit=10)
    res = scoring.score(req, tiny_counties)
    for c in res.top:
        assert c.score == 50.0


def test_score_limit_respected(tiny_counties):
    req = ScoreRequest(continental_only=False, limit=2)
    res = scoring.score(req, tiny_counties)
    assert len(res.top) == 2
    assert len(res.counties) == 6  # `counties` is full set for the map


# ---------- similar() ---------------------------------------------------

def test_similar_anchor_itself_scores_highest(tiny_counties):
    req = SimilarRequest(
        fips="50007",  # Chittenden VT as anchor
        prefs=ScoreRequest(
            politics=Dimension(weight=5, political_lean="neutral"),  # just so dims fire
            summer_high=Dimension(weight=5, range_min=75, range_max=85),
        ),
        continental_only=False,
        limit=10,
    )
    res = scoring.similar(req, tiny_counties)
    top = res.top[0]
    # Anchor should be top (best match to itself); allow numerical tie with another
    assert top.fips == "50007"


def test_similar_returns_empty_if_anchor_missing(tiny_counties):
    req = SimilarRequest(fips="99999", prefs=ScoreRequest(), limit=10)
    res = scoring.similar(req, tiny_counties)
    assert len(res.top) == 0


def test_similar_apply_filters_off_keeps_expensive_lookalikes(tiny_counties):
    """With apply_filters=False, a $1.4M county can still appear similar to a cheaper anchor."""
    req = SimilarRequest(
        fips="50007",  # VT anchor
        prefs=ScoreRequest(home_price=Dimension(weight=5, range_min=200_000, range_max=500_000)),
        apply_filters=False,
        continental_only=False,
        limit=10,
    )
    res = scoring.similar(req, tiny_counties)
    # SF ($1.4M) shouldn't be filtered out even though it's outside the prefs range
    fips = {c.fips for c in res.top}
    assert "06075" in fips


def test_similar_apply_filters_on_excludes_out_of_range(tiny_counties):
    req = SimilarRequest(
        fips="50007",
        prefs=ScoreRequest(home_price=Dimension(weight=5, range_min=200_000, range_max=500_000)),
        apply_filters=True,
        continental_only=False,
        limit=10,
    )
    res = scoring.similar(req, tiny_counties)
    fips = {c.fips for c in res.top}
    assert "06075" not in fips  # SF excluded by range filter
