"""Simulated fire -> simulated bearings -> triangulation.

1. The user places a fire (lat/lon). This is the GROUND TRUTH.
2. For every positioned tower within max range, compute the true bearing to
   the fire and add random noise (normal distribution, std = noise_deg).
   These are the simulated observations (source_type = "simulated").
3. Triangulate the noisy bearings. The estimate is stored separately from
   the truth, together with its error in metres.
"""
import json
import math
import random
from pathlib import Path

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import geo
from .models import Observation, Simulation, Triangulation, Watchtower
from .triangulation import Ray, ellipse_95, inside_95, triangulate

REQUIRED_KEYS = ("bearing_noise_deg_default", "bearing_noise_deg_max", "min_ray_angle_deg", "max_range_m", "ray_display_extend")


class ConfigError(Exception):
    pass


def load_config(path: Path) -> dict:
    """Read simulation.json (re-read on every request, so edits apply without restart)."""
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as e:
        raise ConfigError(f"Cannot read {path.name}: {e}") from e
    missing = [k for k in REQUIRED_KEYS if not isinstance(cfg.get(k), (int, float)) or isinstance(cfg.get(k), bool)]
    if missing:
        raise ConfigError(f"{path.name} is missing numeric values for: {', '.join(missing)}")
    return {k: float(cfg[k]) for k in REQUIRED_KEYS}


def run(db: Session, cfg: dict, truth_lat: float, truth_lon: float, noise_deg: float,
        seed: int | None = None, tower_ids: list[str] | None = None) -> Simulation:
    seed = seed if seed is not None else random.SystemRandom().randrange(0, 2**31 - 1)
    rng = np.random.default_rng(seed)

    q = select(Watchtower).where(Watchtower.source != "PENDING").order_by(Watchtower.id)
    towers = [t for t in db.scalars(q) if t.lat is not None and t.lon is not None]
    if tower_ids:
        wanted = set(tower_ids)
        towers = [t for t in towers if t.id in wanted]

    sim = Simulation(truth_lat=truth_lat, truth_lon=truth_lon, noise_deg=noise_deg, seed=seed,
                     params={k: cfg[k] for k in ("min_ray_angle_deg", "max_range_m")}, skipped=[])
    rays, skipped = [], []
    for t in towers:
        brg, dist = geo.bearing_and_distance(t.lat, t.lon, truth_lat, truth_lon)
        if dist > cfg["max_range_m"]:
            skipped.append({"tower_id": t.id, "reason": f"{dist:.0f} m away, beyond max range"})
            continue
        if dist < 1.0:
            skipped.append({"tower_id": t.id, "reason": "fire is at the tower itself"})
            continue
        err = float(rng.normal(0.0, noise_deg)) if noise_deg > 0 else 0.0
        observed = (brg + err) % 360.0
        sim.observations.append(Observation(
            source_type="simulated", tower_id=t.id, tower_source=t.source, tower_lat=t.lat, tower_lon=t.lon,
            true_bearing_deg=brg, observed_bearing_deg=observed, range_to_truth_m=dist,
        ))
        origin, direction = geo.ray_in_crs(t.lat, t.lon, observed)
        rays.append(Ray(t.id, origin, direction, noise_deg))
    sim.skipped = skipped

    res = triangulate(rays, cfg["min_ray_angle_deg"], cfg["max_range_m"])
    tri = Triangulation(status=res.status, reason=res.reason, n_rays=res.n_rays,
                        max_ray_angle_deg=res.max_ray_angle_deg, residual_rms_deg=res.residual_rms_deg)
    if res.status == "ok":
        tri.est_lat, tri.est_lon = geo.to_latlon(res.point)
        _, tri.error_m = geo.bearing_and_distance(truth_lat, truth_lon, tri.est_lat, tri.est_lon)
        tri.ellipse_major_m, tri.ellipse_minor_m, tri.ellipse_orientation_deg = ellipse_95(res.cov)
        tri.truth_inside_95 = inside_95(res.cov, res.point, geo.to_xy(truth_lat, truth_lon))
    sim.triangulation = tri

    db.add(sim)
    db.commit()
    db.refresh(sim)
    return sim


def to_dict(sim: Simulation, cfg: dict | None = None) -> dict:
    tri = sim.triangulation
    extend = (cfg or {}).get("ray_display_extend", 1.3)
    max_range = sim.params.get("max_range_m", 8000)
    obs = []
    for o in sim.observations:
        # Display endpoint of the bearing line (display only, never used in the math).
        if tri and tri.status == "ok":
            _, d = geo.bearing_and_distance(o.tower_lat, o.tower_lon, tri.est_lat, tri.est_lon)
            length = min(d * extend, max_range)
        else:
            length = max_range
        end_lat, end_lon = geo.destination(o.tower_lat, o.tower_lon, o.observed_bearing_deg, length)
        err = (o.observed_bearing_deg - o.true_bearing_deg + 180.0) % 360.0 - 180.0
        obs.append({
            "tower_id": o.tower_id, "tower_source": o.tower_source,
            "tower_lat": o.tower_lat, "tower_lon": o.tower_lon,
            "source_type": o.source_type,
            "true_bearing_deg": round(o.true_bearing_deg, 4),
            "observed_bearing_deg": round(o.observed_bearing_deg, 4),
            "bearing_error_deg": round(err, 4),
            "range_to_truth_m": round(o.range_to_truth_m, 1),
            "ray_end": {"lat": end_lat, "lon": end_lon},
        })
    result = None
    if tri:
        result = {
            "status": tri.status, "reason": tri.reason, "n_rays": tri.n_rays,
            "max_ray_angle_deg": tri.max_ray_angle_deg, "residual_rms_deg": tri.residual_rms_deg,
            "estimate": None if tri.status != "ok" else {
                "lat": tri.est_lat, "lon": tri.est_lon,
                "label": "ESTIMATE (from simulated bearings)",
            },
            "error_m": tri.error_m,
            "ellipse_95": None if tri.status != "ok" else {
                "semi_major_m": tri.ellipse_major_m, "semi_minor_m": tri.ellipse_minor_m,
                "orientation_deg": tri.ellipse_orientation_deg,
                "frame": f"EPSG:{geo.settings.CRS_EPSG} grid north",
            },
            "truth_inside_95": tri.truth_inside_95,
        }
    return {
        "id": sim.id,
        "created_at": sim.created_at.isoformat(),
        "source_type": "simulated",
        "truth": {"lat": sim.truth_lat, "lon": sim.truth_lon, "label": "SIMULATION GROUND TRUTH"},
        "noise_deg": sim.noise_deg,
        "seed": sim.seed,
        "params": sim.params,
        "observations": obs,
        "skipped": sim.skipped,
        "result": result,
        "tower_sources": sorted({o.tower_source for o in sim.observations}),
    }
