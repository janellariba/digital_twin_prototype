"""Load config/watchtowers.json, validate it, and sync it into the database.

For the prototype the JSON file is the source of truth: on startup (and when
the dashboard clicks Reload) the table is made to match the file exactly.
"""
import json
import math
import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Watchtower

SOURCES = ("REAL", "SYNTHETIC", "PENDING")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,16}$")


def _num(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def validate(data) -> tuple[list[dict], list[str]]:
    """Return (valid towers, error messages). Same rules as the dashboard."""
    if not isinstance(data, dict):
        return [], ["File is not a JSON object."]
    errors = []
    if data.get("schema_version") != 1:
        errors.append(f"Unsupported schema_version: {data.get('schema_version')}")
    items = data.get("towers")
    if not isinstance(items, list):
        return [], errors + ["Missing 'towers' list."]

    towers, seen = [], set()
    for i, t in enumerate(items, 1):
        if not isinstance(t, dict):
            errors.append(f"Tower #{i}: not an object."); continue
        tid = t.get("id")
        if not isinstance(tid, str) or not ID_RE.match(tid):
            errors.append(f"Tower #{i}: id must be 1 to 16 letters, digits, - or _."); continue
        if tid in seen:
            errors.append(f"{tid}: duplicate id."); continue
        seen.add(tid)
        src = t.get("source")
        if src not in SOURCES:
            errors.append(f"{tid}: source must be REAL, SYNTHETIC or PENDING."); continue
        lat, lon = t.get("lat"), t.get("lon")
        if src == "PENDING":
            if lat is not None or lon is not None:
                errors.append(f"{tid}: PENDING towers must have lat and lon set to null."); continue
        else:
            if not (_num(lat) and _num(lon)):
                errors.append(f"{tid}: {src} towers need numeric lat and lon."); continue
            if abs(lat) > 90 or abs(lon) > 180:
                errors.append(f"{tid}: lat/lon out of range."); continue
        towers.append({
            "id": tid,
            "name": str(t.get("name") or "")[:60],
            "site": (str(t["site"])[:120] if isinstance(t.get("site"), str) else None),
            "lat": None if src == "PENDING" else float(lat),
            "lon": None if src == "PENDING" else float(lon),
            "source": src,
            "notes": str(t.get("notes") or ""),
        })
    return towers, errors


def sync_from_file(db: Session, path: Path) -> list[str]:
    """Make the watchtowers table match the file. Returns validation errors."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [f"Watchtower file not found: {path}"]
    except json.JSONDecodeError as e:
        return [f"{path.name} is not valid JSON (line {e.lineno}): {e.msg}"]

    towers, errors = validate(data)
    existing = {w.id: w for w in db.scalars(select(Watchtower))}
    keep = set()
    for t in towers:
        keep.add(t["id"])
        row = existing.get(t["id"]) or Watchtower(id=t["id"])
        for k, v in t.items():
            setattr(row, k, v)
        db.add(row)
    for tid, row in existing.items():
        if tid not in keep:
            db.delete(row)
    db.commit()
    return errors


def to_dict(w: Watchtower) -> dict:
    return {"id": w.id, "name": w.name, "site": w.site, "lat": w.lat, "lon": w.lon, "source": w.source, "notes": w.notes}
