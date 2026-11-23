"""Math tests for the solver. No database needed.

Tower positions here are SYNTHETIC test geometry (plain metres), not project data.
"""
import math

import numpy as np

from app.triangulation import Ray, ellipse_95, inside_95, triangulate

MIN_ANGLE = 5.0
MAX_RANGE = 8000.0


def ray_to(tower_id, origin, target, sigma=1.0, bearing_err_deg=0.0):
    v = np.asarray(target, float) - np.asarray(origin, float)
    brg = math.atan2(v[0], v[1]) + math.radians(bearing_err_deg)
    return Ray(tower_id, np.asarray(origin, float), np.array([math.sin(brg), math.cos(brg)]), sigma)


TOWERS = {"A": (0, 0), "B": (3000, 0), "C": (1500, 2500)}  # SYNTHETIC test layout
FIRE = (1400, 1200)


def test_exact_bearings_hit_the_fire():
    rays = [ray_to(k, p, FIRE) for k, p in TOWERS.items()]
    r = triangulate(rays, MIN_ANGLE, MAX_RANGE)
    assert r.status == "ok"
    assert np.linalg.norm(r.point - FIRE) < 1e-6


def test_two_rays_are_enough():
    r = triangulate([ray_to("A", TOWERS["A"], FIRE), ray_to("B", TOWERS["B"], FIRE)], MIN_ANGLE, MAX_RANGE)
    assert r.status == "ok" and r.residual_rms_deg is None


def test_one_ray_is_rejected():
    r = triangulate([ray_to("A", TOWERS["A"], FIRE)], MIN_ANGLE, MAX_RANGE)
    assert r.status == "rejected" and "at least 2" in r.reason


def test_nearly_parallel_rays_rejected():
    far = (1500, 30000)  # far away, so both lines point almost the same way
    r = triangulate([ray_to("A", (0, 0), far), ray_to("B", (300, 0), far)], MIN_ANGLE, 1e9)
    assert r.status == "rejected" and "parallel" in r.reason


def test_behind_tower_rejected():
    # B looks away from the point where the lines cross.
    a = ray_to("A", (0, 0), (1000, 1000))
    b = ray_to("B", (2000, 0), (3000, -1000))
    r = triangulate([a, b], MIN_ANGLE, MAX_RANGE)
    assert r.status == "rejected" and "behind" in r.reason


def test_beyond_max_range_rejected():
    r = triangulate([ray_to(k, p, (1500, 9500)) for k, p in TOWERS.items()], MIN_ANGLE, MAX_RANGE)
    assert r.status == "rejected" and "max range" in r.reason


def test_ellipse_covers_truth_about_95_percent():
    """Monte Carlo: the 95% ellipse should contain the truth in roughly 95% of trials."""
    rng = np.random.default_rng(12345)
    sigma = 1.0
    hits, trials = 0, 2000
    for _ in range(trials):
        rays = [ray_to(k, p, FIRE, sigma, rng.normal(0, sigma)) for k, p in TOWERS.items()]
        r = triangulate(rays, MIN_ANGLE, MAX_RANGE)
        assert r.status == "ok"
        hits += inside_95(r.cov, r.point, np.array(FIRE, float))
    coverage = hits / trials
    assert 0.92 <= coverage <= 0.98, coverage


def test_ellipse_axes_ordering():
    rays = [ray_to(k, p, FIRE) for k, p in TOWERS.items()]
    r = triangulate(rays, MIN_ANGLE, MAX_RANGE)
    major, minor, orient = ellipse_95(r.cov)
    assert major >= minor > 0 and 0 <= orient < 180
