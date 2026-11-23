"""API tests against a real database.

Set TEST_DATABASE_URL to an EMPTY test database (these tests delete all
simulations). Skipped if it is not set. Uses its own SYNTHETIC tower file.
"""
import json
import os

import pytest

TEST_DB = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")

# SYNTHETIC test towers (barangay label points from the twin), test use only.
TOWERS = {"schema_version": 1, "towers": [
    {"id": "T1", "name": "test", "lat": 14.36818, "lon": 121.03060, "source": "SYNTHETIC"},
    {"id": "T2", "name": "test", "lat": 14.38026, "lon": 121.02362, "source": "SYNTHETIC"},
    {"id": "T3", "name": "test", "lat": 14.39719, "lon": 121.04132, "source": "SYNTHETIC"},
    {"id": "T4", "name": "pending", "lat": None, "lon": None, "source": "PENDING"},
    {"id": "bad id!", "lat": 1, "lon": 1, "source": "REAL"},
]}


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    tower_file = tmp_path_factory.mktemp("cfg") / "watchtowers.json"
    tower_file.write_text(json.dumps(TOWERS))
    os.environ["DATABASE_URL"] = TEST_DB
    os.environ["WATCHTOWERS_FILE"] = str(tower_file)
    from importlib import reload
    from app import settings
    reload(settings)
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        c.delete("/api/simulations")
        yield c


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok"


def test_watchtowers_synced(client):
    r = client.get("/api/watchtowers").json()
    assert [t["id"] for t in r["towers"]] == ["T1", "T2", "T3", "T4"]
    assert any("bad id!" not in e and "id must be" in e for e in r["file_errors"])


def test_zero_noise_simulation_is_exact(client):
    r = client.post("/api/simulations", json={"lat": 14.385, "lon": 121.035, "noise_deg": 0}).json()
    res = r["result"]
    assert r["source_type"] == "simulated" and res["status"] == "ok" and res["n_rays"] == 3
    assert res["error_m"] < 0.5, res["error_m"]  # geodesic vs straight-line in UTM: sub-metre
    assert r["truth"]["label"] == "SIMULATION GROUND TRUTH"
    assert all(o["source_type"] == "simulated" for o in r["observations"])


def test_noisy_simulation_is_reproducible_with_seed(client):
    body = {"lat": 14.39, "lon": 121.03, "noise_deg": 2, "seed": 42}
    a = client.post("/api/simulations", json=body).json()
    b = client.post("/api/simulations", json=body).json()
    assert a["result"]["estimate"] == b["result"]["estimate"]
    assert a["truth"] != a["result"]["estimate"]  # truth kept separate from estimate


def test_bad_input_rejected(client):
    assert client.post("/api/simulations", json={"lat": 95, "lon": 121}).status_code == 422
    assert client.post("/api/simulations", json={"lat": 14.39, "lon": 121.03, "noise_deg": 99}).status_code == 422


def test_list_get_delete(client):
    sims = client.get("/api/simulations").json()
    assert len(sims) >= 3
    sid = sims[0]["id"]
    assert client.get(f"/api/simulations/{sid}").status_code == 200
    assert client.delete(f"/api/simulations/{sid}").status_code == 204
    assert client.get(f"/api/simulations/{sid}").status_code == 404
    assert client.delete("/api/simulations").status_code == 204
    assert client.get("/api/simulations").json() == []
