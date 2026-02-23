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
    """Get suggested dates based on player availability overlaps.

    Groups availability by DATE and finds days where the minimum number of players are available.
    For each suggested date, returns the time window when ALL suggested players overlap.
    Results are ranked by player count, duration, then date.
    """
    # Verify user is a member of the group
    group = verify_group_membership(db, current_user, group_id)

    # Get total member count
    member_count = db.query(models.Membership).filter(models.Membership.groupId == group_id).count()

    # Default min_players to 2 (at least 2 players must overlap)
    if min_players is None:
        min_players = 2

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

    # Day-based overlap algorithm: Find DATES where >= min_players are available
    # Groups availability by date and finds overlapping time windows for each date
    from collections import defaultdict
    from datetime import timedelta

    # Group availability by date
    dates_availability = defaultdict(dict)

    for avail in all_availability:
        # Get all dates covered by this availability period
        start_date = avail.startDateTime.date()
        end_date = avail.endDateTime.date()

        current_date = start_date
        while current_date <= end_date:
            user_id = avail.userId

            # Track earliest start and latest end for this user on this date
            if user_id in dates_availability[current_date]:
                existing = dates_availability[current_date][user_id]
                # Update to earliest start
                if avail.startDateTime < existing['start']:
                    existing['start'] = avail.startDateTime
                # Update to latest end
                if avail.endDateTime > existing['end']:
                    existing['end'] = avail.endDateTime
            else:
                dates_availability[current_date][user_id] = {
                    'user': avail.user,
                    'start': avail.startDateTime,
                    'end': avail.endDateTime,
                }

            current_date += timedelta(days=1)

    # Find dates with enough players using a sweep line algorithm.
    # Instead of requiring ALL players on a date to overlap simultaneously,
    # we find the best time segment where the maximum number of players overlap.
    suggestions = []

    for day, players_dict in dates_availability.items():
        if len(players_dict) < min_players:
            continue

        # Build sweep line events: end events (type=0) sort before start events (type=1)
        # at the same timestamp so we don't count a player leaving and joining at the
        # exact same moment as an overlap.
        events = []
        for user_id, player_data in players_dict.items():
            events.append((player_data['start'], 1, user_id, player_data['user']))  # start
            events.append((player_data['end'], 0, user_id, player_data['user']))   # end

        events.sort(key=lambda x: (x[0], x[1]))

        active_players = {}
        prev_time = None
        best_window = None

        for time, event_type, user_id, user in events:
            if prev_time is not None and active_players and prev_time < time:
                count = len(active_players)
                duration_mins = (time - prev_time).total_seconds() / 60

                if count >= min_players and duration_mins >= duration_hours * 60:
                    if (best_window is None
                            or count > best_window['count']
                            or (count == best_window['count'] and duration_mins > best_window['duration_mins'])):
                        best_window = {
                            'start': prev_time,
                            'end': time,
                            'players': dict(active_players),
                            'count': count,
                            'duration_mins': duration_mins,
                        }

            if event_type == 1:  # start
                active_players[user_id] = user
            else:               # end
                active_players.pop(user_id, None)

            prev_time = time

        if best_window:
            suggestions.append({
                "date": day.isoformat(),
                "startDateTime": best_window['start'].isoformat(),
                "endDateTime": best_window['end'].isoformat(),
                "playerCount": best_window['count'],
                "duration_hours": best_window['duration_mins'] / 60,
                "availablePlayers": [
                    {
                        "id": u.id,
                        "name": u.name,
                        "email": u.email,
                        "image": u.image,
                    }
                    for u in best_window['players'].values()
                ],
            })

    # Sort by player count (desc), duration (desc), then date (asc)
    suggestions.sort(key=lambda x: (-x["playerCount"], -x["duration_hours"], x["date"]))

    # Return top 10 suggestions
    return suggestions[:10]
