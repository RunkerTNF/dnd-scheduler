"""Permission helper functions for authorization checks"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app import models


def verify_group_membership(db: Session, user: models.User, group_id: str) -> models.Group:
    """Verify that the user is a member of the group.

    Args:
        db: Database session
        user: Current authenticated user
        group_id: Group ID to check membership for

    Returns:
        The Group object if user is a member

    Raises:
        HTTPException: 404 if group not found, 403 if user is not a member
    """
    group = db.query(models.Group).filter(models.Group.id == group_id).one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    is_member = (
        db.query(models.Membership)
        .filter(models.Membership.userId == user.id, models.Membership.groupId == group_id)
        .one_or_none()
    ) is not None

    if not is_member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    return group


def verify_group_owner(db: Session, user: models.User, group_id: str) -> models.Group:
    """Verify that the user is the owner of the group.

    Args:
        db: Database session
        user: Current authenticated user
        group_id: Group ID to check ownership for

    Returns:
        The Group object if user is the owner

    Raises:
        HTTPException: 404 if group not found, 403 if user is not the owner
    """
    group = db.query(models.Group).filter(models.Group.id == group_id).one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    if group.ownerId != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    return group


def get_user_role_in_group(db: Session, user_id: str, group_id: str) -> str | None:
    """Get the user's role in a specific group.

    Args:
        db: Database session
        user_id: User ID to check
        group_id: Group ID to check

    Returns:
        The role string (e.g., "gm", "player") or None if not a member
    """
    membership = (
        db.query(models.Membership)
        .filter(models.Membership.userId == user_id, models.Membership.groupId == group_id)
        .one_or_none()
    )
    return membership.role if membership else None


def is_gm_in_group(db: Session, user_id: str, group_id: str) -> bool:
    """Check if the user has GM role in a specific group.

    Args:
        db: Database session
        user_id: User ID to check
        group_id: Group ID to check

    Returns:
        True if user has GM role, False otherwise
    """
    role = get_user_role_in_group(db, user_id, group_id)
    return role == "gm"
