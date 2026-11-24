"""Load and check a camera node's config (camera JSON + shared detection JSON + .env)."""
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv

NODE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(NODE_DIR / ".env")

ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,16}$")
DETECTION_KEYS = {
    "conf_threshold": (0.0, 1.0), "inference_fps": (0.1, 60), "preview_fps": (0.1, 30),
    "preview_width": (160, 1920), "jpeg_quality": (10, 100), "event_min_interval_s": (0.0, 3600),
    "heartbeat_interval_s": (0.5, 60),
}


class ConfigError(Exception):
    pass


def _read(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ConfigError(f"Config file not found: {path}")
    except json.JSONDecodeError as e:
        raise ConfigError(f"{path.name} is not valid JSON (line {e.lineno}): {e.msg}")


def load(camera_config: str) -> dict:
    path = Path(camera_config)
    if not path.is_absolute():
        path = (Path.cwd() / path) if (Path.cwd() / path).exists() else NODE_DIR / path
    cam = _read(path)

    if not isinstance(cam.get("camera_id"), str) or not ID_RE.match(cam["camera_id"]):
        raise ConfigError(f"{path.name}: camera_id must be 1 to 16 letters, digits, - or _")
    if not str(cam.get("server_url", "")).startswith(("http://", "https://")):
        raise ConfigError(f"{path.name}: server_url must start with http:// or https://")

    src = cam.get("source") or {}
    if src.get("type") not in ("usb", "file"):
        raise ConfigError(f"{path.name}: source.type must be 'usb' or 'file' ('rtsp' comes with the Hikvision step)")
    if src["type"] == "usb" and not isinstance(src.get("device_index"), int):
        raise ConfigError(
            f"{path.name}: source.device_index is not set. Run  python tools/list_cameras.py  "
            "to see which index each webcam has, then put it in this file."
        )
    if src["type"] == "file":
        fp = Path(src.get("path", ""))
        src["path"] = str(fp if fp.is_absolute() else NODE_DIR / fp)
        if not Path(src["path"]).exists():
            raise ConfigError(f"{path.name}: video file not found: {src['path']}")

    det_path = path.parent / cam.get("detection_config", "detection.json")
    det = _read(det_path)
    for key, (lo, hi) in DETECTION_KEYS.items():
        v = det.get(key)
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not lo <= v <= hi:
            raise ConfigError(f"{det_path.name}: {key} must be a number between {lo} and {hi}")
    model = Path(det.get("model_path", ""))
    det["model_path"] = str(model if model.is_absolute() else NODE_DIR / model)
    if not Path(det["model_path"]).exists():
        raise ConfigError(f"Model file not found: {det['model_path']}  (copy your best.pt into camera_node/models/)")

    key = os.environ.get("NODE_API_KEY", "")
    if not key or key == "CHANGE_ME":
        raise ConfigError("NODE_API_KEY is not set. Create camera_node/.env (see .env.example) with the same key as server/.env")

    cam["detection"] = det
    cam["api_key"] = key
    cam["config_file"] = str(path)
    return cam
