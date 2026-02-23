from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_password_hash,
    get_token_hash,
    verify_google_identity_token,
)
from app.config import Settings, get_settings
from app.database import get_db
from app.email import send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.RegisterResponseSchema, status_code=status.HTTP_201_CREATED)
def register(
    payload: schemas.RegisterRequestSchema,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.RegisterResponseSchema:
    existing = db.query(models.User).filter(models.User.email == payload.email).one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email_exists")

    user = models.User(
        email=payload.email,
        name=payload.name,
        passwordHash=get_password_hash(payload.password),
    )
    db.add(user)
    db.flush()  # get user.id without committing

    token_value = str(uuid4())
    verification_token = models.EmailVerificationToken(
        userId=user.id,
        token=token_value,
        expiresAt=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(verification_token)
    db.commit()

    send_verification_email(user.email, token_value, settings)

    return schemas.RegisterResponseSchema(message="verification_email_sent")


@router.post("/login", response_model=schemas.AuthResponseSchema)
def login(
    payload: schemas.LoginRequestSchema,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.AuthResponseSchema:
    """Login with JSON body (for API clients)."""
    user = authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")

    if user.emailVerified is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="email_not_verified")

    token = create_access_token(user=user, settings=settings)
    return schemas.AuthResponseSchema(accessToken=token, tokenType="bearer", user=user)


@router.post("/token", response_model=schemas.OAuth2TokenSchema)
def login_for_swagger(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.OAuth2TokenSchema:
    """
    OAuth2 compatible token login (for Swagger UI).

    Use email as username. client_id and client_secret are not required.
    """
    user = authenticate_user(db, form_data.username, form_data.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")

    token = create_access_token(user=user, settings=settings)
    return schemas.OAuth2TokenSchema(access_token=token, token_type="bearer")


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
            emailVerified=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(user=user, settings=settings)
    return schemas.AuthResponseSchema(accessToken=token, tokenType="bearer", user=user)


@router.get("/verify-email", response_model=schemas.AuthResponseSchema)
def verify_email(
    token: str = Query(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.AuthResponseSchema:
    verification = (
        db.query(models.EmailVerificationToken)
        .filter(models.EmailVerificationToken.token == token)
        .one_or_none()
    )
    if verification is None or verification.expiresAt < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_or_expired_token")

    user = verification.user
    user.emailVerified = datetime.utcnow()
    db.delete(verification)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(user=user, settings=settings)
    return schemas.AuthResponseSchema(accessToken=access_token, tokenType="bearer", user=user)


@router.post("/resend-verification", response_model=schemas.RegisterResponseSchema)
def resend_verification(
    payload: schemas.ResendVerificationSchema,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> schemas.RegisterResponseSchema:
    user = db.query(models.User).filter(models.User.email == payload.email).one_or_none()

    # Don't leak whether the email exists or is already verified
    if user is None or user.emailVerified is not None:
        return schemas.RegisterResponseSchema(message="verification_email_sent")

    # Delete old tokens
    db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.userId == user.id
    ).delete()

    token_value = str(uuid4())
    verification_token = models.EmailVerificationToken(
        userId=user.id,
        token=token_value,
        expiresAt=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(verification_token)
    db.commit()

    send_verification_email(user.email, token_value, settings)

    return schemas.RegisterResponseSchema(message="verification_email_sent")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Add token to blacklist to invalidate it."""
    authorization = request.headers.get("Authorization")
    if not authorization or not authorization.startswith("Bearer "):
        return

    token = authorization.removeprefix("Bearer ")
    token_hash = get_token_hash(token)

    existing = (
        db.query(models.BlacklistedToken)
        .filter(models.BlacklistedToken.tokenHash == token_hash)
        .one_or_none()
    )
    if existing is not None:
        return  # Already blacklisted, nothing to do

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        exp_timestamp = payload.get("exp")
        if exp_timestamp:
            expires_at = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    except JWTError:
        expires_at = datetime.now(timezone.utc) + timedelta(days=1)

    blacklisted_token = models.BlacklistedToken(
        tokenHash=token_hash,
        expiresAt=expires_at,
    )
    db.add(blacklisted_token)
    db.commit()
