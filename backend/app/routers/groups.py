from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
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


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(models.Group).filter(models.Group.id == group_id).one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if group.ownerId != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    db.delete(group)
    db.commit()


@router.get("/{group_id}/invites", response_model=list[schemas.InviteSchema])
def list_invites(
    group_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[models.Invite]:
    """List all invites for a group. Only the group owner can view invites."""
    group = db.query(models.Group).filter(models.Group.id == group_id).one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if group.ownerId != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    invites = (
        db.query(models.Invite)
        .filter(models.Invite.groupId == group_id)
        .order_by(models.Invite.createdAt.desc())
        .all()
    )
    return invites


@router.post("/{group_id}/invites", response_model=schemas.InviteSchema, status_code=status.HTTP_201_CREATED)
def create_invite(
    group_id: str,
    payload: schemas.InviteCreateSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Invite:
    """Create an invite for a group. Only the group owner can create invites."""
    group = db.query(models.Group).filter(models.Group.id == group_id).one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if group.ownerId != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    token = secrets.token_urlsafe(16)
    invite = models.Invite(
        groupId=group_id,
        token=token,
        expiresAt=payload.expiresAt,
        usesLeft=payload.usesLeft,
        createdBy=current_user.id,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.delete("/{group_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_invite(
    group_id: str,
    invite_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel/delete an invite. Only the group owner can cancel invites."""
    group = db.query(models.Group).filter(models.Group.id == group_id).one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if group.ownerId != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    invite = (
        db.query(models.Invite)
        .filter(models.Invite.id == invite_id, models.Invite.groupId == group_id)
        .one_or_none()
    )
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invite_not_found")

    db.delete(invite)
    db.commit()


@router.delete("/{group_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
def leave_group(
    group_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Leave a group. The group owner cannot leave (must delete the group instead)."""
    group = db.query(models.Group).filter(models.Group.id == group_id).one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if group.ownerId == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="owner_cannot_leave"
        )

    membership = (
        db.query(models.Membership)
        .filter(models.Membership.userId == current_user.id, models.Membership.groupId == group_id)
        .one_or_none()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_a_member")

    db.delete(membership)
    db.commit()


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    group_id: str,
    user_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a member from a group. Only the group owner can remove members.

    The group owner cannot be removed.
    """
    # Verify group exists and user is owner
    group = db.query(models.Group).filter(models.Group.id == group_id).one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if group.ownerId != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    # Prevent removing the owner
    if user_id == group.ownerId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cannot_remove_owner"
        )

    # Get membership
    membership = (
        db.query(models.Membership)
        .filter(models.Membership.userId == user_id, models.Membership.groupId == group_id)
        .one_or_none()
    )

    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="member_not_found")

    # Delete membership (cascades will clean up availability)
    db.delete(membership)
    db.commit()
