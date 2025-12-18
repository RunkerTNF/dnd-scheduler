from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app import models
from app.config import Settings, get_settings
from app.database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

# Lazy-initialized dummy hash for timing attack prevention
_dummy_hash_cache: str | None = None


def _get_dummy_hash() -> str:
    """Lazily initialize dummy hash to avoid import-time errors."""
    global _dummy_hash_cache
    if _dummy_hash_cache is None:
        _dummy_hash_cache = pwd_context.hash("dummy_password_for_timing")
    return _dummy_hash_cache


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def get_token_hash(token: str) -> str:
    """Generate a hash of the token for blacklist storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(*, user: models.User, settings: Settings) -> str:
    """Issue a JWT with an explicit ``userId`` claim for clarity."""

    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode = {
        "userId": user.id,
        "email": user.email,
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def authenticate_user(db: Session, email: str, password: str) -> Optional[models.User]:
    user = db.query(models.User).filter(models.User.email == email).one_or_none()
    if user is None or not user.passwordHash:
        # Prevent timing attack: always verify against dummy hash
        verify_password(password, _get_dummy_hash())
        return None
    if not verify_password(password, user.passwordHash):
        return None
    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="unauthorized",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # First, decode JWT (no DB call, fast validation)
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: str | None = payload.get("userId")
    except JWTError:
        raise credentials_exception
    if user_id is None:
        raise credentials_exception

    # Check if token is blacklisted (only after JWT is valid)
    token_hash = get_token_hash(token)
    blacklisted = (
        db.query(models.BlacklistedToken)
        .filter(models.BlacklistedToken.tokenHash == token_hash)
        .one_or_none()
    )
    if blacklisted is not None:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == user_id).one_or_none()
    if user is None:
        raise credentials_exception

    return user


def verify_google_identity_token(id_token_value: str, settings: Settings) -> dict[str, object]:
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="google_auth_not_configured",
        )

    try:
        token_info = id_token.verify_oauth2_token(
            id_token_value,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as exc:  # token invalid or expired
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_google_token",
        ) from exc

    email = token_info.get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="google_email_missing")

    if not token_info.get("email_verified", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="email_not_verified")

    return token_info
