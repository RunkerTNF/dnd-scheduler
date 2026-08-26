"""Тесты входа через Яндекс ID."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models, yandex
from app.auth import get_password_hash

INFO_PAYLOAD = {
    "id": "1234567890",
    "login": "vasya",
    "default_email": "vasya@yandex.ru",
    "emails": ["vasya@yandex.ru"],
    "real_name": "Вася Пупкин",
    "display_name": "Вася",
    "default_avatar_id": "abcdef123456",
    "is_avatar_empty": False,
}


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, Any]:
        return self._payload


@pytest.fixture
def yandex_stub(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Подменяет сетевые вызовы к Яндексу. Тест правит содержимое словаря."""
    state: dict[str, Any] = {
        "token_status": 200,
        "token_payload": {"access_token": "ya-access-token"},
        "info_status": 200,
        "info_payload": dict(INFO_PAYLOAD),
    }

    def fake_post(url: str, **kwargs: Any) -> _FakeResponse:
        return _FakeResponse(state["token_status"], state["token_payload"])

    def fake_get(url: str, **kwargs: Any) -> _FakeResponse:
        return _FakeResponse(state["info_status"], state["info_payload"])

    monkeypatch.setattr(yandex.httpx, "post", fake_post)
    monkeypatch.setattr(yandex.httpx, "get", fake_get)
    return state


@pytest.fixture(autouse=True)
def yandex_configured(override_settings):
    """По умолчанию во всех тестах этого файла Яндекс настроен."""
    override_settings(
        yandex_client_id="test-client-id",
        yandex_client_secret="test-client-secret",
    )


class TestYandexAuth:
    def test_creates_new_user(
        self, client: TestClient, db: Session, yandex_stub: dict[str, Any]
    ):
        response = client.post("/api/auth/yandex", json={"code": "auth-code"})

        assert response.status_code == 200
        data = response.json()
        assert data["tokenType"] == "bearer"
        assert data["user"]["email"] == "vasya@yandex.ru"
        assert data["user"]["name"] == "Вася Пупкин"
        assert data["user"]["image"] == (
            "https://avatars.yandex.net/get-yapic/abcdef123456/islands-200"
        )

        user = db.query(models.User).filter(
            models.User.email == "vasya@yandex.ru"
        ).one()
        assert user.emailVerified is not None
        assert user.passwordHash is None

    def test_logs_into_existing_user(
        self, client: TestClient, db: Session, yandex_stub: dict[str, Any]
    ):
        existing = models.User(
            email="vasya@yandex.ru",
            name="Старое имя",
            passwordHash=get_password_hash("somepassword123"),
            emailVerified=datetime.utcnow(),
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)

        response = client.post("/api/auth/yandex", json={"code": "auth-code"})

        assert response.status_code == 200
        assert response.json()["user"]["id"] == existing.id
        # Существующий профиль не перезаписываем
        assert response.json()["user"]["name"] == "Старое имя"
        assert db.query(models.User).count() == 1

    def test_confirms_email_of_existing_unverified_user(
        self, client: TestClient, db: Session, yandex_stub: dict[str, Any]
    ):
        """Яндекс доказал владение адресом — аккаунт не должен остаться неподтверждённым."""
        existing = models.User(
            email="vasya@yandex.ru",
            name="Вася",
            passwordHash=get_password_hash("somepassword123"),
            emailVerified=None,
        )
        db.add(existing)
        db.commit()

        response = client.post("/api/auth/yandex", json={"code": "auth-code"})

        assert response.status_code == 200

        db.expire_all()
        refreshed = db.query(models.User).filter(
            models.User.email == "vasya@yandex.ru"
        ).one()
        assert refreshed.emailVerified is not None

        login = client.post(
            "/api/auth/login",
            json={"email": "vasya@yandex.ru", "password": "somepassword123"},
        )
        assert login.status_code == 200

    def test_avatar_skipped_when_empty(
        self, client: TestClient, db: Session, yandex_stub: dict[str, Any]
    ):
        yandex_stub["info_payload"]["is_avatar_empty"] = True

        response = client.post("/api/auth/yandex", json={"code": "auth-code"})

        assert response.status_code == 200
        assert response.json()["user"]["image"] is None

    def test_missing_email_rejected(
        self, client: TestClient, db: Session, yandex_stub: dict[str, Any]
    ):
        yandex_stub["info_payload"].pop("default_email")

        response = client.post("/api/auth/yandex", json={"code": "auth-code"})

        assert response.status_code == 400
        assert response.json()["detail"] == "yandex_email_missing"
        assert db.query(models.User).count() == 0

    def test_invalid_code_rejected(
        self, client: TestClient, db: Session, yandex_stub: dict[str, Any]
    ):
        yandex_stub["token_status"] = 400
        yandex_stub["token_payload"] = {"error": "invalid_grant"}

        response = client.post("/api/auth/yandex", json={"code": "bad-code"})

        assert response.status_code == 401
        assert response.json()["detail"] == "invalid_yandex_code"
        assert db.query(models.User).count() == 0

    def test_rejected_token_from_info(
        self, client: TestClient, db: Session, yandex_stub: dict[str, Any]
    ):
        yandex_stub["info_status"] = 401
        yandex_stub["info_payload"] = {}

        response = client.post("/api/auth/yandex", json={"code": "auth-code"})

        assert response.status_code == 401
        assert response.json()["detail"] == "invalid_yandex_token"

    def test_not_configured(
        self, client: TestClient, db: Session, override_settings
    ):
        override_settings(yandex_client_id=None, yandex_client_secret=None)

        response = client.post("/api/auth/yandex", json={"code": "auth-code"})

        assert response.status_code == 503
        assert response.json()["detail"] == "yandex_auth_not_configured"

    def test_empty_code_rejected(self, client: TestClient):
        response = client.post("/api/auth/yandex", json={"code": ""})

        assert response.status_code == 422
