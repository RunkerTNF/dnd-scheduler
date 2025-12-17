from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session


def _normalize_database_url(url: str) -> str:
    """Ensure the configured URL uses the installed psycopg driver.

    SQLAlchemy defaults to ``psycopg2`` for ``postgresql://`` URLs. The project
    ships with ``psycopg`` (v3), so we patch the scheme when a driver is not
    explicitly provided to avoid ``ModuleNotFoundError: No module named
    'psycopg2'``.
    """

    if url.startswith("postgres://"):
        # SQLAlchemy accepts the deprecated ``postgres://`` alias once expanded.
        url = "postgresql://" + url[len("postgres://") :]

    if url.startswith("postgresql+"):
        return url

    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)

    return url

from app.config import get_settings

settings = get_settings()
engine = create_engine(_normalize_database_url(settings.database_url), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
