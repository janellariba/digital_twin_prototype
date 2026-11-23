"""Geodesy helpers (pyproj is the single authority for coordinates).

Bearings are TRUE bearings (0 = true north, clockwise). The solver works in
UTM metres, where "up" is GRID north, about 0.49 deg away from true north in
Muntinlupa. ray_in_crs() handles that automatically by projecting a second
point along the true bearing, so no convergence formula is needed.
"""
import numpy as np
from pyproj import Geod, Transformer

from . import settings

GEOD = Geod(ellps="WGS84")
_to_crs = Transformer.from_crs(4326, settings.CRS_EPSG, always_xy=True)
_to_ll = Transformer.from_crs(settings.CRS_EPSG, 4326, always_xy=True)


def to_xy(lat: float, lon: float) -> np.ndarray:
    """lat/lon -> projected metres [E, N]."""
    e, n = _to_crs.transform(lon, lat)
    return np.array([e, n])


def to_latlon(xy) -> tuple[float, float]:
    lon, lat = _to_ll.transform(float(xy[0]), float(xy[1]))
    return lat, lon


def bearing_and_distance(lat1, lon1, lat2, lon2) -> tuple[float, float]:
    """True bearing (deg, 0..360) and geodesic distance (m) from point 1 to point 2."""
    az, _, dist = GEOD.inv(lon1, lat1, lon2, lat2)
    return az % 360.0, dist


def destination(lat, lon, bearing_deg, distance_m) -> tuple[float, float]:
    lon2, lat2, _ = GEOD.fwd(lon, lat, bearing_deg, distance_m)
    return lat2, lon2


def ray_in_crs(lat, lon, true_bearing_deg, probe_m: float = 1000.0):
    """Origin [E, N] and unit direction of a bearing line in projected metres."""
    p0 = to_xy(lat, lon)
    p1 = to_xy(*destination(lat, lon, true_bearing_deg, probe_m))
    d = p1 - p0
    return p0, d / np.linalg.norm(d)
