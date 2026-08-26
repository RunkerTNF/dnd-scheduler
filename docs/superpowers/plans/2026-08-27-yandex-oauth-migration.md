# Миграция с Google OAuth на Яндекс ID — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать авторизацию через Google, поставить вместо неё Яндекс ID, и дать бывшим Google-пользователям способ установить пароль — постоянный флоу восстановления плюс разовую рассылку персональных ссылок.

**Architecture:** Бэкенд — FastAPI, роутеры смонтированы под `/api` (`app/main.py:26`). Яндекс подключается по authorization code flow: фронт редиректит пользователя на `oauth.yandex.ru`, страница `/auth/yandex/callback` отдаёт код в `POST /api/auth/yandex`, бэкенд меняет код на токен и тянет профиль, `client_secret` наружу не уходит. Восстановление пароля — новая таблица одноразовых токенов плюс две ручки; разовая рассылка — CLI-скрипт поверх той же таблицы.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, uv, PostgreSQL (SQLite в тестах), Resend, React 19, Vite, react-hook-form + zod, TanStack Query, zustand, Tailwind.

**Спека:** `docs/superpowers/specs/2026-08-27-yandex-oauth-migration-design.md`

**Все backend-команды выполняются из каталога `backend/`.**

---

## Структура файлов

**Создаются:**

| Файл | Ответственность |
| --- | --- |
| `backend/app/yandex.py` | Сетевые вызовы к Яндексу и разбор профиля. Единственная точка, которую мокают тесты |
| `backend/app/scripts/__init__.py` | Пакет для разовых скриптов |
| `backend/app/scripts/notify_passwordless_users.py` | Разовая рассылка писем беспарольным пользователям |
| `backend/migrations/versions/202608270001_add_password_reset_token.py` | Миграция таблицы `PasswordResetToken` |
| `backend/tests/test_password_reset.py` | Тесты `forgot-password` / `reset-password` |
| `backend/tests/test_yandex_auth.py` | Тесты входа через Яндекс |
| `backend/tests/test_notify_passwordless_users.py` | Тесты скрипта рассылки |
| `frontend/src/utils/yandexOAuth.ts` | Ключи sessionStorage и сборка authorize-URL — общее для кнопки и callback-страницы |
| `frontend/src/components/auth/YandexLoginButton.tsx` | Кнопка «Войти с Яндекс ID» |
| `frontend/src/pages/auth/YandexCallbackPage.tsx` | Обработка возврата от Яндекса |
| `frontend/src/pages/auth/ForgotPasswordPage.tsx` | Форма запроса письма для сброса |
| `frontend/src/pages/auth/ResetPasswordPage.tsx` | Форма установки нового пароля |

**Удаляются:** `frontend/src/components/auth/GoogleLoginButton.tsx`

**Изменяются:** `backend/app/{auth,config,email,models,schemas}.py`, `backend/app/routers/{auth,users}.py`, `backend/tests/{conftest,test_auth}.py`, `backend/pyproject.toml`, `frontend/src/{main.tsx,router.tsx}`, `frontend/src/api/{auth.ts,client.ts}`, `frontend/src/types/api.ts`, `frontend/src/components/auth/LoginForm.tsx`, `frontend/src/pages/auth/{LoginPage,RegisterPage}.tsx`, `frontend/package.json`, `frontend/Dockerfile`, `.docker/docker-compose*.yml`, документация.

---

## Task 1: Починить тестовую инфраструктуру

Сейчас `pytest` даёт 13 failed / 8 errors до любых правок: тесты бьют в `/auth/...`, а роутеры под `/api/auth/...`; фикстура `registered_user` ждёт `accessToken` от регистрации, которая теперь возвращает `{ message }`; отправка писем не замокана и уходит в живой Resend. Без этого шага новый код нечем покрывать.

**Files:**
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_auth.py`

- [ ] **Step 1: Зафиксировать исходное состояние**

Run: `uv run pytest -q 2>&1 | tail -3`
Expected: `13 failed, 8 errors`

- [ ] **Step 2: Переписать фикстуры в conftest.py**

Заменить блок фикстур `test_user_data` / `registered_user` / `auth_headers` (всё от строки с `@pytest.fixture(scope="session")` до конца файла) на:

```python
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
```

В шапку `conftest.py` добавить импорты:

```python
from datetime import datetime

from app import models
from app.auth import get_password_hash
from app.config import Settings, get_settings
```

- [ ] **Step 3: Перевести пути в тестах на /api**

Run: `sed -i 's|"/auth/|"/api/auth/|g; s|"/groups/"|"/api/groups/"|g' tests/test_auth.py`

Команда не идемпотентна: повторный запуск даст `/api/api/auth/`. Если сомневаетесь, прошла ли она, проверьте `grep -c '"/api/auth/' tests/test_auth.py` вместо повторного вызова.

- [ ] **Step 4: Поправить тесты регистрации под новый ответ**

Регистрация возвращает `{"message": "verification_email_sent"}` со статусом 201 и требует подтверждения почты. В `tests/test_auth.py` заменить тело `test_register_success` (всё после строки с `response = client.post("/api/auth/register", json=test_user_data)`) на:

```python
        assert response.status_code == 201
        assert response.json() == {"message": "verification_email_sent"}

        db_user = db.query(models.User).filter(
            models.User.email == test_user_data["email"]
        ).one_or_none()

        assert db_user is not None
        assert db_user.name == test_user_data["name"]
        assert db_user.emailVerified is None
        assert db_user.passwordHash is not None
        assert verify_password(test_user_data["password"], db_user.passwordHash)
```

В `test_register_without_name` заменить строку `assert response.json()["user"]["name"] is None` на:

```python
        assert response.json() == {"message": "verification_email_sent"}
```

- [ ] **Step 5: Прогнать тесты**

Run: `uv run pytest -q 2>&1 | tail -5`
Expected: PASS по всем, кроме `TestGoogleAuth::test_google_auth_not_configured` — этот класс удаляется в Task 2. Если он падает на 401 вместо 503, это ожидаемо: `GOOGLE_CLIENT_ID` задан в `.env`.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/conftest.py backend/tests/test_auth.py
git commit -m "fix: починил тестовые фикстуры и пути под /api"
```

---

## Task 2: Убрать Google

**Files:**
- Modify: `backend/app/auth.py`, `backend/app/routers/auth.py`, `backend/app/routers/users.py:76-80`, `backend/app/schemas.py`, `backend/app/config.py`, `backend/pyproject.toml`
- Modify: `backend/tests/test_auth.py`
- Delete: `frontend/src/components/auth/GoogleLoginButton.tsx`
- Modify: `frontend/src/main.tsx`, `frontend/src/api/auth.ts`, `frontend/src/types/api.ts`, `frontend/src/pages/auth/LoginPage.tsx`, `frontend/src/pages/auth/RegisterPage.tsx`, `frontend/package.json`, `frontend/Dockerfile`, `.docker/docker-compose.yml`, `.docker/docker-compose.prod.yml`

- [ ] **Step 1: Удалить google-код из бэкенда**

В `backend/app/auth.py` удалить импорты:

```python
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
```

и функцию `verify_google_identity_token` целиком (от `def verify_google_identity_token` до конца файла).

В `backend/app/routers/auth.py` удалить ручку `login_with_google` целиком и убрать `verify_google_identity_token` из импорта `from app.auth import (...)`.

В `backend/app/schemas.py` удалить:

```python
class GoogleAuthRequestSchema(BaseModel):
    idToken: str = Field(min_length=1)
```

В `backend/app/config.py` удалить строку `google_client_id: str | None = None`.

- [ ] **Step 2: Убрать зависимости**

В `backend/pyproject.toml` удалить строки `"google-auth>=2.29",` и `"requests>=2.32",`. Прямых импортов `requests` в `app/` нет; сам пакет никуда не денется — `resend` объявляет `requests>=2.31.0` своей зависимостью, так что он останется транзитивно.

Run: `uv sync`
Expected: пересобранное окружение без ошибок, `uv.lock` обновился.

- [ ] **Step 3: Поправить текст ошибки в users.py**

`backend/app/routers/users.py:76-80` — заменить:

```python
    if not current_user.passwordHash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль не установлен. Задайте его через восстановление пароля на странице входа",
        )
```

- [ ] **Step 4: Удалить google-тесты**

В `backend/tests/test_auth.py` удалить класс `TestGoogleAuth` целиком (последний класс в файле).

- [ ] **Step 5: Прогнать тесты**

Run: `uv run pytest -q 2>&1 | tail -3`
Expected: все зелёные, 0 failed.

- [ ] **Step 6: Удалить google-код из фронта**

```bash
rm frontend/src/components/auth/GoogleLoginButton.tsx
```

`frontend/src/main.tsx` — заменить содержимое на:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
```

`frontend/src/api/auth.ts` — удалить метод `googleAuth` и `GoogleAuthRequest` из импорта типов.

`frontend/src/types/api.ts` — удалить интерфейс `GoogleAuthRequest`.

`frontend/src/pages/auth/LoginPage.tsx` и `RegisterPage.tsx` — удалить строку импорта `GoogleLoginButton` и весь блок «Или войти через» (`<div className="mt-6">` с разделителем и кнопкой). Блок вернётся в Task 8 уже с Яндексом.

- [ ] **Step 7: Убрать google из сборки**

`frontend/package.json` — удалить строку `"@react-oauth/google": "^0.13.4",`.

`frontend/Dockerfile:11,13` — удалить `ARG VITE_GOOGLE_CLIENT_ID=""` и `ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}`.

`.docker/docker-compose.yml:10` и `.docker/docker-compose.prod.yml:11` — удалить строку `VITE_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}`.

Run: `cd frontend && npm install`
Expected: `@react-oauth/google` пропал из `node_modules`, lock-файл обновился.

- [ ] **Step 8: Проверить сборку фронта**

Run: `cd frontend && npm run build`
Expected: сборка проходит, ошибок TypeScript нет.

- [ ] **Step 9: Commit**

`backend/uv.lock` не в `.gitignore` и до сих пор не коммитился, хотя `uv sync` его переписывает. Он относится к этой задаче, но заезжает отдельным коммитом — чтобы решение «начать версионировать lock-файл» не пряталось внутри удаления Google. Никаких `git add -A`.

```bash
git add backend/app backend/tests backend/pyproject.toml frontend/src frontend/package.json frontend/package-lock.json frontend/Dockerfile .docker/docker-compose.yml .docker/docker-compose.prod.yml
git commit -m "remove: убрал авторизацию через Google"
git add backend/uv.lock
git commit -m "add: зафиксировал uv.lock в репозитории"
```

---

## Task 3: Каркас писем и два новых шаблона

**Files:**
- Modify: `backend/app/email.py`

- [ ] **Step 1: Переписать email.py**

Полностью заменить содержимое `backend/app/email.py`:

```python
from __future__ import annotations

import resend

from app.config import Settings

FROM_ADDRESS = "DnD Scheduler <noreply@registering.runker.ru>"


def _render(*, heading: str, intro: str, button_text: str, button_url: str, footer: str) -> str:
    """Общий каркас письма: карточка с заголовком, текстом, кнопкой и подписью."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
    </head>
    <body style="font-family: sans-serif; background: #f9f9f9; padding: 32px;">
      <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <h2 style="margin-top: 0; color: #1a1a1a;">{heading}</h2>
        <p style="color: #444;">{intro}</p>
        <a href="{button_url}"
           style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">
          {button_text}
        </a>
        <p style="margin-top: 24px; color: #888; font-size: 13px;">
          {footer}
        </p>
      </div>
    </body>
    </html>
    """


def _send(*, to_email: str, subject: str, html: str, settings: Settings) -> None:
    resend.api_key = settings.resend_api_key
    resend.Emails.send({
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": subject,
        "html": html,
    })


def send_verification_email(to_email: str, token: str, settings: Settings) -> None:
    html = _render(
        heading="Подтвердите ваш email",
        intro="Для завершения регистрации нажмите кнопку ниже. Ссылка действительна 24 часа.",
        button_text="Подтвердить email",
        button_url=f"{settings.frontend_url}/verify-email?token={token}",
        footer="Если вы не регистрировались — просто проигнорируйте это письмо.",
    )
    _send(
        to_email=to_email,
        subject="Подтвердите ваш email — DnD Scheduler",
        html=html,
        settings=settings,
    )


def send_password_reset_email(to_email: str, token: str, settings: Settings) -> None:
    html = _render(
        heading="Сброс пароля",
        intro="Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действительна 1 час.",
        button_text="Задать новый пароль",
        button_url=f"{settings.frontend_url}/reset-password?token={token}",
        footer="Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо, пароль останется прежним.",
    )
    _send(
        to_email=to_email,
        subject="Сброс пароля — DnD Scheduler",
        html=html,
        settings=settings,
    )


def send_password_setup_email(to_email: str, token: str, settings: Settings) -> None:
    """Разовое письмо тем, кто заходил через Google: у них нет пароля."""
    html = _render(
        heading="Вход через Google отключён",
        intro=(
            "Раньше вы заходили в DnD Scheduler через Google. Этот способ входа отключён, "
            "поэтому для вашего аккаунта нужно задать пароль — нажмите кнопку ниже. "
            "Ссылка действительна 7 дней. После этого можно входить по email с паролем "
            "или через Яндекс ID."
        ),
        button_text="Установить пароль",
        button_url=f"{settings.frontend_url}/reset-password?token={token}",
        footer=(
            "Если ссылка перестала работать, откройте страницу входа и нажмите «Забыли пароль?» — "
            "придёт новое письмо."
        ),
    )
    _send(
        to_email=to_email,
        subject="Установите пароль для входа — DnD Scheduler",
        html=html,
        settings=settings,
    )
```

- [ ] **Step 2: Проверить, что ничего не сломалось**

Run: `uv run pytest -q 2>&1 | tail -3`
Expected: все зелёные.

- [ ] **Step 3: Commit**

```bash
git add backend/app/email.py
git commit -m "refactor: общий каркас писем плюс шаблоны сброса и установки пароля"
```

---

## Task 4: Таблица PasswordResetToken

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/migrations/versions/202608270001_add_password_reset_token.py`

- [ ] **Step 1: Добавить модель**

В `backend/app/models.py` в класс `User` после строки с `verificationTokens` добавить:

```python
    passwordResetTokens: Mapped[list["PasswordResetToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")
```

В конец файла добавить:

```python
class PasswordResetToken(Base):
    __tablename__ = "PasswordResetToken"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    userId: Mapped[str] = mapped_column(String, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    token: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    expiresAt: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    usedAt: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="passwordResetTokens")
```

- [ ] **Step 2: Написать миграцию**

Создать `backend/migrations/versions/202608270001_add_password_reset_token.py`:

```python
"""Add PasswordResetToken table"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202608270001"
down_revision = "202602240001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "PasswordResetToken",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("userId", sa.String(), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(), nullable=False, unique=True),
        sa.Column("expiresAt", sa.DateTime(), nullable=False),
        sa.Column("usedAt", sa.DateTime(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_PasswordResetToken_token", "PasswordResetToken", ["token"])


def downgrade() -> None:
    op.drop_index("ix_PasswordResetToken_token", table_name="PasswordResetToken")
    op.drop_table("PasswordResetToken")
```

- [ ] **Step 3: Проверить цепочку ревизий**

Run: `uv run alembic history | head -5`
Expected: в выводе есть `202602240001 -> 202608270001 (head), Add PasswordResetToken table`. Подключение к БД для этой команды не нужно.

- [ ] **Step 4: Проверить, что модель создаётся**

Тесты поднимают схему через `Base.metadata.create_all`, так что рабочая модель проверяется всем набором.

Run: `uv run pytest -q 2>&1 | tail -3`
Expected: все зелёные.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/migrations/versions/202608270001_add_password_reset_token.py
git commit -m "add: таблица PasswordResetToken"
```

---

## Task 5: Ручки восстановления пароля

**Files:**
- Create: `backend/tests/test_password_reset.py`
- Modify: `backend/app/schemas.py`, `backend/app/routers/auth.py`

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_password_reset.py`:

```python
"""Тесты восстановления и установки пароля."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

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
```

В `backend/tests/conftest.py` в фикстуру `sent_emails` добавить перехват письма о сбросе — сразу после существующего `monkeypatch.setattr`:

```python
    monkeypatch.setattr(
        "app.routers.auth.send_password_reset_email", _capture("reset")
    )
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `uv run pytest tests/test_password_reset.py -q 2>&1 | tail -5`
Expected: FAIL — `app.routers.auth` не имеет атрибута `send_password_reset_email`.

Фикстура `sent_emails` объявлена `autouse`, поэтому на этом шаге с `AttributeError` падает **весь** набор, а не только новый файл. Это ожидаемо и лечится Step 4; полный `pytest` до конца задачи не запускать.

- [ ] **Step 3: Добавить схемы**

В `backend/app/schemas.py` после класса `LoginRequestSchema` добавить:

```python
class ForgotPasswordSchema(BaseModel):
    email: EmailStr


class ResetPasswordSchema(BaseModel):
    token: str = Field(min_length=1)
    password: str = Field(min_length=8)
```

- [ ] **Step 4: Реализовать ручки**

В `backend/app/routers/auth.py` в шапку добавить `import secrets`, дополнить импорт писем:

```python
from app.email import send_password_reset_email, send_verification_email
```

и после строки `router = APIRouter(prefix="/auth", tags=["auth"])` добавить константы:

```python
PASSWORD_RESET_TTL = timedelta(hours=1)
PASSWORD_RESET_RESEND_INTERVAL = timedelta(minutes=5)
```

В конец файла добавить ручки:

```python
@router.post("/forgot-password", response_model=schemas.RegisterResponseSchema)
def forgot_password(
    payload: schemas.ForgotPasswordSchema,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.RegisterResponseSchema:
    """Выслать ссылку на установку пароля.

    Ответ одинаков независимо от того, есть такой пользователь или нет — иначе
    ручка превращается в способ проверять чужие адреса на регистрацию.
    """
    ok = schemas.RegisterResponseSchema(message="password_reset_email_sent")

    user = db.query(models.User).filter(models.User.email == payload.email).one_or_none()
    if user is None:
        return ok

    now = datetime.utcnow()
    recent = (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.userId == user.id,
            models.PasswordResetToken.usedAt.is_(None),
            models.PasswordResetToken.createdAt > now - PASSWORD_RESET_RESEND_INTERVAL,
        )
        .first()
    )
    if recent is not None:
        # Свежее письмо уже ушло: не засыпаем почту и не жжём квоту Resend
        return ok

    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.userId == user.id
    ).delete()

    token_value = secrets.token_urlsafe(32)
    db.add(
        models.PasswordResetToken(
            userId=user.id,
            token=token_value,
            expiresAt=now + PASSWORD_RESET_TTL,
        )
    )
    db.commit()

    send_password_reset_email(user.email, token_value, settings)

    return ok


@router.post("/reset-password", response_model=schemas.AuthResponseSchema)
def reset_password(
    payload: schemas.ResetPasswordSchema,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.AuthResponseSchema:
    reset_token = (
        db.query(models.PasswordResetToken)
        .filter(models.PasswordResetToken.token == payload.token)
        .one_or_none()
    )

    now = datetime.utcnow()
    if reset_token is None or reset_token.usedAt is not None or reset_token.expiresAt < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid_or_expired_token",
        )

    user = reset_token.user
    user.passwordHash = get_password_hash(payload.password)
    if user.emailVerified is None:
        # Переход по ссылке из письма и есть подтверждение владения почтой
        user.emailVerified = now
    reset_token.usedAt = now
    db.commit()
    db.refresh(user)

    access_token = create_access_token(user=user, settings=settings)
    return schemas.AuthResponseSchema(accessToken=access_token, tokenType="bearer", user=user)
```

- [ ] **Step 5: Прогнать тесты**

Run: `uv run pytest tests/test_password_reset.py -q 2>&1 | tail -3`
Expected: PASS, 10 passed.

Run: `uv run pytest -q 2>&1 | tail -3`
Expected: весь набор зелёный.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas.py backend/app/routers/auth.py backend/tests/
git commit -m "add: восстановление пароля по ссылке из письма"
```

---

## Task 6: Фронт — страницы восстановления пароля

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/api/auth.ts`, `frontend/src/types/api.ts`, `frontend/src/router.tsx`, `frontend/src/components/auth/LoginForm.tsx`
- Create: `frontend/src/pages/auth/ForgotPasswordPage.tsx`, `frontend/src/pages/auth/ResetPasswordPage.tsx`

- [ ] **Step 1: Не выкидывать пользователя со страницы при 401 на попытке входа**

Перехватчик в `frontend/src/api/client.ts` на любой 401 чистит localStorage и делает `window.location.href = '/login'`. Для попытки авторизации это неверно: страница перезагружается и сообщение об ошибке не успевает показаться. Заменить блок response-интерцептора на:

```ts
// Запросы, где 401 означает «не тот пароль / плохой код», а не «сессия протухла»
const AUTH_ATTEMPT_PATHS = ['/auth/login', '/auth/token', '/auth/yandex', '/auth/reset-password'];

// Response interceptor: Handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url ?? '';
    const isAuthAttempt = AUTH_ATTEMPT_PATHS.some((path) => url.startsWith(path));

    if (error.response?.status === 401 && !isAuthAttempt) {
      // Clear auth and redirect to login
      useAuthStore.getState().logout();
      // Очищаем весь localStorage кроме темы (если она есть)
      const theme = localStorage.getItem('theme');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 2: Добавить типы и методы API**

В `frontend/src/types/api.ts` после `RegisterRequest` добавить:

```ts
export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}
```

В `frontend/src/api/auth.ts` заменить блок импорта типов на:

```ts
import type {
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  AuthResponse,
} from '../types/api';
```

и дописать два метода в объект `authApi` перед `logout`:

```ts
  forgotPassword: (data: ForgotPasswordRequest) =>
    apiClient.post<RegisterResponse>('/auth/forgot-password', data),

  resetPassword: (data: ResetPasswordRequest) =>
    apiClient.post<AuthResponse>('/auth/reset-password', data),
```

- [ ] **Step 3: Страница запроса письма**

Создать `frontend/src/pages/auth/ForgotPasswordPage.tsx`:

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { authApi } from '../../api/auth';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const forgotSchema = z.object({
  email: z.string().email('Некорректный email'),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({ resolver: zodResolver(forgotSchema) });

  const forgotMutation = useMutation({
    mutationFn: authApi.forgotPassword,
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-100 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Восстановление пароля</h1>
          <p className="text-gray-600 text-sm">
            Пришлём ссылку для установки нового пароля.
          </p>
        </div>

        {forgotMutation.isSuccess ? (
          <div className="rounded-md bg-green-50 p-4">
            <p className="text-sm text-green-800">
              Если такой адрес зарегистрирован, письмо со ссылкой уже отправлено.
              Проверьте почту, в том числе папку со спамом.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit((data) => forgotMutation.mutate(data))} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Button type="submit" className="w-full" isLoading={forgotMutation.isPending}>
              Отправить ссылку
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Страница установки пароля**

Создать `frontend/src/pages/auth/ResetPasswordPage.tsx`:

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import PasswordInput from '../../components/ui/PasswordInput';
import Button from '../../components/ui/Button';

const resetSchema = z
  .object({
    password: z.string().min(8, 'Минимум 8 символов'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

type ResetFormData = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const token = searchParams.get('token');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({ resolver: zodResolver(resetSchema) });

  const resetMutation = useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: (response) => {
      setAuth(response.data.user, response.data.accessToken);
      navigate('/groups', { replace: true });
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail;
      setServerError(
        detail === 'invalid_or_expired_token'
          ? 'Ссылка истекла или уже использована. Запросите новую на странице восстановления.'
          : 'Не удалось задать пароль'
      );
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Ссылка неполная</h1>
          <p className="mt-2 text-sm text-gray-500">
            В адресе нет токена. Откройте ссылку из письма целиком.
          </p>
          <Link
            to="/forgot-password"
            className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Запросить новое письмо
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-100 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Новый пароль</h1>
          <p className="text-gray-600 text-sm">
            Задайте пароль — дальше вход будет по email и паролю.
          </p>
        </div>

        {serverError && (
          <div className="rounded-md bg-red-50 p-3 mb-4">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <form
          onSubmit={handleSubmit((data) =>
            resetMutation.mutate({ token, password: data.password })
          )}
          className="space-y-4"
        >
          <PasswordInput
            label="Пароль"
            placeholder="••••••••"
            error={errors.password?.message}
            {...register('password')}
          />

          <PasswordInput
            label="Повторите пароль"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Button type="submit" className="w-full" isLoading={resetMutation.isPending}>
            Сохранить пароль
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Прописать роуты**

В `frontend/src/router.tsx` добавить импорты:

```tsx
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
```

и после блока `/verify-email` добавить:

```tsx
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
```

- [ ] **Step 6: Ссылка «Забыли пароль?» на форме входа**

В `frontend/src/components/auth/LoginForm.tsx` добавить `Link` в импорт роутера:

```tsx
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
```

и между `<PasswordInput ... />` и `<Button ...>` вставить:

```tsx
      <div className="text-right">
        <Link
          to="/forgot-password"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Забыли пароль?
        </Link>
      </div>
```

- [ ] **Step 7: Проверить сборку**

Run: `cd frontend && npm run build`
Expected: сборка проходит без ошибок TypeScript.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "add: страницы восстановления и установки пароля"
```

---

## Task 7: Бэкенд — вход через Яндекс ID

**Files:**
- Create: `backend/app/yandex.py`, `backend/tests/test_yandex_auth.py`
- Modify: `backend/app/config.py`, `backend/app/schemas.py`, `backend/app/routers/auth.py`

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_yandex_auth.py`:

```python
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
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `uv run pytest tests/test_yandex_auth.py -q 2>&1 | tail -5`
Expected: FAIL — модуля `app.yandex` не существует (ImportError при сборе).

- [ ] **Step 3: Добавить настройки**

В `backend/app/config.py` в класс `Settings` после `algorithm` добавить:

```python
    yandex_client_id: str | None = None
    yandex_client_secret: str | None = None
```

- [ ] **Step 4: Написать модуль работы с Яндексом**

Создать `backend/app/yandex.py`:

```python
"""Работа с Яндекс ID: обмен кода на токен и чтение профиля.

Вся сетевая часть собрана здесь, чтобы роутер оставался тонким, а тесты
подменяли одну точку.
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import Settings

TOKEN_URL = "https://oauth.yandex.ru/token"
INFO_URL = "https://login.yandex.ru/info"
AVATAR_URL_TEMPLATE = "https://avatars.yandex.net/get-yapic/{avatar_id}/islands-200"
REQUEST_TIMEOUT_SECONDS = 10.0


def exchange_code_for_token(code: str, settings: Settings) -> str:
    """Обменять authorization code на access token."""
    if not settings.yandex_client_id or not settings.yandex_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="yandex_auth_not_configured",
        )

    try:
        response = httpx.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.yandex_client_id,
                "client_secret": settings.yandex_client_secret,
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="yandex_unavailable",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_yandex_code",
        )

    access_token = response.json().get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_yandex_code",
        )

    return str(access_token)


def fetch_user_info(access_token: str) -> dict[str, Any]:
    """Прочитать профиль пользователя по access token."""
    try:
        response = httpx.get(
            INFO_URL,
            params={"format": "json"},
            headers={"Authorization": f"OAuth {access_token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="yandex_unavailable",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_yandex_token",
        )

    return response.json()


def avatar_url(info: dict[str, Any]) -> str | None:
    avatar_id = info.get("default_avatar_id")
    if not avatar_id or info.get("is_avatar_empty", False):
        return None
    return AVATAR_URL_TEMPLATE.format(avatar_id=avatar_id)


def display_name(info: dict[str, Any]) -> str | None:
    for key in ("real_name", "display_name", "login"):
        value = info.get(key)
        if value:
            return str(value)
    return None
```

- [ ] **Step 5: Добавить схему запроса**

В `backend/app/schemas.py` на место удалённого `GoogleAuthRequestSchema` добавить:

```python
class YandexAuthRequestSchema(BaseModel):
    code: str = Field(min_length=1)
```

- [ ] **Step 6: Реализовать ручку**

В `backend/app/routers/auth.py` добавить импорт:

```python
from app.yandex import avatar_url, display_name, exchange_code_for_token, fetch_user_info
```

и на место удалённой google-ручки добавить:

```python
@router.post("/yandex", response_model=schemas.AuthResponseSchema)
def login_with_yandex(
    payload: schemas.YandexAuthRequestSchema,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.AuthResponseSchema:
    access_token = exchange_code_for_token(payload.code, settings)
    info = fetch_user_info(access_token)

    email = info.get("default_email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="yandex_email_missing",
        )

    user = db.query(models.User).filter(models.User.email == email).one_or_none()
    if user is None:
        user = models.User(
            email=email,
            name=display_name(info),
            image=avatar_url(info),
            emailVerified=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(user=user, settings=settings)
    return schemas.AuthResponseSchema(accessToken=token, tokenType="bearer", user=user)
```

- [ ] **Step 7: Прогнать тесты**

Run: `uv run pytest tests/test_yandex_auth.py -q 2>&1 | tail -3`
Expected: PASS, 8 passed.

Run: `uv run pytest -q 2>&1 | tail -3`
Expected: весь набор зелёный.

- [ ] **Step 8: Commit**

```bash
git add backend/app backend/tests
git commit -m "add: вход через Яндекс ID по authorization code flow"
```

---

## Task 8: Фронт — кнопка Яндекса и обработка возврата

**Files:**
- Create: `frontend/src/utils/yandexOAuth.ts`, `frontend/src/components/auth/YandexLoginButton.tsx`, `frontend/src/pages/auth/YandexCallbackPage.tsx`
- Modify: `frontend/src/api/auth.ts`, `frontend/src/types/api.ts`, `frontend/src/router.tsx`, `frontend/src/pages/auth/LoginPage.tsx`, `frontend/src/pages/auth/RegisterPage.tsx`, `frontend/Dockerfile`, `.docker/docker-compose.yml`, `.docker/docker-compose.prod.yml`

- [ ] **Step 1: Общий модуль настроек Яндекса**

Создать `frontend/src/utils/yandexOAuth.ts`:

```ts
const YANDEX_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';

export const YANDEX_STATE_KEY = 'yandex-oauth-state';
export const YANDEX_REDIRECT_KEY = 'yandex-oauth-redirect';

export const yandexClientId: string = import.meta.env.VITE_YANDEX_CLIENT_ID || '';

/** Redirect URI должен совпадать с зарегистрированным в кабинете Яндекса. */
export function yandexRedirectUri(): string {
  return `${window.location.origin}/auth/yandex/callback`;
}

export function buildYandexAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: yandexClientId,
    redirect_uri: yandexRedirectUri(),
    state,
  });
  return `${YANDEX_AUTHORIZE_URL}?${params.toString()}`;
}
```

- [ ] **Step 2: Кнопка входа**

Создать `frontend/src/components/auth/YandexLoginButton.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom';
import {
  YANDEX_REDIRECT_KEY,
  YANDEX_STATE_KEY,
  buildYandexAuthUrl,
  yandexClientId,
} from '../../utils/yandexOAuth';

export default function YandexLoginButton() {
  const [searchParams] = useSearchParams();

  if (!yandexClientId) {
    return null;
  }

  const handleClick = () => {
    const state = crypto.randomUUID();
    sessionStorage.setItem(YANDEX_STATE_KEY, state);

    const redirect = searchParams.get('redirect');
    if (redirect) {
      sessionStorage.setItem(YANDEX_REDIRECT_KEY, redirect);
    } else {
      sessionStorage.removeItem(YANDEX_REDIRECT_KEY);
    }

    window.location.href = buildYandexAuthUrl(state);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center justify-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold">
        Я
      </span>
      Войти с Яндекс ID
    </button>
  );
}
```

- [ ] **Step 3: Страница возврата**

Создать `frontend/src/pages/auth/YandexCallbackPage.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { YANDEX_REDIRECT_KEY, YANDEX_STATE_KEY } from '../../utils/yandexOAuth';

const ERROR_MESSAGES: Record<string, string> = {
  yandex_auth_not_configured: 'Вход через Яндекс ID сейчас недоступен',
  invalid_yandex_code: 'Не удалось подтвердить вход. Попробуйте ещё раз',
  invalid_yandex_token: 'Не удалось подтвердить вход. Попробуйте ещё раз',
  yandex_email_missing: 'Яндекс не передал email. Разрешите доступ к почте и повторите вход',
  yandex_unavailable: 'Яндекс временно недоступен. Попробуйте позже',
};

export default function YandexCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState<string | null>(null);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    if (searchParams.get('error')) {
      setError('Вход через Яндекс ID отменён');
      return;
    }

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const savedState = sessionStorage.getItem(YANDEX_STATE_KEY);
    sessionStorage.removeItem(YANDEX_STATE_KEY);

    if (!code || !state || state !== savedState) {
      setError('Не удалось проверить запрос. Начните вход заново');
      return;
    }

    authApi
      .yandexAuth({ code })
      .then((response) => {
        setAuth(response.data.user, response.data.accessToken);
        const redirect = sessionStorage.getItem(YANDEX_REDIRECT_KEY);
        sessionStorage.removeItem(YANDEX_REDIRECT_KEY);
        navigate(redirect || '/groups', { replace: true });
      })
      .catch((err: any) => {
        const detail = err.response?.data?.detail;
        setError(ERROR_MESSAGES[detail] ?? 'Не удалось войти через Яндекс ID');
      });
  }, []);

  if (!error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-gray-600">Завершаем вход…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full rounded-xl bg-white p-8 shadow text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Вход не удался</h2>
        <p className="mt-2 text-sm text-gray-500">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Вернуться ко входу
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Тип и метод API**

В `frontend/src/types/api.ts` после `RegisterRequest` добавить:

```ts
export interface YandexAuthRequest {
  code: string;
}
```

В `frontend/src/api/auth.ts` заменить блок импорта типов на:

```ts
import type {
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  YandexAuthRequest,
  AuthResponse,
} from '../types/api';
```

и дописать метод в `authApi` перед `verifyEmail`:

```ts
  yandexAuth: (data: YandexAuthRequest) =>
    apiClient.post<AuthResponse>('/auth/yandex', data),
```

- [ ] **Step 5: Роут и кнопки на страницах входа и регистрации**

В `frontend/src/router.tsx` добавить импорт `import YandexCallbackPage from './pages/auth/YandexCallbackPage';` и роут после `/reset-password`:

```tsx
  {
    path: '/auth/yandex/callback',
    element: <YandexCallbackPage />,
  },
```

В `frontend/src/pages/auth/LoginPage.tsx` и `frontend/src/pages/auth/RegisterPage.tsx` добавить импорт `import YandexLoginButton from '../../components/auth/YandexLoginButton';` и вернуть блок разделителя — в `LoginPage` между `<LoginForm />` и блоком «Нет аккаунта?», в `RegisterPage` на то же место относительно `<RegisterForm />`:

```tsx
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Или войти через</span>
            </div>
          </div>

          <div className="mt-6">
            <YandexLoginButton />
          </div>
        </div>
```

- [ ] **Step 6: Прокинуть client id в сборку**

`frontend/Dockerfile` — на место удалённых google-строк (после `ARG VITE_API_BASE_URL=""`) добавить:

```dockerfile
ARG VITE_YANDEX_CLIENT_ID=""
ENV VITE_YANDEX_CLIENT_ID=${VITE_YANDEX_CLIENT_ID}
```

`.docker/docker-compose.yml` и `.docker/docker-compose.prod.yml` — в блок `args` фронтенда после `VITE_API_BASE_URL: "/api"` добавить:

```yaml
        VITE_YANDEX_CLIENT_ID: ${YANDEX_CLIENT_ID}
```

- [ ] **Step 7: Проверить сборку**

Run: `cd frontend && npm run build`
Expected: сборка проходит без ошибок TypeScript.

- [ ] **Step 8: Commit**

```bash
git add frontend .docker
git commit -m "add: кнопка Яндекс ID и обработка возврата с кодом"
```

---

## Task 9: Скрипт разовой рассылки

**Files:**
- Create: `backend/app/scripts/__init__.py`, `backend/app/scripts/notify_passwordless_users.py`, `backend/tests/test_notify_passwordless_users.py`

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_notify_passwordless_users.py`:

```python
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
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `uv run pytest tests/test_notify_passwordless_users.py -q 2>&1 | tail -5`
Expected: FAIL — модуля `app.scripts.notify_passwordless_users` нет.

- [ ] **Step 3: Создать пакет скриптов**

Создать `backend/app/scripts/__init__.py`:

```python
"""Разовые скрипты обслуживания, запускаются вручную через python -m."""
```

- [ ] **Step 4: Написать скрипт**

Создать `backend/app/scripts/notify_passwordless_users.py`:

```python
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
            send_password_setup_email(user.email, token_value, settings)
            stats["sent"] += 1
            print(f"[sent] {user.email}")
        except Exception as exc:  # одна упавшая отправка не должна ронять прогон
            db.rollback()
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
```

- [ ] **Step 5: Прогнать тесты**

Run: `uv run pytest tests/test_notify_passwordless_users.py -q 2>&1 | tail -3`
Expected: PASS, 5 passed.

Run: `uv run pytest -q 2>&1 | tail -3`
Expected: весь набор зелёный.

- [ ] **Step 6: Commit**

```bash
git add backend/app/scripts backend/tests/test_notify_passwordless_users.py
git commit -m "add: скрипт разовой рассылки писем беспарольным пользователям"
```

---

## Task 10: Документация и переменные окружения

**Files:**
- Modify: `README.md`, `frontend/README.md`, `.docker/README-PROD.md`, `DEPLOYMENT-NGINX.md`, `.env`

- [ ] **Step 1: Обновить .env**

В `.env` заменить строку `GOOGLE_CLIENT_ID=...` на:

```
YANDEX_CLIENT_ID=<client_id из кабинета oauth.yandex.ru>
YANDEX_CLIENT_SECRET=<client_secret из кабинета oauth.yandex.ru>
```

Значения подставляются вручную из кабинета Яндекса, в репозиторий не коммитятся.

То же самое в `.docker/.env.example` — заменить блок `# Google OAuth Client ID` с `GOOGLE_CLIENT_ID` на:

```
# Яндекс ID
# ClientID публичный, попадает в сборку фронта
YANDEX_CLIENT_ID=your-yandex-client-id
# Client secret используется только бэкендом, наружу не уходит
YANDEX_CLIENT_SECRET=your-yandex-client-secret
```

Файл игнорируется гитом, но именно он служит образцом для боевого `.docker/.env`.

- [ ] **Step 2: Обновить README.md**

- строка 7: `- Регистрация / авторизация (email + Google OAuth)` → `- Регистрация / авторизация (email + Яндекс ID)`
- строка 77: `GOOGLE_CLIENT_ID="<client_id>"    # опционально` → две строки `YANDEX_CLIENT_ID="<client_id>"` и `YANDEX_CLIENT_SECRET="<client_secret>"`
- строка 139: `VITE_GOOGLE_CLIENT_ID=<client_id>` → `VITE_YANDEX_CLIENT_ID=<client_id>`
- строка 148: `GOOGLE_CLIENT_ID="<client_id>"` → `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET`
- строка 160 в таблице ручек: `| POST | `/auth/google` | Google OAuth |` → три строки:

```
| POST | `/auth/yandex` | Вход через Яндекс ID |
| POST | `/auth/forgot-password` | Запрос ссылки на установку пароля |
| POST | `/auth/reset-password` | Установка нового пароля по токену |
```

- [ ] **Step 3: Обновить frontend/README.md**

Строка 20: `VITE_GOOGLE_CLIENT_ID=<client_id>` → `VITE_YANDEX_CLIENT_ID=<client_id>`

- [ ] **Step 4: Обновить .docker/README-PROD.md**

Строки 32, 53-54: заменить блок `# Google OAuth` с `GOOGLE_CLIENT_ID=...` на:

```
# Яндекс ID
YANDEX_CLIENT_ID=your-yandex-client-id
YANDEX_CLIENT_SECRET=your-yandex-client-secret
```

- [ ] **Step 5: Обновить DEPLOYMENT-NGINX.md**

Строки 81-82 и 104: заменить блок `# Google OAuth` с боевым `GOOGLE_CLIENT_ID` на `YANDEX_CLIENT_ID` / `YANDEX_CLIENT_SECRET` с плейсхолдерами.

Раздел «Проблема: Google OAuth не работает» (строка 245) переписать:

```markdown
### Проблема: вход через Яндекс ID не работает

1. Проверьте `.docker/.env` — должны быть `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET`
2. В кабинете https://oauth.yandex.ru в разделе **Платформы → Веб-сервисы** в
   Redirect URI должен быть указан `https://scheduler.runker.ru/auth/yandex/callback`
3. В правах приложения должны стоять `login:email`, `login:info`, `login:avatar`
4. Фронт собирается с `VITE_YANDEX_CLIENT_ID` — после смены client id нужен
   пересбор образа, а не только перезапуск
```

- [ ] **Step 6: Финальная проверка**

Run: `uv run pytest -q 2>&1 | tail -3`
Expected: весь набор зелёный.

Run: `cd frontend && npm run build`
Expected: сборка проходит.

Run: `grep -rn -i "google" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.md" --include="*.yml" backend frontend/src .docker README.md DEPLOYMENT-NGINX.md | grep -v node_modules`
Expected: остались только упоминания Google Calendar в `frontend/src/components/events/EventModal.tsx` — они к авторизации не относятся.

- [ ] **Step 7: Commit**

`.env` и `.docker/.env.example` игнорируются гитом (`.gitignore:2-4`), в коммит попадает только документация.

```bash
git add README.md frontend/README.md .docker/README-PROD.md DEPLOYMENT-NGINX.md
git commit -m "docs: заменил Google на Яндекс ID в документации и переменных"
```

---

## Ручная проверка перед выкатом

Автотесты покрывают бэкенд, но живой OAuth-редирект и почту они не трогают. Перед мержем прогнать вручную:

1. Поднять локально бэкенд под живым uvicorn (не только TestClient) и фронт: в `.env` подставить боевые `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET`, фронт запустить с `VITE_YANDEX_CLIENT_ID` и с `npm run dev -- --host 127.0.0.1` — по умолчанию Vite слушает `[::1]` и снаружи оказывается недоступен.
2. Нажать «Войти с Яндекс ID» → авторизоваться → убедиться, что вернуло в `/groups` и профиль подтянулся с именем и аватаркой.
3. Повторить вход тем же аккаунтом — второй пользователь создаваться не должен.
4. На странице входа нажать «Забыли пароль?», ввести свой адрес, дождаться письма, перейти по ссылке, задать пароль, войти с ним.
5. Повторно открыть ту же ссылку из письма — должно показать «Ссылка истекла или уже использована».
6. На проде после миграции выполнить `python -m app.scripts.notify_passwordless_users --dry-run` в контейнере бэкенда и сверить список адресов, и только потом запускать боевой прогон.

---

## Порядок выката

1. **На VPS в `.docker/.env` добавить `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET`, убрать `GOOGLE_CLIENT_ID`.** Compose подставляет `${YANDEX_CLIENT_ID}` в build-arg фронта именно оттуда. Если переменной не будет, сборка не упадёт: `YandexLoginButton` при пустом client id возвращает `null`, и кнопка просто исчезнет со страницы входа без единой ошибки в логах.
2. Пересобрать образ фронта — client id вшивается на этапе сборки, перезапуска контейнера недостаточно.
3. Прогнать `alembic upgrade head`, выкатить релиз.
4. Проверить, что кнопка «Войти с Яндекс ID» видна на `/login`, и пройти вход живым аккаунтом.
5. `--dry-run` рассылки, сверка списка адресов.
6. Боевой прогон рассылки.

Шаги идут подряд, в одно окно: с момента выката и до рассылки бывшие
Google-юзеры войти не могут.
