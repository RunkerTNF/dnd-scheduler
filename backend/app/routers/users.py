from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.auth import get_current_user
from app.database import get_db

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
