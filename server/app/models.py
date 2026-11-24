"""Database tables.

watchtowers         current tower list (synced from config/watchtowers.json)
simulations         a simulated fire: the GROUND TRUTH and the parameters used
observations        one bearing per tower for a simulation (source_type = "simulated")
triangulations      the ESTIMATE computed from the observations, kept separate from the truth
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _now():
    return datetime.now(timezone.utc)


def _uuid():
    return str(uuid.uuid4())


class Watchtower(Base):
    __tablename__ = "watchtowers"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(60), default="")
    site: Mapped[str | None] = mapped_column(String(120), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(10))  # REAL | SYNTHETIC | PENDING
    notes: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Simulation(Base):
    __tablename__ = "simulations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # Ground truth: the location the user placed. Never overwritten by the estimate.
    truth_lat: Mapped[float] = mapped_column(Float)
    truth_lon: Mapped[float] = mapped_column(Float)
    noise_deg: Mapped[float] = mapped_column(Float)
    seed: Mapped[int] = mapped_column(Integer)
    # Settings in force when this ran (copied from simulation.json, for reproducibility).
    params: Mapped[dict] = mapped_column(JSON)
    skipped: Mapped[list] = mapped_column(JSON, default=list)

    observations: Mapped[list["Observation"]] = relationship(
        back_populates="simulation", cascade="all, delete-orphan", order_by="Observation.tower_id"
    )
    triangulation: Mapped["Triangulation | None"] = relationship(
        back_populates="simulation", cascade="all, delete-orphan", uselist=False
    )


class Observation(Base):
    __tablename__ = "observations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    simulation_id: Mapped[str] = mapped_column(ForeignKey("simulations.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(12), default="simulated")  # "simulated" now, "ai" in Step 3+
    # Snapshot of the tower as it was used (so old results stay reproducible if the tower moves).
    tower_id: Mapped[str] = mapped_column(String(16))
    tower_source: Mapped[str] = mapped_column(String(10))
    tower_lat: Mapped[float] = mapped_column(Float)
    tower_lon: Mapped[float] = mapped_column(Float)
    true_bearing_deg: Mapped[float] = mapped_column(Float)  # simulation only: bearing to the ground truth
    observed_bearing_deg: Mapped[float] = mapped_column(Float)  # what the "camera" reported
    range_to_truth_m: Mapped[float] = mapped_column(Float)

    simulation: Mapped[Simulation] = relationship(back_populates="observations")


class Triangulation(Base):
    __tablename__ = "triangulations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    simulation_id: Mapped[str] = mapped_column(
        ForeignKey("simulations.id", ondelete="CASCADE"), unique=True, index=True
    )
    status: Mapped[str] = mapped_column(String(10))  # ok | rejected
    reason: Mapped[str] = mapped_column(Text, default="")
    est_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    est_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    ellipse_major_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    ellipse_minor_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    ellipse_orientation_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    truth_inside_95: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    n_rays: Mapped[int] = mapped_column(Integer, default=0)
    max_ray_angle_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    residual_rms_deg: Mapped[float | None] = mapped_column(Float, nullable=True)

    simulation: Mapped[Simulation] = relationship(back_populates="triangulation")


class Camera(Base):
    """A camera node (one per webcam now, one per Jetson later). Created when the node registers."""
    __tablename__ = "cameras"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    node_id: Mapped[str] = mapped_column(String(40), default="")  # host name of the machine running it
    label: Mapped[str] = mapped_column(String(60), default="")
    site: Mapped[str] = mapped_column(String(20), default="")  # "lab" for the webcam test
    source: Mapped[str] = mapped_column(String(120), default="")
    source_type: Mapped[str] = mapped_column(String(10), default="")  # usb | file | rtsp
    model_name: Mapped[str] = mapped_column(String(120), default="")
    classes: Mapped[list] = mapped_column(JSON, default=list)
    device: Mapped[str] = mapped_column(String(20), default="")
    software_version: Mapped[str] = mapped_column(String(20), default="")
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[dict] = mapped_column(JSON, default=dict)  # latest heartbeat body
    last_detection_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Detection(Base):
    """One detection event from a camera node: every box YOLO found in one frame."""
    __tablename__ = "detections"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)  # makes resends safe
    camera_id: Mapped[str] = mapped_column(String(16), index=True)
    source_type: Mapped[str] = mapped_column(String(12))  # "ai" (never "simulated" here)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # camera node clock
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)  # server clock
    frame_width: Mapped[int] = mapped_column(Integer)
    frame_height: Mapped[int] = mapped_column(Integer)
    model_name: Mapped[str] = mapped_column(String(120), default="")
    conf_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    pan_deg: Mapped[float | None] = mapped_column(Float, nullable=True)  # PTZ pan at capture; null for fixed webcams
    classes: Mapped[str] = mapped_column(String(60), default="")  # e.g. "fire,smoke"
    max_confidence: Mapped[float] = mapped_column(Float)
    boxes: Mapped[list] = mapped_column(JSON)
    snapshot_path: Mapped[str | None] = mapped_column(String(200), nullable=True)
