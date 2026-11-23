"""Server settings, read from environment variables (and server/.env if present).

Nothing secret or site-specific is written in code: the database URL must come
from the environment, and tower/simulation values come from config files.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent.parent
load_dotenv(SERVER_DIR / ".env")


def _path(env_name: str, default: str) -> Path:
    p = Path(os.environ.get(env_name, default))
    return p if p.is_absolute() else SERVER_DIR / p


DATABASE_URL = os.environ.get("DATABASE_URL", "")
WATCHTOWERS_FILE = _path("WATCHTOWERS_FILE", "config/watchtowers.json")
SIMULATION_FILE = _path("SIMULATION_FILE", "config/simulation.json")
# Projected CRS used for all metre calculations. 32651 = WGS84 / UTM zone 51N,
# the same CRS as the digital twin (its terrain.json says EPSG:32651).
CRS_EPSG = int(os.environ.get("CRS_EPSG", "32651"))
