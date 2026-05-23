"""Shared pytest fixtures.

Most tests run against a tiny synthetic counties dataframe so they're fast
and deterministic without needing the production SQLite.
"""
from __future__ import annotations

import math

import pandas as pd
import pytest


@pytest.fixture
def tiny_counties() -> pd.DataFrame:
    """A 6-county dataframe with deliberate variety across every scoring dimension."""
    return pd.DataFrame([
        # Cool, blue, coastal, low-disaster, expensive city
        {
            "fips": "06075", "county_name": "San Francisco", "state": "CA",
            "lat": 37.7, "lon": -122.4,
            "dem_share_pct": 85.0, "gop_share_pct": 13.0,
            "median_home_value": 1_400_000, "median_rent": 2500,
            "property_tax_pct": 0.7, "state_income_tax_pct": 13.3,
            "homicide_per_100k": 7.0, "firearm_deaths_per_100k": 5.0,
            "fema_risk_score": 38.0, "fema_hurricane": 0, "fema_tornado": 0,
            "fema_wildfire": 40, "fema_flood": 30, "fema_earthquake": 90,
            "summer_high_f": 70, "winter_low_f": 47, "dew_point_f": 52,
            "annual_precip_in": 23, "annual_snow_in": 0, "sunshine_pct": 67,
            "aqi_mean": 45,
            "pop_density": 18000, "diversity_pct": 55, "lgbtq_policy_score": 95,
            "dist_to_coast_mi": 0, "dist_to_mountains_mi": 60,
        },
        # Warm, red, inland, low-disaster, cheap
        {
            "fips": "48201", "county_name": "Harris", "state": "TX",
            "lat": 29.8, "lon": -95.4,
            "dem_share_pct": 49.0, "gop_share_pct": 50.0,
            "median_home_value": 250_000, "median_rent": 1200,
            "property_tax_pct": 2.2, "state_income_tax_pct": 0.0,
            "homicide_per_100k": 12.0, "firearm_deaths_per_100k": 18.0,
            "fema_risk_score": 75.0, "fema_hurricane": 70, "fema_tornado": 50,
            "fema_wildfire": 5, "fema_flood": 80, "fema_earthquake": 5,
            "summer_high_f": 94, "winter_low_f": 45, "dew_point_f": 70,
            "annual_precip_in": 50, "annual_snow_in": 0, "sunshine_pct": 60,
            "aqi_mean": 55,
            "pop_density": 2900, "diversity_pct": 70, "lgbtq_policy_score": 20,
            "dist_to_coast_mi": 30, "dist_to_mountains_mi": 600,
        },
        # Mild, blue, mountain, low-cost, low-population
        {
            "fips": "50007", "county_name": "Chittenden", "state": "VT",
            "lat": 44.5, "lon": -73.2,
            "dem_share_pct": 70.0, "gop_share_pct": 27.0,
            "median_home_value": 380_000, "median_rent": 1500,
            "property_tax_pct": 1.8, "state_income_tax_pct": 8.75,
            "homicide_per_100k": 1.5, "firearm_deaths_per_100k": 5.0,
            "fema_risk_score": 18.0, "fema_hurricane": 5, "fema_tornado": 8,
            "fema_wildfire": 2, "fema_flood": 25, "fema_earthquake": 5,
            "summer_high_f": 80, "winter_low_f": 12, "dew_point_f": 56,
            "annual_precip_in": 41, "annual_snow_in": 80, "sunshine_pct": 55,
            "aqi_mean": 30,
            "pop_density": 350, "diversity_pct": 11, "lgbtq_policy_score": 95,
            "dist_to_coast_mi": 240, "dist_to_mountains_mi": 5,
        },
        # County with lots of NaN — tests missing-data handling
        {
            "fips": "02060", "county_name": "Bristol Bay", "state": "AK",
            "lat": 58.7, "lon": -156.4,
            "dem_share_pct": 43.0, "gop_share_pct": 57.0,
            "median_home_value": float("nan"), "median_rent": float("nan"),
            "property_tax_pct": float("nan"), "state_income_tax_pct": 0.0,
            "homicide_per_100k": float("nan"), "firearm_deaths_per_100k": float("nan"),
            "fema_risk_score": 5.0, "fema_hurricane": 0, "fema_tornado": 0,
            "fema_wildfire": 0, "fema_flood": 0, "fema_earthquake": 50,
            "summer_high_f": 60, "winter_low_f": -5, "dew_point_f": 45,
            "annual_precip_in": 30, "annual_snow_in": 80, "sunshine_pct": 40,
            "aqi_mean": 28,
            "pop_density": 0.5, "diversity_pct": 60, "lgbtq_policy_score": 30,
            "dist_to_coast_mi": 20, "dist_to_mountains_mi": 30,
        },
        # Sunshine-state archetype (FL): humid, blue/swing, low cost, hurricane risk
        {
            "fips": "12086", "county_name": "Miami-Dade", "state": "FL",
            "lat": 25.6, "lon": -80.5,
            "dem_share_pct": 45.0, "gop_share_pct": 54.0,
            "median_home_value": 410_000, "median_rent": 1900,
            "property_tax_pct": 1.0, "state_income_tax_pct": 0.0,
            "homicide_per_100k": 6.0, "firearm_deaths_per_100k": 10.0,
            "fema_risk_score": 88.0, "fema_hurricane": 95, "fema_tornado": 30,
            "fema_wildfire": 5, "fema_flood": 75, "fema_earthquake": 1,
            "summer_high_f": 91, "winter_low_f": 60, "dew_point_f": 73,
            "annual_precip_in": 60, "annual_snow_in": 0, "sunshine_pct": 70,
            "aqi_mean": 38,
            "pop_density": 1400, "diversity_pct": 87, "lgbtq_policy_score": 15,
            "dist_to_coast_mi": 1, "dist_to_mountains_mi": 1000,
        },
        # High-desert / mountain west (NM): dry, low pop, mixed politics
        {
            "fips": "35001", "county_name": "Bernalillo", "state": "NM",
            "lat": 35.1, "lon": -106.7,
            "dem_share_pct": 60.0, "gop_share_pct": 37.0,
            "median_home_value": 290_000, "median_rent": 1100,
            "property_tax_pct": 0.9, "state_income_tax_pct": 5.9,
            "homicide_per_100k": 11.0, "firearm_deaths_per_100k": 17.0,
            "fema_risk_score": 22.0, "fema_hurricane": 0, "fema_tornado": 12,
            "fema_wildfire": 60, "fema_flood": 10, "fema_earthquake": 18,
            "summer_high_f": 89, "winter_low_f": 24, "dew_point_f": 35,
            "annual_precip_in": 10, "annual_snow_in": 12, "sunshine_pct": 76,
            "aqi_mean": 38,
            "pop_density": 580, "diversity_pct": 75, "lgbtq_policy_score": 90,
            "dist_to_coast_mi": 800, "dist_to_mountains_mi": 5,
        },
    ])


@pytest.fixture
def haversine_pairs():
    """Known haversine distances for sanity-checking the distance helper.
    (lat1, lon1, lat2, lon2, expected_miles, tolerance_miles)
    """
    return [
        # NYC to LA
        (40.71, -74.01, 34.05, -118.24, 2451, 30),
        # SF to Oakland (close)
        (37.77, -122.42, 37.80, -122.27, 8.7, 1),
        # Same point
        (40.0, -75.0, 40.0, -75.0, 0.0, 0.1),
    ]
