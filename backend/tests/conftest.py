"""Pytest configuration and fixtures for testing."""

from __future__ import annotations

from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

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


@pytest.fixture(scope="session")
def test_user_data() -> dict[str, Any]:
    """Sample user data for registration."""
    return {
        "email": "test@example.com",
        "password": "testpassword123",
        "name": "Test User",
    }


@pytest.fixture
def registered_user(client: TestClient, test_user_data: dict[str, Any]) -> dict[str, Any]:
    """Create a registered user and return user data with token."""
    response = client.post("/auth/register", json=test_user_data)
    assert response.status_code == 201
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

