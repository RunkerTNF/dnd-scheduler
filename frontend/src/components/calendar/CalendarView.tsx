import { useState, useMemo } from 'react';
import { Calendar, momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import type { Event, AvailabilityWithUser, Membership } from '../../types/models';
import { getUserColor, hexToRgba } from '../../utils/colorHelpers';

const localizer = momentLocalizer(moment);

interface CalendarViewProps {
  groupId: string;
  events: Event[];
  availability: AvailabilityWithUser[];
  members: Membership[];
  isOwner: boolean;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    type: 'event' | 'availability';
    data: Event | AvailabilityWithUser;
    color?: string;
  };
}

export default function CalendarView({ groupId, events, availability, members, isOwner }: CalendarViewProps) {
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());

  // Get all user IDs for consistent color assignment
  const allUserIds = useMemo(() => {
    return members.map(m => m.userId);
  }, [members]);

  // Transform events and availability into calendar events
  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const eventItems: CalendarEvent[] = events.map(event => ({
      id: event.id,
      title: event.title,
      start: new Date(event.scheduledAt),
      end: new Date(new Date(event.scheduledAt).getTime() + event.durationMinutes * 60 * 1000),
      resource: {
        type: 'event',
        data: event,
      },
    }));

    const availabilityItems: CalendarEvent[] = availability.map(avail => {
      const color = getUserColor(avail.userId, allUserIds);
      const userName = avail.user.name || avail.user.email.split('@')[0];

      return {
        id: avail.id,
        title: `${userName} available`,
        start: new Date(avail.startDateTime),
        end: new Date(avail.endDateTime),
        resource: {
          type: 'availability',
          data: avail,
          color,
        },
      };
    });

    return [...eventItems, ...availabilityItems];
  }, [events, availability, allUserIds]);

  // Custom event style
  const eventStyleGetter = (event: CalendarEvent) => {
    if (event.resource.type === 'event') {
      return {
        style: {
          backgroundColor: '#4F46E5',
          borderColor: '#4338CA',
          color: 'white',
          fontWeight: 'bold',
        },
      };
    } else {
      // Availability
      const color = event.resource.color || '#gray';
      return {
        style: {
          backgroundColor: hexToRgba(color, 0.2),
          borderColor: color,
          borderWidth: '2px',
          borderStyle: 'solid',
          color: color,
          fontWeight: 'normal',
        },
      };
    }
  };

  // Handle event selection
  const handleSelectEvent = (event: CalendarEvent) => {
    if (event.resource.type === 'event') {
      // TODO: Open event modal
      console.log('Open event modal:', event.resource.data);
    } else {
      // TODO: Open availability modal (if owner)
      console.log('Open availability modal:', event.resource.data);
    }
  };

  // Handle slot selection (for creating new availability/events)
  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    if (isOwner) {
      // TODO: Open event creation modal
      console.log('Create event:', start, end);
    } else {
      // TODO: Open availability creation modal
      console.log('Create availability:', start, end);
    }
  };

  return (
    <div>
      {/* Player Legend */}
      <div className="mb-4 flex flex-wrap gap-2">
        {members.map((member) => {
          const color = getUserColor(member.userId, allUserIds);
          return (
            <div key={member.userId} className="flex items-center space-x-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm text-gray-700">
                {member.user.name || member.user.email.split('@')[0]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Calendar */}
      <div style={{ height: '600px' }}>
        <Calendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          eventPropGetter={eventStyleGetter}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          selectable
          popup
          views={['month', 'week', 'day']}
          step={60}
          showMultiDayTimes
        />
      </div>

      <div className="mt-4 text-sm text-gray-600">
        <p>
          {isOwner ? (
            <>Click and drag on the calendar to schedule a game session</>
          ) : (
            <>Click and drag on the calendar to mark your availability</>
          )}
        </p>
      </div>
    </div>
  );
}
