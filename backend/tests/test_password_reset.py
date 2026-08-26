"""Тесты восстановления и установки пароля."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from app.auth import get_password_hash


def _make_user(db: Session, *, email: str, password: str | None) -> models.User:
    user = models.User(
        email=email,
        name="Somebody",
        passwordHash=get_password_hash(password) if password else None,
        emailVerified=datetime.utcnow() if password else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class TestForgotPassword:
    def test_sends_email_and_creates_token(
        self, client: TestClient, db: Session, sent_emails: list[dict[str, str]]
    ):
        user = _make_user(db, email="player@example.com", password="oldpassword123")

        response = client.post(
            "/api/auth/forgot-password", json={"email": user.email}
        )

        assert response.status_code == 200
        assert response.json() == {"message": "password_reset_email_sent"}
        assert [mail["kind"] for mail in sent_emails] == ["reset"]
        assert sent_emails[0]["to"] == user.email

        tokens = db.query(models.PasswordResetToken).all()
        assert len(tokens) == 1
        assert tokens[0].userId == user.id
        assert tokens[0].usedAt is None
        assert tokens[0].token == sent_emails[0]["token"]

    def test_unknown_email_looks_identical(
        self, client: TestClient, db: Session, sent_emails: list[dict[str, str]]
    ):
        response = client.post(
            "/api/auth/forgot-password", json={"email": "nobody@example.com"}
        )

        assert response.status_code == 200
        assert response.json() == {"message": "password_reset_email_sent"}
        assert sent_emails == []
        assert db.query(models.PasswordResetToken).count() == 0

    def test_second_request_within_five_minutes_is_ignored(
        self, client: TestClient, db: Session, sent_emails: list[dict[str, str]]
    ):
        user = _make_user(db, email="player@example.com", password="oldpassword123")

        client.post("/api/auth/forgot-password", json={"email": user.email})
        client.post("/api/auth/forgot-password", json={"email": user.email})

        assert len(sent_emails) == 1
        assert db.query(models.PasswordResetToken).count() == 1

    def test_passwordless_user_gets_token(
        self, client: TestClient, db: Session, sent_emails: list[dict[str, str]]
    ):
        """Бывший Google-аккаунт: пароля нет, но восстановление обязано работать."""
        user = _make_user(db, email="google@example.com", password=None)

        response = client.post(
            "/api/auth/forgot-password", json={"email": user.email}
        )

        assert response.status_code == 200
        assert len(sent_emails) == 1


class TestResetPassword:
    def _request_token(
        self, client: TestClient, sent_emails: list[dict[str, str]], email: str
    ) -> str:
        client.post("/api/auth/forgot-password", json={"email": email})
        return sent_emails[-1]["token"]

    def test_success_sets_password_and_logs_in(
        self, client: TestClient, db: Session, sent_emails: list[dict[str, str]]
    ):
        user = _make_user(db, email="google@example.com", password=None)
        token = self._request_token(client, sent_emails, user.email)

        response = client.post(
            "/api/auth/reset-password",
            json={"token": token, "password": "brandnewpass1"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["tokenType"] == "bearer"
        assert data["user"]["email"] == user.email
        assert "accessToken" in data

        db.expire_all()
        refreshed = db.query(models.User).filter(models.User.id == user.id).one()
        assert refreshed.passwordHash is not None
        assert refreshed.emailVerified is not None

        stored = db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.token == token
        ).one()
        assert stored.usedAt is not None

        login = client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "brandnewpass1"},
        )
        assert login.status_code == 200

    def test_token_cannot_be_reused(
        self, client: TestClient, db: Session, sent_emails: list[dict[str, str]]
    ):
        user = _make_user(db, email="player@example.com", password="oldpassword123")
        token = self._request_token(client, sent_emails, user.email)

        first = client.post(
            "/api/auth/reset-password",
            json={"token": token, "password": "brandnewpass1"},
        )
        assert first.status_code == 200

        second = client.post(
            "/api/auth/reset-password",
            json={"token": token, "password": "anotherpass123"},
        )
        assert second.status_code == 400
        assert second.json()["detail"] == "invalid_or_expired_token"

    def test_expired_token_rejected(
        self, client: TestClient, db: Session, sent_emails: list[dict[str, str]]
    ):
        user = _make_user(db, email="player@example.com", password="oldpassword123")
        token = self._request_token(client, sent_emails, user.email)

        stored = db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.token == token
        ).one()
        stored.expiresAt = datetime.utcnow() - timedelta(minutes=1)
        db.commit()

        response = client.post(
            "/api/auth/reset-password",
            json={"token": token, "password": "brandnewpass1"},
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "invalid_or_expired_token"

    def test_unknown_token_rejected(self, client: TestClient, db: Session):
        response = client.post(
            "/api/auth/reset-password",
            json={"token": "no-such-token", "password": "brandnewpass1"},
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "invalid_or_expired_token"

    def test_short_password_rejected(
        self, client: TestClient, db: Session, sent_emails: list[dict[str, str]]
    ):
        user = _make_user(db, email="player@example.com", password="oldpassword123")
        token = self._request_token(client, sent_emails, user.email)

        response = client.post(
            "/api/auth/reset-password",
            json={"token": token, "password": "short"},
        )

        assert response.status_code == 422
