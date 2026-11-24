"""Camera node API tests against a real database (TEST_DATABASE_URL, an EMPTY test DB)."""
import base64
import json
import os
import uuid
from datetime import datetime, timezone

import pytest

TEST_DB = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")
KEY = "test-node-key"
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 100  # enough to pass the JPEG header check


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    d = tmp_path_factory.mktemp("cam")
    (d / "watchtowers.json").write_text(json.dumps({"schema_version": 1, "towers": []}))
    os.environ.update(DATABASE_URL=TEST_DB, NODE_API_KEY=KEY, STORAGE_DIR=str(d / "storage"),
                      WATCHTOWERS_FILE=str(d / "watchtowers.json"))
    from importlib import reload
    from app import settings
    reload(settings)
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        c.delete("/api/cameras/TEST-1")
        yield c


H = {"X-Node-Key": KEY}


def event(**kw):
    e = {
        "event_id": str(uuid.uuid4()), "camera_id": "TEST-1", "source_type": "ai",
        "captured_at": datetime.now(timezone.utc).isoformat(), "frame_width": 640, "frame_height": 480,
        "model_name": "best.pt", "conf_threshold": 0.5, "pan_deg": None,
        "detections": [{"class_id": 0, "class_name": "fire", "confidence": 0.91,
                        "bbox_xyxy": [100, 100, 200, 220], "center_x": 150, "center_y": 160}],
        "snapshot_jpeg_b64": base64.b64encode(JPEG).decode(),
    }
    e.update(kw)
    return e


def test_node_key_required(client):
    assert client.post("/api/nodes/register", json={"camera_id": "TEST-1"}).status_code == 401
    assert client.post("/api/nodes/register", json={"camera_id": "TEST-1"}, headers={"X-Node-Key": "wrong"}).status_code == 401


def test_register_heartbeat_frame_online(client):
    r = client.post("/api/nodes/register", headers=H, json={"camera_id": "TEST-1", "label": "t", "site": "lab", "source": "USB webcam #1"})
    assert r.status_code == 200
    assert client.post("/api/nodes/TEST-1/heartbeat", headers=H, json={"status": "ok", "capture_fps": 30}).status_code == 200
    assert client.put("/api/nodes/TEST-1/frame", headers={**H, "Content-Type": "image/jpeg"}, content=JPEG).status_code == 204
    cams = {c["id"]: c for c in client.get("/api/cameras").json()}
    assert cams["TEST-1"]["state"] == "ONLINE" and cams["TEST-1"]["detecting"] is False
    f = client.get("/api/cameras/TEST-1/frame.jpg")
    assert f.status_code == 200 and f.content == JPEG


def test_error_status_shown(client):
    client.post("/api/nodes/TEST-1/heartbeat", headers=H, json={"status": "camera_error", "message": "Cannot open"})
    cam = {c["id"]: c for c in client.get("/api/cameras").json()}["TEST-1"]
    assert cam["state"] == "ERROR" and cam["message"] == "Cannot open"
    client.post("/api/nodes/TEST-1/heartbeat", headers=H, json={"status": "ok"})


def test_detection_saved_once_with_snapshot(client):
    ev = event()
    r1 = client.post("/api/detections", headers=H, json=ev)
    r2 = client.post("/api/detections", headers=H, json=ev)  # resend after "network error"
    assert r1.status_code == 201 and r2.json().get("duplicate") is True
    dets = client.get("/api/detections?camera_id=TEST-1").json()
    assert len([d for d in dets if d["event_id"] == ev["event_id"]]) == 1
    d = dets[0]
    assert d["source_type"] == "ai" and d["classes"] == ["fire"]
    assert client.get(d["snapshot_url"]).content == JPEG
    cam = {c["id"]: c for c in client.get("/api/cameras").json()}["TEST-1"]
    assert cam["detecting"] is True


def test_simulated_source_rejected(client):
    assert client.post("/api/detections", headers=H, json=event(source_type="simulated")).status_code == 422


def test_bad_snapshot_and_frame_rejected(client):
    assert client.post("/api/detections", headers=H, json=event(snapshot_jpeg_b64="not base64!!")).status_code == 422
    r = client.put("/api/nodes/TEST-1/frame", headers={**H, "Content-Type": "image/jpeg"}, content=b"PNG...")
    assert r.status_code == 422
