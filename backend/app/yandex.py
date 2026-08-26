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
