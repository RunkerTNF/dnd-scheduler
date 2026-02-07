"""Availability router for managing player availability schedules"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.auth import get_current_user
from app.database import get_db
from app.permissions import verify_group_membership

router = APIRouter(prefix="/groups", tags=["availability"])


@router.post("/{group_id}/availability", response_model=schemas.AvailabilitySchema, status_code=status.HTTP_201_CREATED)
def create_availability(
    group_id: str,
    payload: schemas.AvailabilityCreateSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Availability:
    """Create a new availability entry for the current user in a group.

    Any member of the group can mark their availability.
    """
    # Verify user is a member of the group
    verify_group_membership(db, current_user, group_id)

    # Validate datetime range
    if payload.endDateTime <= payload.startDateTime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="endDateTime must be after startDateTime"
        )

    # Create availability
    availability = models.Availability(
        userId=current_user.id,
        groupId=group_id,
        startDateTime=payload.startDateTime,
        endDateTime=payload.endDateTime,
        notes=payload.notes,
    )
    db.add(availability)

    try:
        db.commit()
        db.refresh(availability)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Availability already exists for this time slot"
        )

    return availability


@router.get("/{group_id}/availability", response_model=list[schemas.AvailabilityWithUserSchema])
def list_availability(
    group_id: str,
    start_date: Optional[datetime] = Query(default=None, description="Filter by start date (inclusive)"),
    end_date: Optional[datetime] = Query(default=None, description="Filter by end date (inclusive)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[models.Availability]:
    """List all availability entries for a group, optionally filtered by date range.

    Any member of the group can view all availability.
    """
    # Verify user is a member of the group
    verify_group_membership(db, current_user, group_id)

    # Build query
    query = (
        db.query(models.Availability)
        .options(selectinload(models.Availability.user))
        .filter(models.Availability.groupId == group_id)
    )

    # Apply filters
    if start_date:
        query = query.filter(models.Availability.endDateTime >= start_date)
    if end_date:
        query = query.filter(models.Availability.startDateTime <= end_date)

    # Order by start time
    availability = query.order_by(models.Availability.startDateTime).all()

    return availability


@router.get("/{group_id}/availability/me", response_model=list[schemas.AvailabilitySchema])
def list_my_availability(
    group_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[models.Availability]:
    """List availability entries for the current user in a group."""
    # Verify user is a member of the group
    verify_group_membership(db, current_user, group_id)

    # Get current user's availability
    availability = (
        db.query(models.Availability)
        .filter(
            models.Availability.groupId == group_id,
            models.Availability.userId == current_user.id
        )
        .order_by(models.Availability.startDateTime)
        .all()
    )

    return availability


@router.put("/{group_id}/availability/{availability_id}", response_model=schemas.AvailabilitySchema)
def update_availability(
    group_id: str,
    availability_id: str,
    payload: schemas.AvailabilityUpdateSchema,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Availability:
    """Update an availability entry. Only the owner can update their availability."""
    # Verify user is a member of the group
    verify_group_membership(db, current_user, group_id)

    # Get availability
    availability = (
        db.query(models.Availability)
        .filter(
            models.Availability.id == availability_id,
            models.Availability.groupId == group_id
        )
        .one_or_none()
    )

    if availability is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    # Verify ownership
    if availability.userId != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    # Update fields
    if payload.startDateTime is not None:
        availability.startDateTime = payload.startDateTime
    if payload.endDateTime is not None:
        availability.endDateTime = payload.endDateTime
    if payload.notes is not None:
        availability.notes = payload.notes

    # Validate datetime range
    if availability.endDateTime <= availability.startDateTime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="endDateTime must be after startDateTime"
        )

    db.commit()
    db.refresh(availability)

    return availability


@router.delete("/{group_id}/availability/{availability_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_availability(
    group_id: str,
    availability_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an availability entry. Only the owner can delete their availability."""
    # Verify user is a member of the group
    verify_group_membership(db, current_user, group_id)

    # Get availability
    availability = (
        db.query(models.Availability)
        .filter(
            models.Availability.id == availability_id,
            models.Availability.groupId == group_id
        )
        .one_or_none()
    )

    if availability is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    # Verify ownership
    if availability.userId != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    db.delete(availability)
    db.commit()


@router.get("/{group_id}/availability/overlaps")
def get_availability_overlaps(
    group_id: str,
    min_players: Optional[int] = Query(default=None, ge=1, description="Minimum number of players required"),
    duration_hours: Optional[int] = Query(default=3, ge=1, le=12, description="Minimum duration in hours"),
    start_date: Optional[datetime] = Query(default=None, description="Filter by start date (inclusive)"),
    end_date: Optional[datetime] = Query(default=None, description="Filter by end date (inclusive)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get suggested time slots based on player availability overlaps.

    Returns time windows where the minimum number of players are available.
    Results are ranked by the number of available players.
    """
    # Verify user is a member of the group
    group = verify_group_membership(db, current_user, group_id)

    # Get total member count
    member_count = db.query(models.Membership).filter(models.Membership.groupId == group_id).count()

    # Default min_players to 75% of members
    if min_players is None:
        min_players = max(1, int(member_count * 0.75))

    # Get all availability entries for the group
    query = (
        db.query(models.Availability)
        .options(selectinload(models.Availability.user))
        .filter(models.Availability.groupId == group_id)
    )

    if start_date:
        query = query.filter(models.Availability.endDateTime >= start_date)
    if end_date:
        query = query.filter(models.Availability.startDateTime <= end_date)

    all_availability = query.order_by(models.Availability.startDateTime).all()

    if not all_availability:
        return []

    # Simple overlap algorithm: Find time windows where >= min_players are available
    # This is a simplified version - a production algorithm would be more sophisticated
    suggestions = []

    # Group availability by rough time windows (to find overlaps)
    from collections import defaultdict
    from datetime import timedelta

    # Create events for each availability start/end
    events = []
    for avail in all_availability:
        events.append((avail.startDateTime, 'start', avail.userId, avail.user))
        events.append((avail.endDateTime, 'end', avail.userId, avail.user))

    events.sort(key=lambda x: x[0])

    # Track currently available players
    current_players = {}  # userId -> user
    last_time = None

    duration_minutes = duration_hours * 60

    for event_time, event_type, user_id, user in events:
        # If we have enough players and a significant time window, add suggestion
        if last_time and len(current_players) >= min_players:
            window_duration = (event_time - last_time).total_seconds() / 60
            if window_duration >= duration_minutes:
                suggestions.append({
                    "startDateTime": last_time.isoformat(),
                    "endDateTime": event_time.isoformat(),
                    "playerCount": len(current_players),
                    "availablePlayers": [
                        {
                            "id": u.id,
                            "name": u.name,
                            "email": u.email,
                            "image": u.image,
                        }
                        for u in current_players.values()
                    ],
                })

        # Update current players
        if event_type == 'start':
            current_players[user_id] = user
        else:
            current_players.pop(user_id, None)

        last_time = event_time

    # Sort suggestions by player count (descending), then by date (ascending)
    suggestions.sort(key=lambda x: (-x["playerCount"], x["startDateTime"]))

    # Return top 10 suggestions
    return suggestions[:10]
