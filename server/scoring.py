"""Pure scoring logic. Given prefs + a counties DataFrame, return ranked results.

Three normalization modes:
- linear_target: ideal value with linear falloff to 0 over a per-metric decay distance
- percentile:    direction-only (higher/lower is better) — rank-based 0-100
- categorical:   political lean mapped via signed distance

All match scores are 0-100. Composite = weighted average of enabled dimensions.
"""
from __future__ import annotations

import math
from typing import Optional

import pandas as pd

from server.schema import (
    Dimension, ScoreRequest, ScoredCounty, ScoreResponse, SimilarRequest,
)


# Per-dimension config: (db_column, mode, params)
# mode = "linear_target" | "percentile" | "categorical" | "anchor_distance"
# For linear_target: params["decay"] = distance over which match drops to 0
# For percentile:    params["better"] = "higher" | "lower" (default direction)
DIMENSIONS: dict[str, dict] = {
    # weather — two-sided (range) for temps and rain
    "summer_high":     {"col": "summer_high_f",  "mode": "range", "similar_decay": 15},
    "winter_low":      {"col": "winter_low_f",   "mode": "range", "similar_decay": 20},
    "annual_precip":   {"col": "annual_precip_in", "mode": "range", "similar_decay": 20},
    # one-sided (threshold + direction)
    "annual_snow":     {"col": "annual_snow_in",  "mode": "one_sided", "best": 0,   "default_threshold": 24,  "direction": "lower", "similar_decay": 20},
    "sunshine":        {"col": "sunshine_pct",    "mode": "one_sided", "best": 95,  "default_threshold": 60,  "direction": "higher", "similar_decay": 20},
    "dew_point":       {"col": "dew_point_f",     "mode": "one_sided", "best": 35,  "default_threshold": 60,  "direction": "lower", "similar_decay": 15},
    "aqi":             {"col": "aqi_mean",        "mode": "one_sided", "best": 20,  "default_threshold": 60,  "direction": "lower", "similar_decay": 30},

    # politics — categorical (unchanged)
    "politics":        {"col": "dem_share_pct",  "mode": "categorical"},

    # cost — home_price as range; rent + taxes unchanged
    "home_price":      {"col": "median_home_value", "mode": "range", "similar_decay": 150000},
    "median_rent":     {"col": "median_rent",    "mode": "linear_target", "decay": 1000},
    "property_tax":    {"col": "property_tax_pct", "mode": "percentile", "better": "lower"},
    "state_income_tax":{"col": "state_income_tax_pct", "mode": "percentile", "better": "lower"},

    # crime (CHR 2024 dropped the violent-crime-rate field; we use homicide rate + firearm-death rate
    # as the two closest county-level proxies)
    "homicide_rate":   {"col": "homicide_per_100k", "mode": "percentile", "better": "lower"},
    "firearm_deaths":  {"col": "firearm_deaths_per_100k", "mode": "percentile", "better": "lower"},

    # disasters (FEMA NRI — higher = riskier)
    "disaster_risk":   {"col": "fema_risk_score", "mode": "percentile", "better": "lower"},
    "hurricane_risk":  {"col": "fema_hurricane",  "mode": "percentile", "better": "lower"},
    "tornado_risk":    {"col": "fema_tornado",    "mode": "percentile", "better": "lower"},
    "wildfire_risk":   {"col": "fema_wildfire",   "mode": "percentile", "better": "lower"},
    "flood_risk":      {"col": "fema_flood",      "mode": "percentile", "better": "lower"},
    "earthquake_risk": {"col": "fema_earthquake", "mode": "percentile", "better": "lower"},

    # demographics
    "pop_density":     {"col": "pop_density",    "mode": "linear_target", "decay": 1500},
    "diversity":       {"col": "diversity_pct",  "mode": "linear_target", "decay": 30},
    "lgbtq_policy":    {"col": "lgbtq_policy_score", "mode": "percentile", "better": "higher"},
    "median_age":      {"col": "median_age",     "mode": "range", "similar_decay": 8},
    "population":      {"col": "population",     "mode": "range", "similar_decay": 200000},

    # additional FEMA hazards
    "heat_wave_risk":  {"col": "fema_heat",      "mode": "percentile", "better": "lower"},

    # geography — one-sided (closer = better)
    "dist_to_coast":     {"col": "dist_to_coast_mi",     "mode": "one_sided", "best": 0, "default_threshold": 100, "direction": "lower", "similar_decay": 100},
    "dist_to_mountains": {"col": "dist_to_mountains_mi", "mode": "one_sided", "best": 0, "default_threshold": 100, "direction": "lower", "similar_decay": 100},
    "elevation":         {"col": "elevation_ft",         "mode": "linear_target", "decay": 3000},
}

# Lean targets in Dem-share-pct space (0-100)
LEAN_TARGETS = {
    "strong_d": 80,
    "lean_d": 60,
    "neutral": 50,
    "lean_r": 40,
    "strong_r": 20,
}


def _haversine_miles(lat1, lon1, lat2, lon2):
    """Vectorized haversine. Inputs may be scalars or pandas Series."""
    R = 3958.8  # miles
    lat1r, lat2r = pd.to_numeric(lat1) * math.pi / 180, pd.to_numeric(lat2) * math.pi / 180
    dlat = lat2r - lat1r
    dlon = (pd.to_numeric(lon2) - pd.to_numeric(lon1)) * math.pi / 180
    a = (dlat / 2).apply(math.sin) ** 2 + lat1r.apply(math.cos) * lat2r.apply(math.cos) * (dlon / 2).apply(math.sin) ** 2
    return 2 * R * a.apply(lambda x: math.asin(min(1, math.sqrt(x))))


def _match_linear_target(values: pd.Series, target: float, decay: float) -> pd.Series:
    """Linear falloff: 100 at target, 0 at target+/-decay, clamped."""
    diff = (values - target).abs()
    return (100 * (1 - diff / decay)).clip(lower=0, upper=100)


def _match_percentile(values: pd.Series, better: str) -> pd.Series:
    """Rank-based 0-100. Higher rank = better match.
    NaN-preserving: counties with no data return NaN so they're skipped in the
    weighted composite (consistent with linear_target and categorical modes)."""
    ranks = values.rank(pct=True, na_option="keep")
    if better == "lower":
        ranks = 1 - ranks
    return ranks * 100


def _match_categorical_lean(values: pd.Series, lean_key: str) -> pd.Series:
    """Politics: signed distance from target lean. Decay of 30 pct-pts."""
    target = LEAN_TARGETS[lean_key]
    decay = 30
    return _match_linear_target(values, target, decay)


def _match_range(values: pd.Series, lo: float, hi: float) -> pd.Series:
    """Inside [lo, hi] = 100, outside = NaN (so the county is hard-excluded later)."""
    in_range = (values >= lo) & (values <= hi)
    return pd.Series(100.0, index=values.index).where(in_range)


def _match_one_sided(values: pd.Series, threshold: float, best: float, direction: str) -> pd.Series:
    """Threshold + direction. Past threshold (wrong side) = NaN (excluded).
    Within the 'good' side, score scales linearly from 0 at threshold to 100 at `best`."""
    if direction == "lower":
        good = values <= threshold
        denom = threshold - best if threshold != best else 1
        scaled = (threshold - values) / denom * 100
    else:  # "higher"
        good = values >= threshold
        denom = best - threshold if best != threshold else 1
        scaled = (values - threshold) / denom * 100
    return scaled.clip(lower=0, upper=100).where(good)


def _apply_hard_filters(df: pd.DataFrame, req: ScoreRequest) -> pd.DataFrame:
    """Drop rows that violate any of the user's filters for ENABLED dims:
       - legacy min/max
       - range mode (must be in [range_min, range_max])
       - one_sided mode (must be on the 'good' side of threshold)
    Filters only apply when the dimension's weight > 0."""
    out = df
    for key, cfg in DIMENSIONS.items():
        dim: Optional[Dimension] = getattr(req, key, None)
        if dim is None or (dim.weight or 0) <= 0:
            continue
        col = cfg["col"]
        if col not in out.columns:
            continue
        # Legacy min/max
        if dim.max is not None:
            out = out[(out[col] <= dim.max) | out[col].isna()]
        if dim.min is not None:
            out = out[(out[col] >= dim.min) | out[col].isna()]
        # Range mode
        if cfg["mode"] == "range" and dim.range_min is not None and dim.range_max is not None:
            in_range = (out[col] >= dim.range_min) & (out[col] <= dim.range_max)
            out = out[in_range | out[col].isna()]
        # One-sided mode
        if cfg["mode"] == "one_sided" and dim.threshold is not None:
            direction = dim.direction or cfg.get("direction", "lower")
            if direction == "lower":
                out = out[(out[col] <= dim.threshold) | out[col].isna()]
            else:
                out = out[(out[col] >= dim.threshold) | out[col].isna()]
    return out


def _apply_anchor(df: pd.DataFrame, req: ScoreRequest) -> pd.DataFrame:
    """Hard-filter to counties within anchor.max_miles."""
    if req.anchor is None or "lat" not in df.columns or "lon" not in df.columns:
        return df
    dists = _haversine_miles(df["lat"], df["lon"], pd.Series([req.anchor.lat] * len(df), index=df.index), pd.Series([req.anchor.lon] * len(df), index=df.index))
    df = df.assign(_anchor_dist=dists)
    return df[df["_anchor_dist"] <= req.anchor.max_miles]


def score(req: ScoreRequest, counties: pd.DataFrame) -> ScoreResponse:
    """Apply hard filters, compute weighted score per surviving county, return ranked."""
    total_before = len(counties)

    filtered = counties
    if req.continental_only and "state" in filtered.columns:
        filtered = filtered[~filtered["state"].isin({"AK", "HI"})]
    filtered = _apply_hard_filters(filtered, req)
    filtered = _apply_anchor(filtered, req)

    if len(filtered) == 0:
        return ScoreResponse(counties=[], top=[], total_after_filter=0, total_before_filter=total_before)

    # Per-dimension match scores
    matches: dict[str, pd.Series] = {}
    weights: dict[str, float] = {}
    # Track range/one-sided exclusions so we can hard-filter at the end
    exclusion_masks: list[pd.Series] = []

    for key, cfg in DIMENSIONS.items():
        dim: Optional[Dimension] = getattr(req, key, None)
        if dim is None or dim.weight <= 0:
            continue
        col = cfg["col"]
        if col not in filtered.columns:
            continue
        vals = filtered[col]
        mode = cfg["mode"]
        if mode == "linear_target":
            if dim.target is None:
                continue
            m = _match_linear_target(vals, dim.target, cfg["decay"])
        elif mode == "percentile":
            better = dim.direction or cfg["better"]
            m = _match_percentile(vals, better)
        elif mode == "categorical":
            if dim.political_lean is None:
                continue
            m = _match_categorical_lean(vals, dim.political_lean)
        elif mode == "range":
            if dim.range_min is None or dim.range_max is None:
                continue
            m = _match_range(vals, dim.range_min, dim.range_max)
            # NaN values failed the range — mark them for exclusion (preserving data-missing as None too)
            exclusion_masks.append(m.notna() | vals.isna())
        elif mode == "one_sided":
            if dim.threshold is None:
                continue
            direction = dim.direction or cfg["direction"]
            m = _match_one_sided(vals, dim.threshold, cfg["best"], direction)
            exclusion_masks.append(m.notna() | vals.isna())
        else:
            continue
        matches[key] = m
        weights[key] = dim.weight

    # Apply hard exclusions from range / one_sided dims (county out-of-range → drop entirely)
    if exclusion_masks:
        keep = exclusion_masks[0]
        for m in exclusion_masks[1:]:
            keep = keep & m
        filtered = filtered[keep]
        matches = {k: m.loc[filtered.index] for k, m in matches.items()}

    if not weights:
        # No enabled dimensions — return all surviving counties with neutral score
        scored = filtered.assign(_score=50)
    else:
        # Per-county: sum(weight * match) / sum(weight) over dimensions where match is not NaN.
        # This way a county missing some data is scored on the dimensions it does have, instead
        # of returning NaN and getting sorted to the bottom (or floating to the top via FIPS order).
        weighted_sum = pd.Series(0.0, index=filtered.index)
        weight_total = pd.Series(0.0, index=filtered.index)
        for k, m in matches.items():
            w = weights[k]
            valid = m.notna()
            weighted_sum = weighted_sum.add((m.fillna(0) * w).where(valid, 0), fill_value=0)
            weight_total = weight_total.add(pd.Series(w, index=m.index).where(valid, 0), fill_value=0)
        composite = (weighted_sum / weight_total).where(weight_total > 0)
        scored = filtered.assign(_score=composite)

    scored = scored.sort_values("_score", ascending=False, na_position="last")

    def to_county(row, breakdown_keys) -> ScoredCounty:
        # Coerce possibly-NaN string columns ("nan" from astype) back to empty string
        def s(v) -> str:
            return "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)
        return ScoredCounty(
            fips=row["fips"],
            name=s(row.get("county_name", "")),
            state=s(row.get("state", "")),
            score=float(row["_score"]) if pd.notna(row["_score"]) else 0.0,
            breakdown={
                k: (float(matches[k].loc[row.name]) if pd.notna(matches[k].loc[row.name]) else None)
                for k in breakdown_keys if k in matches
            },
        )

    breakdown_keys = list(matches.keys())
    all_results = [to_county(r, breakdown_keys) for _, r in scored.iterrows()]
    top = all_results[: req.limit]

    return ScoreResponse(
        counties=all_results,
        top=top,
        total_after_filter=len(filtered),
        total_before_filter=total_before,
    )


def similar(req: SimilarRequest, counties: pd.DataFrame) -> ScoreResponse:
    """Find counties similar to the anchor (req.fips), weighted by the user's prefs.

    For each enabled dimension in req.prefs:
      - linear_target / percentile: match = how close the county's value is to the anchor's
        value, using the same decay used for normal scoring
      - categorical (politics): match = distance from the anchor's dem_share_pct
    Then combine into the usual weighted average.
    """
    total_before = len(counties)

    # Find the anchor row
    anchor_row = counties[counties["fips"] == req.fips]
    if len(anchor_row) == 0:
        return ScoreResponse(
            counties=[], top=[], total_after_filter=0, total_before_filter=total_before
        )
    anchor = anchor_row.iloc[0]

    filtered = counties
    if req.continental_only and "state" in filtered.columns:
        filtered = filtered[~filtered["state"].isin({"AK", "HI"})]
    if req.apply_filters:
        filtered = _apply_hard_filters(filtered, req.prefs)
    # Don't apply anchor (geographic radius) filter — that's confusing in similarity mode

    if len(filtered) == 0:
        return ScoreResponse(
            counties=[], top=[], total_after_filter=0, total_before_filter=total_before
        )

    matches: dict[str, pd.Series] = {}
    weights: dict[str, float] = {}

    def compute_match_for(key: str, cfg: dict) -> Optional[pd.Series]:
        """Compute the similarity-match series for one dimension against the anchor.
        Returns None if the dim is unscorable (no column, anchor has NaN, etc.)."""
        col = cfg["col"]
        if col not in filtered.columns:
            return None
        anchor_val = anchor.get(col)
        if anchor_val is None or pd.isna(anchor_val):
            return None
        vals = filtered[col]
        mode = cfg["mode"]
        if mode == "linear_target":
            return _match_linear_target(vals, float(anchor_val), cfg["decay"])
        if mode == "percentile":
            ranks_all = counties[col].rank(pct=True, na_option="keep")
            anchor_rank = ranks_all.loc[anchor.name] if pd.notna(ranks_all.loc[anchor.name]) else None
            if anchor_rank is None:
                return None
            county_ranks = ranks_all.reindex(filtered.index)
            return _match_linear_target(county_ranks * 100, float(anchor_rank * 100), 30)
        if mode == "categorical":
            return _match_linear_target(vals, float(anchor_val), 30)
        if mode in ("range", "one_sided"):
            return _match_linear_target(vals, float(anchor_val), cfg.get("similar_decay", 20))
        return None

    # First pass: use the user's prefs (whichever dims they've enabled + weighted)
    for key, cfg in DIMENSIONS.items():
        dim: Optional[Dimension] = getattr(req.prefs, key, None)
        if dim is None or (dim.weight or 0) <= 0:
            continue
        m = compute_match_for(key, cfg)
        if m is None:
            continue
        matches[key] = m
        weights[key] = dim.weight

    # Fallback: if the user has no prefs enabled, compute similarity over EVERY
    # applicable dim with equal weight=1 so "find similar" actually works without
    # configuration. Anchor still scores 100 against its own values everywhere.
    if not weights:
        for key, cfg in DIMENSIONS.items():
            m = compute_match_for(key, cfg)
            if m is None:
                continue
            matches[key] = m
            weights[key] = 1.0

    if not weights:
        scored = filtered.assign(_score=50)
    else:
        weighted_sum = pd.Series(0.0, index=filtered.index)
        weight_total = pd.Series(0.0, index=filtered.index)
        for k, m in matches.items():
            w = weights[k]
            valid = m.notna()
            weighted_sum = weighted_sum.add((m.fillna(0) * w).where(valid, 0), fill_value=0)
            weight_total = weight_total.add(
                pd.Series(w, index=m.index).where(valid, 0), fill_value=0
            )
        composite = (weighted_sum / weight_total).where(weight_total > 0)
        scored = filtered.assign(_score=composite)

    scored = scored.sort_values("_score", ascending=False, na_position="last")

    def to_county(row, breakdown_keys) -> ScoredCounty:
        def s(v) -> str:
            return "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)
        return ScoredCounty(
            fips=row["fips"],
            name=s(row.get("county_name", "")),
            state=s(row.get("state", "")),
            score=float(row["_score"]) if pd.notna(row["_score"]) else 0.0,
            breakdown={
                k: (float(matches[k].loc[row.name]) if pd.notna(matches[k].loc[row.name]) else None)
                for k in breakdown_keys if k in matches
            },
        )

    breakdown_keys = list(matches.keys())
    all_results = [to_county(r, breakdown_keys) for _, r in scored.iterrows()]
    top = all_results[: req.limit]

    return ScoreResponse(
        counties=all_results,
        top=top,
        total_after_filter=len(filtered),
        total_before_filter=total_before,
    )
