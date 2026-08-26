"""Pytest configuration and fixtures for testing."""

from __future__ import annotations

from collections.abc import Generator
from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.auth import get_password_hash
from app.config import Settings, get_settings
from app.database import Base, get_db
from app.main import app


# Use in-memory SQLite for tests
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Enable foreign key support for SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db() -> Generator[Session, None, None]:
    """Create a fresh database for each test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db: Session) -> Generator[TestClient, None, None]:
    """Create a test client with database override."""

    def override_get_db() -> Generator[Session, None, None]:
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def sent_emails(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
    """Перехватывает отправку писем: тесты не должны ходить в Resend.

    Возвращает список отправленного, чтобы тест мог достать токен из письма.
    """
    captured: list[dict[str, str]] = []

    def _capture(kind: str):
        def _send(to_email: str, token: str, settings: Any) -> None:
            captured.append({"kind": kind, "to": to_email, "token": token})

        return _send

    monkeypatch.setattr(
        "app.routers.auth.send_verification_email", _capture("verification")
    )
    return captured


@pytest.fixture(scope="session")
def test_user_data() -> dict[str, Any]:
    """Sample user data for registration."""
    return {
        "email": "test@example.com",
        "password": "testpassword123",
        "name": "Test User",
    }


@pytest.fixture
def registered_user(
    client: TestClient, db: Session, test_user_data: dict[str, Any]
) -> dict[str, Any]:
    """Подтверждённый пользователь с паролем плюс выданный ему токен."""
    user = models.User(
        email=test_user_data["email"],
        name=test_user_data["name"],
        passwordHash=get_password_hash(test_user_data["password"]),
        emailVerified=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    response = client.post(
        "/api/auth/login",
        json={
            "email": test_user_data["email"],
            "password": test_user_data["password"],
        },
    )
    assert response.status_code == 200
    data = response.json()
    return {
        **test_user_data,
        "accessToken": data["accessToken"],
        "user": data["user"],
    }


@pytest.fixture
def auth_headers(registered_user: dict[str, Any]) -> dict[str, str]:
    """Authorization headers for authenticated requests."""
    return {"Authorization": f"Bearer {registered_user['accessToken']}"}


@pytest.fixture
def override_settings():
    """Подменяет Settings для конкретного теста через dependency override."""

    def _override(**kwargs: Any) -> Settings:
        patched = get_settings().model_copy(update=kwargs)
        app.dependency_overrides[get_settings] = lambda: patched
        return patched

    yield _override
    app.dependency_overrides.pop(get_settings, None)
