"""Database engine and session (SQLAlchemy 2.0). Works with PostgreSQL via DATABASE_URL."""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str | None = None):
    url = url or settings.DATABASE_URL
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy server/.env.example to server/.env and fill in your PostgreSQL details."
        )
    return create_engine(url, pool_pre_ping=True)


engine = None
SessionLocal = sessionmaker(autoflush=False, expire_on_commit=False)


def init_engine(url: str | None = None):
    """Create the engine and tables. Called once at startup (and by tests)."""
    global engine
    engine = make_engine(url)
    SessionLocal.configure(bind=engine)
    from . import models  # noqa: F401  (registers tables)

    Base.metadata.create_all(engine)
    _add_missing_columns(engine)
    return engine


# create_all() makes new tables but never adds columns to a table that already
# exists. These are the columns added after Step 3A, so an existing aisunog_dt
# database upgrades in place. Each statement is safe to run on every start.
_UPGRADES = [
    "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS watchtower_id VARCHAR(16)",
    "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS heading_deg DOUBLE PRECISION",
    "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS hfov_deg DOUBLE PRECISION",
    "CREATE INDEX IF NOT EXISTS ix_cameras_watchtower_id ON cameras (watchtower_id)",
]


def _add_missing_columns(engine):
    from sqlalchemy import text

    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for sql in _UPGRADES:
            conn.execute(text(sql))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
