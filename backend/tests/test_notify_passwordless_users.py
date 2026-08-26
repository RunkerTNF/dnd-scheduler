"""Тесты разовой рассылки писем беспарольным пользователям."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app import models
from app.auth import get_password_hash
from app.scripts import notify_passwordless_users as script


@pytest.fixture
def captured_setup_emails(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
    captured: list[dict[str, str]] = []

    def _send(to_email: str, token: str, settings: Any) -> None:
        captured.append({"to": to_email, "token": token})

    monkeypatch.setattr(script, "send_password_setup_email", _send)
    return captured


def _seed(db: Session) -> None:
    db.add(models.User(email="google-one@example.com", passwordHash=None))
    db.add(models.User(email="google-two@example.com", passwordHash=None))
    db.add(
        models.User(
            email="has-password@example.com",
            passwordHash=get_password_hash("somepassword123"),
            emailVerified=datetime.utcnow(),
        )
    )
    db.commit()


class TestNotifyPasswordlessUsers:
    def test_sends_only_to_passwordless_users(
        self, db: Session, captured_setup_emails: list[dict[str, str]]
    ):
        _seed(db)

        stats = script.run(db, dry_run=False, sleep_seconds=0)

        assert stats == {"found": 2, "sent": 2, "skipped": 0, "failed": 0}
        assert sorted(mail["to"] for mail in captured_setup_emails) == [
            "google-one@example.com",
            "google-two@example.com",
        ]

    def test_issues_one_valid_token_per_user(
        self, db: Session, captured_setup_emails: list[dict[str, str]]
    ):
        _seed(db)

        script.run(db, dry_run=False, sleep_seconds=0)

        tokens = db.query(models.PasswordResetToken).all()
        assert len(tokens) == 2
        assert all(token.usedAt is None for token in tokens)
        assert all(token.expiresAt > datetime.utcnow() for token in tokens)
        assert sorted(token.token for token in tokens) == sorted(
            mail["token"] for mail in captured_setup_emails
        )

    def test_dry_run_writes_nothing(
        self, db: Session, captured_setup_emails: list[dict[str, str]]
    ):
        _seed(db)

        stats = script.run(db, dry_run=True, sleep_seconds=0)

        assert stats == {"found": 2, "sent": 0, "skipped": 2, "failed": 0}
        assert captured_setup_emails == []
        assert db.query(models.PasswordResetToken).count() == 0

    def test_failure_on_one_address_does_not_stop_the_run(
        self, db: Session, monkeypatch: pytest.MonkeyPatch
    ):
        _seed(db)
        delivered: list[str] = []

        def _flaky(to_email: str, token: str, settings: Any) -> None:
            if to_email == "google-one@example.com":
                raise RuntimeError("resend is down")
            delivered.append(to_email)

        monkeypatch.setattr(script, "send_password_setup_email", _flaky)

        stats = script.run(db, dry_run=False, sleep_seconds=0)

        assert stats == {"found": 2, "sent": 1, "skipped": 0, "failed": 1}
        assert delivered == ["google-two@example.com"]

    def test_rerun_skips_users_who_set_a_password(
        self, db: Session, captured_setup_emails: list[dict[str, str]]
    ):
        _seed(db)
        script.run(db, dry_run=False, sleep_seconds=0)

        user = db.query(models.User).filter(
            models.User.email == "google-one@example.com"
        ).one()
        user.passwordHash = get_password_hash("brandnewpass1")
        db.commit()
        captured_setup_emails.clear()

        stats = script.run(db, dry_run=False, sleep_seconds=0)

        assert stats["found"] == 1
        assert [mail["to"] for mail in captured_setup_emails] == [
            "google-two@example.com"
        ]
