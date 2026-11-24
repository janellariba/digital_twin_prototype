"""FastAPI app: watchtowers, simulation and triangulation API.

Run (from the server folder):
    uvicorn app.main:app --host 127.0.0.1 --port 8000
"""
import logging
import math
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import db as dbmod
from . import cameras, settings, simulation, watchtowers
from .models import Simulation, Watchtower

log = logging.getLogger("aisunog")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

_last_tower_errors: list[str] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    dbmod.init_engine()
    if not settings.NODE_API_KEY or settings.NODE_API_KEY == "CHANGE_ME":
        log.warning("NODE_API_KEY is not set in server/.env: camera nodes will be refused until it is.")
    with dbmod.SessionLocal() as s:
        _sync_towers(s)
    yield


def _sync_towers(s: Session):
    global _last_tower_errors
    _last_tower_errors = watchtowers.sync_from_file(s, settings.WATCHTOWERS_FILE)
    for e in _last_tower_errors:
        log.warning("watchtowers.json: %s", e)
    log.info("Watchtowers synced from %s", settings.WATCHTOWERS_FILE)


app = FastAPI(title="AI-SUNOG Digital Twin Prototype API", version="0.3.0", lifespan=lifespan)
app.include_router(cameras.router)


@app.get("/")
def root():
    """Nothing to show at /. The API lives under /api; try /docs."""
    return {"service": "AI-SUNOG prototype API", "docs": "/docs", "health": "/api/health"}


def _cfg():
    try:
        return simulation.load_config(settings.SIMULATION_FILE)
    except simulation.ConfigError as e:
        raise HTTPException(500, str(e))


# ---------- health ----------
@app.get("/api/health")
def health(db: Session = Depends(dbmod.get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": dbmod.engine.dialect.name}


# ---------- watchtowers ----------
def _towers_payload(db: Session):
    rows = db.scalars(select(Watchtower).order_by(Watchtower.id))
    return {"schema_version": 1, "towers": [watchtowers.to_dict(w) for w in rows], "file_errors": _last_tower_errors}


@app.get("/api/watchtowers")
def list_watchtowers(db: Session = Depends(dbmod.get_db)):
    return _towers_payload(db)


@app.post("/api/watchtowers/reload")
def reload_watchtowers(db: Session = Depends(dbmod.get_db)):
    """Re-read config/watchtowers.json into the database."""
    _sync_towers(db)
    return _towers_payload(db)


# ---------- simulation ----------
@app.get("/api/simulation/config")
def simulation_config():
    return _cfg()


class SimulationRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    noise_deg: float | None = Field(default=None, ge=0)
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)
    tower_ids: list[str] | None = Field(default=None, max_length=50)

    @field_validator("lat", "lon", "noise_deg")
    @classmethod
    def finite(cls, v):
        if v is not None and not math.isfinite(v):
            raise ValueError("must be a finite number")
        return v


@app.post("/api/simulations", status_code=201)
def create_simulation(req: SimulationRequest, db: Session = Depends(dbmod.get_db)):
    cfg = _cfg()
    noise = cfg["bearing_noise_deg_default"] if req.noise_deg is None else req.noise_deg
    if noise > cfg["bearing_noise_deg_max"]:
        raise HTTPException(422, f"noise_deg must be at most {cfg['bearing_noise_deg_max']:g}")
    sim = simulation.run(db, cfg, req.lat, req.lon, noise, req.seed, req.tower_ids)
    r = sim.triangulation
    log.info("Simulation %s: %s (%s rays, error %s m)", sim.id[:8], r.status, r.n_rays,
             f"{r.error_m:.1f}" if r.error_m is not None else "-")
    return simulation.to_dict(sim, cfg)


@app.get("/api/simulations")
def list_simulations(limit: int = 20, db: Session = Depends(dbmod.get_db)):
    limit = max(1, min(limit, 200))
    sims = db.scalars(select(Simulation).order_by(Simulation.created_at.desc()).limit(limit))
    cfg = _cfg()
    return [simulation.to_dict(s, cfg) for s in sims]


@app.get("/api/simulations/{sim_id}")
def get_simulation(sim_id: str, db: Session = Depends(dbmod.get_db)):
    sim = db.get(Simulation, sim_id)
    if not sim:
        raise HTTPException(404, "Simulation not found")
    return simulation.to_dict(sim, _cfg())


@app.delete("/api/simulations/{sim_id}", status_code=204)
def delete_simulation(sim_id: str, db: Session = Depends(dbmod.get_db)):
    sim = db.get(Simulation, sim_id)
    if not sim:
        raise HTTPException(404, "Simulation not found")
    db.delete(sim)
    db.commit()


@app.delete("/api/simulations", status_code=204)
def delete_all_simulations(db: Session = Depends(dbmod.get_db)):
    """Reset: removes every simulation with its observations and estimates."""
    for s in db.scalars(select(Simulation)):
        db.delete(s)
    db.commit()
