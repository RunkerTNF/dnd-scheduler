"""Improved availability overlap algorithm

This module contains an improved version of the overlap detection algorithm
that handles edge cases better by:
1. Finding all time windows where minimum player count is met
2. Merging consecutive windows with same or more players
3. Being more flexible with overlapping availability
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any


def find_availability_overlaps(
    all_availability: list,
    min_players: int,
    duration_hours: int,
    max_suggestions: int = 10,
) -> List[Dict[str, Any]]:
    """
    Find suggested time slots based on player availability overlaps.

    This improved algorithm:
    - Creates time windows at each boundary point (start/end of availability)
    - Tracks which players are available in each window
    - Merges consecutive windows that have enough players
    - Returns windows that meet minimum duration requirement

    Args:
        all_availability: List of Availability objects with user, startDateTime, endDateTime
        min_players: Minimum number of players required
        duration_hours: Minimum duration in hours
        max_suggestions: Maximum number of suggestions to return

    Returns:
        List of suggestion dictionaries with startDateTime, endDateTime, playerCount, availablePlayers
    """
    if not all_availability:
        return []

    duration_minutes = duration_hours * 60

    # Create events for each availability start/end
    events = []
    for avail in all_availability:
        events.append((avail.startDateTime, 'start', avail.userId, avail.user))
        events.append((avail.endDateTime, 'end', avail.userId, avail.user))

    events.sort(key=lambda x: x[0])

    # Build time windows
    windows = []
    current_players = {}  # userId -> user
    last_time = None

    for event_time, event_type, user_id, user in events:
        # Create window from last_time to event_time
        if last_time and current_players:
            window_duration = (event_time - last_time).total_seconds() / 60
            windows.append({
                'start': last_time,
                'end': event_time,
                'duration_minutes': window_duration,
                'players': dict(current_players),  # Copy current state
                'player_count': len(current_players),
            })

        # Update current players
        if event_type == 'start':
            current_players[user_id] = user
        else:
            current_players.pop(user_id, None)

        last_time = event_time

    # Filter windows that meet minimum player requirement
    valid_windows = [w for w in windows if w['player_count'] >= min_players]

    if not valid_windows:
        return []

    # Merge consecutive windows to create longer periods
    merged_suggestions = []
    i = 0

    while i < len(valid_windows):
        current_window = valid_windows[i]
        merged_start = current_window['start']
        merged_end = current_window['end']
        merged_duration = current_window['duration_minutes']

        # Keep track of players present in ALL merged windows (intersection)
        # This ensures we only suggest times when ALL these players are available
        common_players = set(current_window['players'].keys())

        # Try to merge with next consecutive windows
        j = i + 1
        while j < len(valid_windows):
            next_window = valid_windows[j]

            # Check if windows are consecutive (no gap between them)
            if merged_end == next_window['start']:
                # Check if next window still has enough players
                next_players = set(next_window['players'].keys())
                potential_common = common_players & next_players

                if len(potential_common) >= min_players:
                    # Merge this window
                    merged_end = next_window['end']
                    merged_duration += next_window['duration_minutes']
                    common_players = potential_common
                    j += 1
                else:
                    # Not enough common players, stop merging
                    break
            else:
                # Gap between windows, stop merging
                break

        # Create suggestion from merged windows
        if merged_duration >= duration_minutes:
            # Get full user objects for common players
            player_users = [
                current_window['players'][uid]
                for uid in common_players
                if uid in current_window['players']
            ]

            merged_suggestions.append({
                'startDateTime': merged_start.isoformat(),
                'endDateTime': merged_end.isoformat(),
                'playerCount': len(common_players),
                'duration_hours': merged_duration / 60,
                'availablePlayers': [
                    {
                        'id': u.id,
                        'name': u.name,
                        'email': u.email,
                        'image': u.image,
                    }
                    for u in player_users
                ],
            })

        # Move to next unprocessed window
        i = j if j > i else i + 1

    # Sort suggestions by player count (descending), then by date (ascending)
    merged_suggestions.sort(key=lambda x: (-x['playerCount'], x['startDateTime']))

    # Return top suggestions
    return merged_suggestions[:max_suggestions]
