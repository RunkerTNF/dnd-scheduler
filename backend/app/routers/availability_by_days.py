"""Day-based availability overlap algorithm

This module finds which DATES (not specific time windows) have enough players available.
It groups availability by date and checks if minimum player count is met for each day.
"""
from datetime import datetime, date, timedelta
from typing import List, Dict, Any
from collections import defaultdict


def find_availability_by_days(
    all_availability: list,
    min_players: int,
    max_suggestions: int = 10,
) -> List[Dict[str, Any]]:
    """
    Find suggested dates based on player availability overlaps.

    This algorithm:
    - Groups availability entries by DATE (ignoring time)
    - For each date, counts how many unique players are available
    - Returns dates where minimum player count is met
    - Suggests full-day slots (earliest start to latest end for that date)

    Args:
        all_availability: List of Availability objects with user, startDateTime, endDateTime
        min_players: Minimum number of players required
        max_suggestions: Maximum number of suggestions to return

    Returns:
        List of suggestion dictionaries with date, playerCount, availablePlayers
    """
    if not all_availability:
        return []

    # Group availability by date
    # Key: date object, Value: dict of userId -> (user, earliest_start, latest_end)
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

    # Find dates with enough players
    suggestions = []

    for day, players_dict in dates_availability.items():
        player_count = len(players_dict)

        if player_count >= min_players:
            # Get time range for this date (from earliest start to latest end)
            all_starts = [p['start'] for p in players_dict.values()]
            all_ends = [p['end'] for p in players_dict.values()]

            # For the suggested window, use the intersection:
            # Latest start time (when last person becomes available)
            # Earliest end time (when first person leaves)
            # This ensures ALL players are available during the suggested window
            latest_start = max(all_starts)
            earliest_end = min(all_ends)

            # Make sure there's actually an overlap (latest start < earliest end)
            if latest_start < earliest_end:
                duration_hours = (earliest_end - latest_start).total_seconds() / 3600

                suggestions.append({
                    'date': day.isoformat(),
                    'startDateTime': latest_start.isoformat(),
                    'endDateTime': earliest_end.isoformat(),
                    'playerCount': player_count,
                    'duration_hours': duration_hours,
                    'availablePlayers': [
                        {
                            'id': p['user'].id,
                            'name': p['user'].name,
                            'email': p['user'].email,
                            'image': p['user'].image,
                        }
                        for p in players_dict.values()
                    ],
                })

    # Sort by:
    # 1. Player count (descending) - more players is better
    # 2. Duration (descending) - longer overlap is better
    # 3. Date (ascending) - earlier dates first
    suggestions.sort(key=lambda x: (-x['playerCount'], -x['duration_hours'], x['date']))

    return suggestions[:max_suggestions]
