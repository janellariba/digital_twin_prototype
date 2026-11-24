"""Camera node API.

Node -> server (need the X-Node-Key header):
    POST /api/nodes/register              node says hello (who it is, model, source)
    POST /api/nodes/{id}/heartbeat        every few seconds: status, fps
    PUT  /api/nodes/{id}/frame            latest preview JPEG (kept in memory only)
    POST /api/detections                  a detection event + snapshot (saved to DB + disk)

Dashboard -> server:
    GET  /api/cameras                     all cameras with ONLINE / OFFLINE / ERROR status
    GET  /api/cameras/{id}/frame.jpg      latest preview image
    GET  /api/detections                  recent detections
    GET  /api/detections/{id}/snapshot.jpg
"""
import base64
import binascii
import hmac
import json
import logging
import math
import re
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import db as dbmod
from . import settings
from .models import Camera, Detection

log = logging.getLogger("aisunog.cameras")
router = APIRouter()
ID_PATTERN = r"^[A-Za-z0-9_-]{1,16}$"
MAX_FRAME_BYTES = 1_000_000

# Latest preview frame per camera, in memory only: {camera_id: (jpeg_bytes, unix_time)}.
# Requires a single server process (fine for the prototype).
_frames: dict[str, tuple[bytes, float]] = {}


def monitoring_config() -> dict:
    try:
        cfg = json.loads(settings.MONITORING_FILE.read_text(encoding="utf-8"))
        return {k: float(cfg[k]) for k in ("offline_after_s", "detecting_window_s", "max_snapshot_bytes")}
    except (OSError, KeyError, TypeError, ValueError) as e:
        raise HTTPException(500, f"Cannot read {settings.MONITORING_FILE.name}: {e}")


def require_node_key(x_node_key: str = Header(default="")):
    if not settings.NODE_API_KEY or settings.NODE_API_KEY == "CHANGE_ME":
        raise HTTPException(503, "NODE_API_KEY is not set in server/.env")
    if not hmac.compare_digest(x_node_key, settings.NODE_API_KEY):
        raise HTTPException(401, "Invalid node key")


def _now():
    return datetime.now(timezone.utc)


def _aware(dt):
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------- node -> server ----------
class RegisterRequest(BaseModel):
    camera_id: str = Field(pattern=ID_PATTERN)
    node_id: str = Field(default="", max_length=40)
    label: str = Field(default="", max_length=60)
    site: str = Field(default="", max_length=20)
    source: str = Field(default="", max_length=120)
    source_type: str = Field(default="", max_length=10)
    model_name: str = Field(default="", max_length=120)
    classes: list[str] = Field(default_factory=list, max_length=50)
    device: str = Field(default="", max_length=20)
    software_version: str = Field(default="", max_length=20)


@router.post("/api/nodes/register", dependencies=[Depends(require_node_key)])
def register(req: RegisterRequest, db: Session = Depends(dbmod.get_db)):
    cam = db.get(Camera, req.camera_id) or Camera(id=req.camera_id)
    for k, v in req.model_dump().items():
        if k != "camera_id":
            setattr(cam, k, v)
    cam.last_seen = _now()
    db.add(cam)
    db.commit()
    log.info("Camera %s registered from %s (%s, %s on %s)", cam.id, cam.node_id, cam.source, cam.model_name, cam.device)
    return {"ok": True}


class Heartbeat(BaseModel):
    status: str = Field(max_length=20)
    message: str = Field(default="", max_length=200)
    capture_fps: float | None = None
    inference_fps: float | None = None
    inference_ms: float | None = None
    frame_width: int | None = None
    frame_height: int | None = None
    detecting: bool = False
    queued_events: int = 0


@router.post("/api/nodes/{camera_id}/heartbeat", dependencies=[Depends(require_node_key)])
def heartbeat(camera_id: str, hb: Heartbeat, db: Session = Depends(dbmod.get_db)):
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(404, "Unknown camera; register first")
    cam.last_seen = _now()
    cam.last_status = hb.model_dump()
    db.commit()
    return {"ok": True}


@router.put("/api/nodes/{camera_id}/frame", dependencies=[Depends(require_node_key)])
async def put_frame(camera_id: str, request: Request):
    if not re.match(ID_PATTERN, camera_id):
        raise HTTPException(422, "Invalid camera id")
    body = await request.body()
    if not body.startswith(b"\xff\xd8") or len(body) > MAX_FRAME_BYTES:
        raise HTTPException(422, "Body must be a JPEG under 1 MB")
    _frames[camera_id] = (body, time.time())
    return Response(status_code=204)


class Box(BaseModel):
    class_id: int
    class_name: str = Field(max_length=30)
    confidence: float = Field(ge=0, le=1)
    bbox_xyxy: list[float] = Field(min_length=4, max_length=4)
    center_x: float
    center_y: float | None = None


class DetectionEvent(BaseModel):
    event_id: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    camera_id: str = Field(pattern=ID_PATTERN)
    source_type: str
    captured_at: datetime
    frame_width: int = Field(gt=0, le=10000)
    frame_height: int = Field(gt=0, le=10000)
    model_name: str = Field(default="", max_length=120)
    conf_threshold: float | None = Field(default=None, ge=0, le=1)
    pan_deg: float | None = None
    detections: list[Box] = Field(min_length=1, max_length=100)
    snapshot_jpeg_b64: str | None = None

    @field_validator("source_type")
    @classmethod
    def only_ai(cls, v):
        # Simulated bearings live in the simulation tables. This endpoint is for real detections only.
        if v != "ai":
            raise ValueError("camera detections must have source_type 'ai'")
        return v

    @field_validator("pan_deg")
    @classmethod
    def finite(cls, v):
        if v is not None and not math.isfinite(v):
            raise ValueError("must be finite")
        return v


@router.post("/api/detections", status_code=201, dependencies=[Depends(require_node_key)])
def post_detection(ev: DetectionEvent, db: Session = Depends(dbmod.get_db)):
    if db.scalar(select(Detection.id).where(Detection.event_id == ev.event_id)):
        return {"ok": True, "duplicate": True}  # resent after a network error
    cam = db.get(Camera, ev.camera_id)
    if not cam:
        raise HTTPException(404, "Unknown camera; register first")

    snapshot_path = None
    if ev.snapshot_jpeg_b64:
        try:
            jpg = base64.b64decode(ev.snapshot_jpeg_b64, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(422, "snapshot_jpeg_b64 is not valid base64")
        if not jpg.startswith(b"\xff\xd8") or len(jpg) > monitoring_config()["max_snapshot_bytes"]:
            raise HTTPException(422, "Snapshot must be a JPEG within the size limit")
        day = ev.captured_at.astimezone(timezone.utc).strftime("%Y-%m-%d")
        rel = f"snapshots/{ev.camera_id}/{day}/{ev.event_id}.jpg"
        out = settings.STORAGE_DIR / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(jpg)
        snapshot_path = rel

    boxes = [b.model_dump() for b in ev.detections]
    det = Detection(
        event_id=ev.event_id, camera_id=ev.camera_id, source_type="ai", captured_at=ev.captured_at,
        frame_width=ev.frame_width, frame_height=ev.frame_height, model_name=ev.model_name,
        conf_threshold=ev.conf_threshold, pan_deg=ev.pan_deg,
        classes=",".join(sorted({b["class_name"] for b in boxes}))[:60],
        max_confidence=max(b["confidence"] for b in boxes), boxes=boxes, snapshot_path=snapshot_path,
    )
    cam.last_detection_at = _now()
    db.add(det)
    try:
        db.commit()
    except IntegrityError:  # same event arrived twice at the same moment
        db.rollback()
        return {"ok": True, "duplicate": True}
    return {"ok": True, "id": det.id}


# ---------- dashboard -> server ----------
def camera_dict(cam: Camera, mon: dict) -> dict:
    now = _now()
    last_seen = _aware(cam.last_seen)
    age = (now - last_seen).total_seconds() if last_seen else None
    hb = cam.last_status or {}
    if age is None or age > mon["offline_after_s"]:
        state = "OFFLINE"
    elif hb.get("status") not in (None, "ok"):
        state = "ERROR"
    else:
        state = "ONLINE"
    last_det = _aware(cam.last_detection_at)
    detecting = state == "ONLINE" and last_det is not None and (now - last_det).total_seconds() <= mon["detecting_window_s"]
    frame = _frames.get(cam.id)
    return {
        "id": cam.id, "label": cam.label, "site": cam.site, "node_id": cam.node_id,
        "source": cam.source, "source_type": cam.source_type,
        "model_name": cam.model_name, "classes": cam.classes, "device": cam.device,
        "state": state, "detecting": detecting,
        "message": hb.get("message", "") if state == "ERROR" else "",
        "last_seen": last_seen.isoformat() if last_seen else None,
        "seconds_since_seen": round(age, 1) if age is not None else None,
        "capture_fps": hb.get("capture_fps"), "inference_fps": hb.get("inference_fps"),
        "inference_ms": hb.get("inference_ms"), "queued_events": hb.get("queued_events", 0),
        "frame_width": hb.get("frame_width"), "frame_height": hb.get("frame_height"),
        "last_detection_at": last_det.isoformat() if last_det else None,
        "frame_age_s": round(time.time() - frame[1], 1) if frame else None,
    }


@router.get("/api/cameras")
def list_cameras(db: Session = Depends(dbmod.get_db)):
    mon = monitoring_config()
    cams = db.scalars(select(Camera).order_by(Camera.id))
    return [camera_dict(c, mon) for c in cams]


@router.get("/api/cameras/{camera_id}/frame.jpg")
def get_frame(camera_id: str):
    f = _frames.get(camera_id)
    if not f:
        raise HTTPException(404, "No frame yet")
    return Response(f[0], media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@router.delete("/api/cameras/{camera_id}", status_code=204)
def remove_camera(camera_id: str, db: Session = Depends(dbmod.get_db)):
    """Forget a camera (e.g. an old test id). It reappears if its node starts again."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(404, "Unknown camera")
    db.delete(cam)
    db.commit()
    _frames.pop(camera_id, None)


def detection_dict(d: Detection) -> dict:
    return {
        "id": d.id, "event_id": d.event_id, "camera_id": d.camera_id, "source_type": d.source_type,
        "captured_at": _aware(d.captured_at).isoformat(), "received_at": _aware(d.received_at).isoformat(),
        "frame_width": d.frame_width, "frame_height": d.frame_height, "model_name": d.model_name,
        "pan_deg": d.pan_deg, "classes": d.classes.split(",") if d.classes else [],
        "max_confidence": d.max_confidence, "boxes": d.boxes,
        "snapshot_url": f"/api/detections/{d.id}/snapshot.jpg" if d.snapshot_path else None,
    }


@router.get("/api/detections")
def list_detections(camera_id: str | None = None, limit: int = 20, db: Session = Depends(dbmod.get_db)):
    q = select(Detection).order_by(Detection.id.desc()).limit(max(1, min(limit, 200)))
    if camera_id:
        q = q.where(Detection.camera_id == camera_id)
    return [detection_dict(d) for d in db.scalars(q)]


@router.get("/api/detections/{det_id}/snapshot.jpg")
def get_snapshot(det_id: int, db: Session = Depends(dbmod.get_db)):
    d = db.get(Detection, det_id)
    if not d or not d.snapshot_path:
        raise HTTPException(404, "No snapshot")
    path = (settings.STORAGE_DIR / d.snapshot_path).resolve()
    if settings.STORAGE_DIR.resolve() not in path.parents or not path.exists():
        raise HTTPException(404, "Snapshot file missing")
    return FileResponse(path, media_type="image/jpeg")
