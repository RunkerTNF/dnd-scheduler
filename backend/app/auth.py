from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from uuid import uuid4

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from . import models
from .database import get_db


@dataclass
class AuthenticatedIdentity:
    email: str
    user_id: Optional[str] = None
    name: Optional[str] = None


async def get_identity(
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_name: str | None = Header(default=None, alias="X-User-Name"),
) -> AuthenticatedIdentity:
    if not x_user_email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")
    return AuthenticatedIdentity(email=x_user_email, user_id=x_user_id, name=x_user_name)


def get_current_user(
    identity: AuthenticatedIdentity = Depends(get_identity),
    db: Session = Depends(get_db),
) -> models.User:
    user = (
        db.query(models.User)
        .filter(models.User.email == identity.email)
        .one_or_none()
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")
    return user


def get_or_create_user(
    identity: AuthenticatedIdentity = Depends(get_identity),
    db: Session = Depends(get_db),
) -> models.User:
    user = (
        db.query(models.User)
        .filter(models.User.email == identity.email)
        .one_or_none()
    )
    if user is not None:
        return user
    # Create new user
    user = models.User(
        id=identity.user_id or str(uuid4()),
        email=identity.email,
        name=identity.name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
