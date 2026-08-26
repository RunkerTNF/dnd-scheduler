"""Разовая рассылка писем пользователям без пароля — бывшим Google-аккаунтам.

Запуск из каталога backend внутри контейнера:

    python -m app.scripts.notify_passwordless_users --dry-run
    python -m app.scripts.notify_passwordless_users
"""

from __future__ import annotations

import argparse
import secrets
import time
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import models
from app.config import get_settings
from app.database import SessionLocal
from app.email import send_password_setup_email

TOKEN_TTL = timedelta(days=7)
# Resend разрешает 2 запроса в секунду
SEND_INTERVAL_SECONDS = 0.6


def issue_setup_token(db: Session, user: models.User) -> str:
    """Выдать пользователю свежий токен, погасив прежние."""
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.userId == user.id
    ).delete()

    token_value = secrets.token_urlsafe(32)
    db.add(
        models.PasswordResetToken(
            userId=user.id,
            token=token_value,
            expiresAt=datetime.utcnow() + TOKEN_TTL,
        )
    )
    db.commit()
    return token_value


def run(
    db: Session,
    *,
    dry_run: bool,
    sleep_seconds: float = SEND_INTERVAL_SECONDS,
) -> dict[str, int]:
    settings = get_settings()
    users = db.query(models.User).filter(models.User.passwordHash.is_(None)).all()
    stats = {"found": len(users), "sent": 0, "skipped": 0, "failed": 0}

    for index, user in enumerate(users):
        if dry_run:
            stats["skipped"] += 1
            print(f"[dry-run] {user.email}")
            continue

        try:
            token_value = issue_setup_token(db, user)
        except Exception as exc:
            # Сессия могла остаться в битом состоянии — иначе упадут и остальные
            db.rollback()
            stats["failed"] += 1
            print(f"[failed] {user.email}: {exc}")
            continue

        try:
            send_password_setup_email(user.email, token_value, settings)
            stats["sent"] += 1
            print(f"[sent] {user.email}")
        except Exception as exc:  # одна упавшая отправка не должна ронять прогон
            # Токен уже записан и останется в базе: письмо просто не ушло,
            # повторный прогон перевыпустит его
            stats["failed"] += 1
            print(f"[failed] {user.email}: {exc}")

        if sleep_seconds and index < len(users) - 1:
            time.sleep(sleep_seconds)

    print(
        f"Найдено: {stats['found']}, отправлено: {stats['sent']}, "
        f"пропущено: {stats['skipped']}, ошибок: {stats['failed']}"
    )
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="показать адреса, ничего не записывая и не отправляя",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        run(db, dry_run=args.dry_run)
    finally:
        db.close()


if __name__ == "__main__":
    main()
