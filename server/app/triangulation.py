"""Bearing-only triangulation in projected metres.

Each observation is a ray: a tower position p and a unit direction d. The
estimate x minimises the weighted sum of squared perpendicular distances from
x to every ray:
    A = sum w (I - d d^T),  b = sum w (I - d d^T) p,  x = A^-1 b
with w = 1 / (range * sigma)^2 (a bearing error of sigma radians moves the
line sideways by range * sigma metres). Because w depends on x, the solve is
repeated a few times. A^-1 is then the 2x2 covariance of x, which gives the
95% error ellipse.

Results are REJECTED (no point returned) when:
  - fewer than 2 rays
  - the lines are too close to parallel (widest pairwise angle < min_ray_angle_deg)
  - the estimate is behind any tower
  - the estimate is farther than max_range_m from any tower
"""
from dataclasses import dataclass, field
from itertools import combinations
import math

import numpy as np

# Chi-square value for 2 degrees of freedom at 95% (a statistics constant).
CHI2_2DOF_95 = 5.991464547107979
# Numerical floor so a zero-noise simulation does not divide by zero.
_MIN_SIGMA_RAD = 1e-6


@dataclass
class Ray:
    tower_id: str
    origin: np.ndarray  # [E, N] metres
    direction: np.ndarray  # unit vector [dE, dN]
    sigma_deg: float  # expected bearing error (1 standard deviation)


@dataclass
class Result:
    status: str  # "ok" | "rejected"
    reason: str = ""
    point: np.ndarray | None = None
    cov: np.ndarray | None = None
    n_rays: int = 0
    max_ray_angle_deg: float | None = None
    residual_rms_deg: float | None = None
    ranges_m: dict = field(default_factory=dict)


def _solve(rays, weights):
    A = np.zeros((2, 2))
    b = np.zeros(2)
    for r, w in zip(rays, weights):
        P = np.eye(2) - np.outer(r.direction, r.direction)
        A += w * P
        b += w * P @ r.origin
    return A, np.linalg.solve(A, b)


def triangulate(rays: list[Ray], min_ray_angle_deg: float, max_range_m: float, iterations: int = 3) -> Result:
    n = len(rays)
    if n < 2:
        return Result("rejected", f"Need at least 2 bearings, got {n}. One bearing is direction only, not a location.", n_rays=n)

    # Geometry check: widest angle between any two lines (0..90 deg).
    angles = [
        math.degrees(math.acos(min(1.0, abs(float(a.direction @ b.direction)))))
        for a, b in combinations(rays, 2)
    ]
    widest = max(angles)
    if widest < min_ray_angle_deg:
        return Result(
            "rejected",
            f"Bearing lines are nearly parallel (widest angle {widest:.1f} deg, minimum {min_ray_angle_deg:g} deg).",
            n_rays=n, max_ray_angle_deg=widest,
        )

    sig = [max(math.radians(r.sigma_deg), _MIN_SIGMA_RAD) for r in rays]
    _, x = _solve(rays, [1.0] * n)  # first guess: unweighted
    for _ in range(iterations):
        rng = [max(float(np.linalg.norm(x - r.origin)), 1.0) for r in rays]
        w = [1.0 / (R * s) ** 2 for R, s in zip(rng, sig)]
        A, x = _solve(rays, w)

    ranges = {}
    for r in rays:
        along = float(r.direction @ (x - r.origin))
        R = float(np.linalg.norm(x - r.origin))
        ranges[r.tower_id] = R
        if along <= 0:
            return Result("rejected", f"Estimate is behind tower {r.tower_id}; the bearings do not meet in front of the cameras.",
                          n_rays=n, max_ray_angle_deg=widest)
        if R > max_range_m:
            return Result("rejected", f"Estimate is {R:.0f} m from {r.tower_id}, beyond max range {max_range_m:g} m.",
                          n_rays=n, max_ray_angle_deg=widest)

    # Angular residuals: how far each line misses the estimate, as an angle.
    res = []
    for r in rays:
        v = x - r.origin
        perp = float(abs(r.direction[0] * v[1] - r.direction[1] * v[0]))
        res.append(math.degrees(math.atan2(perp, float(r.direction @ v))))
    rms = math.sqrt(sum(e * e for e in res) / n) if n > 2 else None  # 2 lines always meet exactly

    return Result("ok", point=x, cov=np.linalg.inv(A), n_rays=n, max_ray_angle_deg=widest,
                  residual_rms_deg=rms, ranges_m=ranges)


def ellipse_95(cov: np.ndarray) -> tuple[float, float, float]:
    """(semi_major_m, semi_minor_m, orientation_deg clockwise from grid north)."""
    vals, vecs = np.linalg.eigh(cov)
    vals = np.clip(vals, 0.0, None)
    i = int(np.argmax(vals))
    major = math.sqrt(CHI2_2DOF_95 * vals[i])
    minor = math.sqrt(CHI2_2DOF_95 * vals[1 - i])
    vE, vN = vecs[0, i], vecs[1, i]
    orient = math.degrees(math.atan2(vE, vN)) % 180.0
    return major, minor, orient


def inside_95(cov: np.ndarray, center: np.ndarray, point: np.ndarray) -> bool:
    d = point - center
    try:
        m2 = float(d @ np.linalg.solve(cov, d))
    except np.linalg.LinAlgError:
        return False
    return m2 <= CHI2_2DOF_95
