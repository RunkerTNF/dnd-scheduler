"""Events router for managing scheduled game sessions"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.database import get_db
from app.permissions import verify_group_membership, verify_group_owner

router = APIRouter(prefix="/groups", tags=["events"])


@router.post("/{group_id}/events", response_model=schemas.EventSchema, status_code=status.HTTP_201_CREATED)
def create_event(
    group_id: str,
    payload: schemas.EventCreateSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Event:
    """Create a new event (scheduled game session).

    Only the group owner can schedule events.
    """
    # Verify user is the group owner
    verify_group_owner(db, current_user, group_id)

    # Create event
    event = models.Event(
        groupId=group_id,
        scheduledAt=payload.scheduledAt,
        durationMinutes=payload.durationMinutes,
        title=payload.title,
        notes=payload.notes,
        createdBy=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return event


@router.get("/{group_id}/events", response_model=list[schemas.EventSchema])
def list_events(
    group_id: str,
    upcoming_only: bool = Query(default=False, description="Show only upcoming events"),
    start_date: Optional[datetime] = Query(default=None, description="Filter by start date (inclusive)"),
    end_date: Optional[datetime] = Query(default=None, description="Filter by end date (inclusive)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[models.Event]:
    """List events for a group, optionally filtered.

    Any member of the group can view events.
    """
    # Verify user is a member of the group
    verify_group_membership(db, current_user, group_id)

    # Build query
    query = db.query(models.Event).filter(models.Event.groupId == group_id)

    # Apply filters
    if upcoming_only:
        query = query.filter(models.Event.scheduledAt >= datetime.utcnow())
    if start_date:
        query = query.filter(models.Event.scheduledAt >= start_date)
    if end_date:
        query = query.filter(models.Event.scheduledAt <= end_date)

    # Order by scheduled time
    events = query.order_by(models.Event.scheduledAt).all()

    return events


@router.get("/{group_id}/events/{event_id}", response_model=schemas.EventSchema)
def get_event(
    group_id: str,
    event_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Event:
    """Get details of a specific event.

    Any member of the group can view event details.
    """
    # Verify user is a member of the group
    verify_group_membership(db, current_user, group_id)

    # Get event
    event = (
        db.query(models.Event)
        .filter(models.Event.id == event_id, models.Event.groupId == group_id)
        .one_or_none()
    )

    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    return event


@router.put("/{group_id}/events/{event_id}", response_model=schemas.EventSchema)
def update_event(
    group_id: str,
    event_id: str,
    payload: schemas.EventUpdateSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Event:
    """Update an event.

    Only the group owner can update events.
    """
    # Verify user is the group owner
    verify_group_owner(db, current_user, group_id)

    # Get event
    event = (
        db.query(models.Event)
        .filter(models.Event.id == event_id, models.Event.groupId == group_id)
        .one_or_none()
    )

    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    # Update fields
    if payload.scheduledAt is not None:
        event.scheduledAt = payload.scheduledAt
    if payload.durationMinutes is not None:
        event.durationMinutes = payload.durationMinutes
    if payload.title is not None:
        event.title = payload.title
    if payload.notes is not None:
        event.notes = payload.notes

    db.commit()
    db.refresh(event)

    return event


@router.delete("/{group_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    group_id: str,
    event_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel (delete) an event.

    Only the group owner can cancel events.
    """
    # Verify user is the group owner
    verify_group_owner(db, current_user, group_id)

    # Get event
    event = (
        db.query(models.Event)
        .filter(models.Event.id == event_id, models.Event.groupId == group_id)
        .one_or_none()
    )

    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    db.delete(event)
    db.commit()
