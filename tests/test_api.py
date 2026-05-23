"""API endpoint tests via FastAPI TestClient.

These run against the real counties.sqlite — so make sure the pipeline has
been built before running. Tests target shape of responses and key invariants
rather than specific data values that may shift across data refreshes.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    # Import here so pytest collection doesn't fail when scoring.py imports
    # before main.py module-level code completes.
    from server.main import app
    return TestClient(app)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] in ("ok", "degraded")
    assert "counties" in data


def test_health_has_real_data(client):
    """If the DB is built we expect thousands of counties."""
    r = client.get("/api/health").json()
    assert r["counties"] >= 3000, "Did you run `python -m data_pipeline.build_db`?"


def test_score_empty_prefs(client):
    """No enabled dims → every county scores neutral 50, sorted by FIPS."""
    r = client.post("/api/score", json={"continental_only": False, "limit": 5})
    assert r.status_code == 200
    data = r.json()
    assert data["total_after_filter"] > 3000
    assert len(data["top"]) == 5
    for c in data["top"]:
        assert c["score"] == 50.0


def test_score_continental_only_drops_ak_hi(client):
    r1 = client.post("/api/score", json={"continental_only": True, "limit": 5}).json()
    r2 = client.post("/api/score", json={"continental_only": False, "limit": 5}).json()
    # All-AK/HI together should be ~35 counties
    assert r2["total_after_filter"] - r1["total_after_filter"] >= 30


def test_score_politics_strong_d_returns_blue_counties(client):
    """Sanity check: strong_d should put high-Dem counties at the top."""
    r = client.post("/api/score", json={
        "politics": {"weight": 10, "political_lean": "strong_d"},
        "continental_only": True,
        "limit": 10,
    }).json()
    # The top result's breakdown should show politics scoring very high
    top = r["top"][0]
    assert top["breakdown"]["politics"] > 80


def test_score_returns_breakdown_shape(client):
    r = client.post("/api/score", json={
        "disaster_risk": {"weight": 5, "direction": "lower"},
        "limit": 3,
    }).json()
    for c in r["top"]:
        assert "disaster_risk" in c["breakdown"]
        # breakdown values can be float or None (for NaN data)
        v = c["breakdown"]["disaster_risk"]
        assert v is None or isinstance(v, (int, float))


def test_score_hard_filter_excludes(client):
    """Home-price range should drop super-expensive counties."""
    r = client.post("/api/score", json={
        "home_price": {"weight": 5, "range_min": 100_000, "range_max": 250_000},
        "continental_only": True,
        "limit": 10,
    }).json()
    # All returned counties should have median home value <= 250k
    for c in r["top"]:
        detail = client.get(f"/api/county/{c['fips']}").json()
        mhv = detail.get("median_home_value")
        if mhv is not None:
            assert mhv <= 250_000


def test_county_detail(client):
    r = client.get("/api/county/06037")  # Los Angeles County
    assert r.status_code == 200
    data = r.json()
    assert data["fips"] == "06037"
    assert "Los Angeles" in data["county_name"]
    assert data["state"] == "CA"


def test_county_detail_pads_short_fips(client):
    """Numeric or short FIPS should still resolve."""
    r = client.get("/api/county/6037")     # numeric-looking, no leading zero
    assert r.status_code == 200
    assert r.json()["fips"] == "06037"


def test_county_detail_not_found(client):
    r = client.get("/api/county/99999")
    assert r.status_code == 404


def test_counties_search_basic(client):
    r = client.get("/api/counties/search?q=ashe").json()
    assert isinstance(r, list)
    # Ashe County NC should show up
    names = [c["county_name"] for c in r]
    assert any("Ashe" in n for n in names)


def test_counties_search_empty_query(client):
    r = client.get("/api/counties/search?q=").json()
    assert r == []


def test_counties_search_limit(client):
    r = client.get("/api/counties/search?q=a&limit=3").json()
    assert len(r) <= 3


def test_similar_known_anchor(client):
    """Similar to Los Angeles should put other large CA counties near the top."""
    r = client.post("/api/similar", json={
        "fips": "06037",
        "prefs": {
            "politics": {"weight": 5, "political_lean": "strong_d"},
            "pop_density": {"weight": 5, "target": 2000},
        },
        "continental_only": True,
        "limit": 10,
    }).json()
    # Anchor itself should be #1
    assert r["top"][0]["fips"] == "06037"


def test_similar_invalid_anchor_returns_empty(client):
    r = client.post("/api/similar", json={
        "fips": "00000",
        "prefs": {},
        "limit": 5,
    }).json()
    assert r["top"] == []


def test_score_rejects_invalid_political_lean(client):
    r = client.post("/api/score", json={
        "politics": {"weight": 5, "political_lean": "centrist"},  # not a valid enum
        "limit": 3,
    })
    assert r.status_code == 422  # FastAPI validation error


def test_reload_endpoint(client):
    r = client.post("/api/reload")
    assert r.status_code == 200
    data = r.json()
    assert data["reloaded"] is True
    assert data["counties"] >= 3000
