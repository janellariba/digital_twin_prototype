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
    return engine


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
