from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.database import get_db

router = APIRouter(prefix="/join", tags=["invites"])


@router.post("/", response_model=schemas.JoinResponseSchema)
def accept_invite(
    payload: schemas.JoinRequestSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.JoinResponseSchema:
    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid")

    invite = (
        db.query(models.Invite)
        .filter(models.Invite.token == token)
        .with_for_update()
        .one_or_none()
    )
    if invite is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid")

    now = datetime.now(timezone.utc)
    if invite.expiresAt and invite.expiresAt < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expired")

    group_id = invite.groupId

    membership = (
        db.query(models.Membership)
        .filter(
            models.Membership.userId == current_user.id,
            models.Membership.groupId == group_id,
        )
        .one_or_none()
    )
    if membership is None:
        membership = models.Membership(
            userId=current_user.id,
            groupId=group_id,
            role="player",
        )
        db.add(membership)

    if invite.usesLeft is not None:
        if invite.usesLeft <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_uses")
        invite.usesLeft -= 1

    db.commit()
    return schemas.JoinResponseSchema(ok=True, groupId=group_id)
