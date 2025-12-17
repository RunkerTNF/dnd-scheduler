from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.auth import get_current_user
from app.database import get_db

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("/", response_model=list[schemas.GroupBaseSchema])
def list_groups(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[models.Group]:
    groups = (
        db.query(models.Group)
        .join(models.Membership, models.Membership.groupId == models.Group.id)
        .filter(models.Membership.userId == current_user.id)
        .order_by(models.Group.createdAt.desc())
        .all()
    )
    return groups


@router.post("/", response_model=schemas.GroupBaseSchema, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: schemas.GroupCreateSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Group:
    group = models.Group(
        ownerId=current_user.id,
        name=payload.name,
        description=payload.description,
    )
    membership = models.Membership(userId=current_user.id, group=group, role="gm")
    db.add(group)
    db.add(membership)
    db.commit()
    db.refresh(group)
    return group


@router.get("/{group_id}", response_model=schemas.GroupDetailSchema)
def get_group(
    group_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Group:
    group = (
        db.query(models.Group)
        .options(
            selectinload(models.Group.memberships).joinedload(models.Membership.user),
            selectinload(models.Group.invites),
            selectinload(models.Group.events),
        )
        .filter(models.Group.id == group_id)
        .one_or_none()
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    is_member = any(m.userId == current_user.id for m in group.memberships)
    if not is_member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_group(
    group_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    group = db.query(models.Group).filter(models.Group.id == group_id).one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if group.ownerId != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    db.delete(group)
    db.commit()
