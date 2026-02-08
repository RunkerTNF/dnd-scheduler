from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.auth import get_current_user, get_password_hash, verify_password
from app.database import get_db

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "avatars"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}", response_model=schemas.UserSchema)
def get_user(
    user_id: str,
    include: str | None = Query(default=None, description="Comma separated includes"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.User:
    include_groups = False
    if include:
        include_parts = {part.strip() for part in include.split(",") if part.strip()}
        include_groups = "groups" in include_parts

    if current_user.id != user_id and not current_user.isGM:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    query = db.query(models.User).filter(models.User.id == user_id)
    if include_groups:
        query = query.options(
            selectinload(models.User.memberships).selectinload(models.Membership.group)
        )
    user_obj = query.one_or_none()
    if user_obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    user = schemas.UserSchema.model_validate(user_obj)
    if not include_groups:
        user = user.model_copy(update={"memberships": None})

    return user


@router.put("/me", response_model=schemas.UserSchema)
def update_profile(
    payload: schemas.ProfileUpdateSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.User:
    """Update current user's profile (name, avatar)."""
    if payload.name is not None:
        current_user.name = payload.name
    if payload.image is not None:
        current_user.image = payload.image

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: schemas.ChangePasswordSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change current user's password."""
    if not current_user.passwordHash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Аккаунт создан через Google, пароль не установлен",
        )

    if not verify_password(payload.currentPassword, current_user.passwordHash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный текущий пароль",
        )

    current_user.passwordHash = get_password_hash(payload.newPassword)
    db.commit()


@router.post("/me/avatar", response_model=schemas.UserSchema)
def upload_avatar(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.User:
    """Upload avatar image file."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Допустимые форматы: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    contents = file.file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл слишком большой (максимум 5 МБ)",
        )

    filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(contents)

    current_user.image = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user
