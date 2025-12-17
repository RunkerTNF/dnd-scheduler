from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_google_identity_token,
)
from app.config import Settings, get_settings
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.AuthResponseSchema, status_code=status.HTTP_201_CREATED)
def register(
    payload: schemas.RegisterRequestSchema,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.AuthResponseSchema:
    existing = db.query(models.User).filter(models.User.email == payload.email).one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email_exists")

    user = models.User(
        email=payload.email,
        name=payload.name,
        passwordHash=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user=user, settings=settings)
    return schemas.AuthResponseSchema(accessToken=token, tokenType="bearer", user=user)


@router.post("/login", response_model=schemas.AuthResponseSchema)
def login(
    payload: schemas.LoginRequestSchema,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.AuthResponseSchema:
    user = authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")

    token = create_access_token(user=user, settings=settings)
    return schemas.AuthResponseSchema(accessToken=token, tokenType="bearer", user=user)


@router.post("/google", response_model=schemas.AuthResponseSchema)
def login_with_google(
    payload: schemas.GoogleAuthRequestSchema,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.AuthResponseSchema:
    token_info = verify_google_identity_token(payload.idToken, settings)
    email: str = token_info["email"]
    user = db.query(models.User).filter(models.User.email == email).one_or_none()
    if user is None:
        user = models.User(
            email=email,
            name=token_info.get("name"),
            image=token_info.get("picture"),
            emailVerified=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(user=user, settings=settings)
    return schemas.AuthResponseSchema(accessToken=token, tokenType="bearer", user=user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(_: models.User = Depends(get_current_user)) -> Response:
    """Stateless logout – clients should discard the issued bearer token."""

    return Response(status_code=status.HTTP_204_NO_CONTENT)
