"""SETUP tests: link cameras to watchtowers, measured heading / FOV, change log, DB upgrade."""
import json
import os

import pytest

TEST_DB = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")
KEY = "test-node-key"
H = {"X-Node-Key": KEY}
TOWERS = {"schema_version": 1, "towers": [
    {"id": "WT-T1", "name": "Test tower", "lat": 14.3704, "lon": 121.0509, "source": "SYNTHETIC", "notes": "test only"}]}


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    d = tmp_path_factory.mktemp("setup")
    (d / "watchtowers.json").write_text(json.dumps(TOWERS))
    os.environ.update(DATABASE_URL=TEST_DB, NODE_API_KEY=KEY, STORAGE_DIR=str(d / "storage"),
                      WATCHTOWERS_FILE=str(d / "watchtowers.json"))
    from importlib import reload
    from app import settings
    reload(settings)
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        c.post("/api/watchtowers/reload")
        c.delete("/api/cameras/LINK-1")
        r = c.post("/api/nodes/register", json={"camera_id": "LINK-1", "site": "lab", "source_type": "usb"}, headers=H)
        assert r.status_code == 200
        yield c
        c.delete("/api/cameras/LINK-1")


def cam(c):
    return next(x for x in c.get("/api/cameras").json() if x["id"] == "LINK-1")


def test_new_camera_is_unlinked_and_not_measured(client):
    x = cam(client)
    assert x["watchtower_id"] is None and x["heading_deg"] is None and x["hfov_deg"] is None
    assert x["bearing_ready"] is False


def test_link_measure_and_log(client):
    r = client.patch("/api/cameras/LINK-1", json={"watchtower_id": "WT-T1"})
    assert r.status_code == 200 and r.json()["watchtower_id"] == "WT-T1"
    r = client.patch("/api/cameras/LINK-1", json={"heading_deg": 214.5, "hfov_deg": 60})
    assert r.json()["bearing_ready"] is True
    # Only sent fields change: heading stays when only the FOV is cleared.
    r = client.patch("/api/cameras/LINK-1", json={"hfov_deg": None})
    assert r.json()["heading_deg"] == 214.5 and r.json()["hfov_deg"] is None and r.json()["bearing_ready"] is False
    log = client.get("/api/changes?limit=10").json()
    fields = [(e["entity_id"], e["field"], e["new"]) for e in log]
    assert ("LINK-1", "watchtower_id", "WT-T1") in fields
    assert ("LINK-1", "hfov_deg", None) in fields


def test_register_again_keeps_link(client):
    client.patch("/api/cameras/LINK-1", json={"watchtower_id": "WT-T1"})
    client.post("/api/nodes/register", json={"camera_id": "LINK-1", "site": "lab"}, headers=H)
    assert cam(client)["watchtower_id"] == "WT-T1"


def test_unlink(client):
    r = client.patch("/api/cameras/LINK-1", json={"watchtower_id": None})
    assert r.json()["watchtower_id"] is None


@pytest.mark.parametrize("body", [{"watchtower_id": "NOPE"}, {"heading_deg": 360}, {"heading_deg": -1},
                                  {"hfov_deg": 0}, {"hfov_deg": 200}, {"watchtower_id": "bad id!"}])
def test_rejects_bad_values(client, body):
    assert client.patch("/api/cameras/LINK-1", json=body).status_code == 422


def test_unknown_camera(client):
    assert client.patch("/api/cameras/NOPE-9", json={"heading_deg": 10}).status_code == 404


def test_existing_database_is_upgraded(client):
    from sqlalchemy import inspect, text
    from app import db
    with db.engine.begin() as conn:
        conn.execute(text("ALTER TABLE cameras DROP COLUMN IF EXISTS hfov_deg"))
    db._add_missing_columns(db.engine)
    cols = {c["name"] for c in inspect(db.engine).get_columns("cameras")}
    assert {"watchtower_id", "heading_deg", "hfov_deg"} <= cols
