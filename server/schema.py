"""Pydantic models for /api/score request and response."""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


# A single dimension's preference. Each dimension is independently weighted (0-10).
# `target` semantics depend on the dimension's normalization mode (see scoring.py).
class Dimension(BaseModel):
    weight: float = Field(0, ge=0, le=10)            # 0 disables this dimension
    target: Optional[float] = None                    # ideal value (linear-target mode)
    direction: Optional[Literal["higher", "lower"]] = None  # percentile + one_sided modes
    political_lean: Optional[Literal["strong_d", "lean_d", "neutral", "lean_r", "strong_r"]] = None
    # Range mode (two-handle): in-range = 100, out-of-range = excluded
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    # One-sided mode: threshold + direction. Past threshold (wrong side) = excluded.
    threshold: Optional[float] = None
    # Legacy hard filter — county dropped if value violates this. Still honored.
    max: Optional[float] = None
    min: Optional[float] = None


class AnchorCity(BaseModel):
    name: str
    lat: float
    lon: float
    max_miles: float = 500


class ScoreRequest(BaseModel):
    # Each dimension key maps to a Dimension config. Missing keys = disabled.
    summer_high: Optional[Dimension] = None
    winter_low: Optional[Dimension] = None
    dew_point: Optional[Dimension] = None
    annual_precip: Optional[Dimension] = None
    annual_snow: Optional[Dimension] = None
    sunshine: Optional[Dimension] = None
    aqi: Optional[Dimension] = None

    politics: Optional[Dimension] = None             # uses .political_lean

    home_price: Optional[Dimension] = None
    median_rent: Optional[Dimension] = None
    property_tax: Optional[Dimension] = None
    state_income_tax: Optional[Dimension] = None

    homicide_rate: Optional[Dimension] = None
    firearm_deaths: Optional[Dimension] = None

    disaster_risk: Optional[Dimension] = None
    hurricane_risk: Optional[Dimension] = None
    tornado_risk: Optional[Dimension] = None
    wildfire_risk: Optional[Dimension] = None
    flood_risk: Optional[Dimension] = None
    earthquake_risk: Optional[Dimension] = None

    pop_density: Optional[Dimension] = None
    diversity: Optional[Dimension] = None
    lgbtq_policy: Optional[Dimension] = None
    median_age: Optional[Dimension] = None
    population: Optional[Dimension] = None

    heat_wave_risk: Optional[Dimension] = None

    dist_to_coast: Optional[Dimension] = None
    dist_to_mountains: Optional[Dimension] = None
    elevation: Optional[Dimension] = None

    anchor: Optional[AnchorCity] = None
    continental_only: bool = True            # exclude AK + HI counties by default
    limit: int = Field(100, ge=1, le=3500)


class ScoredCounty(BaseModel):
    fips: str
    name: str
    state: str
    score: float
    breakdown: dict[str, Optional[float]]             # per-dim match 0-100; None = no data


class ScoreResponse(BaseModel):
    counties: list[ScoredCounty]                      # all surviving counties (for map)
    top: list[ScoredCounty]                           # top N for the list (= limit)
    total_after_filter: int
    total_before_filter: int


class SimilarRequest(BaseModel):
    """Find counties similar to `fips`, weighted by the user's prefs.

    Reuses ScoreRequest as the source of weights/direction/political_lean.
    Each enabled dimension uses the anchor county's actual value as the target.
    """
    fips: str
    prefs: ScoreRequest
    apply_filters: bool = False        # if False, ignore min/max + home_price etc.
    continental_only: bool = True
    limit: int = Field(100, ge=1, le=3500)
