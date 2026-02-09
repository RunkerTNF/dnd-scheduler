import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsApi } from '../../api/groups';
import { eventsApi } from '../../api/events';
import { availabilityApi } from '../../api/availability';
import { useAuthStore } from '../../store/authStore';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { useState, useMemo, useCallback } from 'react';
import { getUserColor, hexToRgba } from '../../utils/colorHelpers';
import MembersSidebar from '../../components/groups/MembersSidebar';
import SuggestedDatesSidebar from '../../components/availability/SuggestedDatesSidebar';
import EventModal from '../../components/events/EventModal';
import DeleteGroupModal from '../../components/groups/DeleteGroupModal';
import { ArrowLeftIcon, TrashIcon } from '@heroicons/react/24/outline';

const localizer = momentLocalizer(moment);

function toLocalISOString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date());
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventModalMode, setEventModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const [eventModalData, setEventModalData] = useState<any>(null);
  const [eventInitialStart, setEventInitialStart] = useState<Date | undefined>();
  const [eventInitialEnd, setEventInitialEnd] = useState<Date | undefined>();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const handleNavigate = useCallback((newDate: Date) => setDate(newDate), []);

  const { data: group, isLoading } = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const response = await groupsApi.get(groupId!);
      return response.data;
    },
    enabled: !!groupId,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events', groupId],
    queryFn: async () => {
      const response = await eventsApi.list(groupId!);
      return response.data;
    },
    enabled: !!groupId,
  });

  const { data: availability = [] } = useQuery({
    queryKey: ['availability', groupId],
    queryFn: async () => {
      const response = await availabilityApi.list(groupId!);
      return response.data;
    },
    enabled: !!groupId,
  });

  const createAvailabilityMutation = useMutation({
    mutationFn: (data: { startDateTime: string; endDateTime: string }) =>
      availabilityApi.create(groupId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', groupId] });
      queryClient.invalidateQueries({ queryKey: ['availability-overlaps', groupId] });
    },
  });

  const deleteAvailabilityMutation = useMutation({
    mutationFn: (availId: string) =>
      availabilityApi.delete(groupId!, availId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', groupId] });
      queryClient.invalidateQueries({ queryKey: ['availability-overlaps', groupId] });
    },
  });

  const allUserIds = useMemo(() => {
    return group?.memberships.map(m => m.userId) || [];
  }, [group]);

  const calendarEvents = useMemo(() => {
    const eventItems = events.map(event => ({
      id: event.id,
      title: event.title,
      start: new Date(event.scheduledAt),
      end: new Date(new Date(event.scheduledAt).getTime() + event.durationMinutes * 60 * 1000),
      allDay: true,
      resource: { type: 'event', data: event },
    }));

    const availabilityItems = availability.map(avail => {
      const color = getUserColor(avail.userId, allUserIds);
      const memberName = avail.user.name || avail.user.email.split('@')[0];
      return {
        id: avail.id,
        title: memberName,
        start: new Date(avail.startDateTime),
        end: new Date(avail.endDateTime),
        allDay: true,
        resource: { type: 'availability', data: avail, color },
      };
    });

    return [...eventItems, ...availabilityItems];
  }, [events, availability, allUserIds]);

  const eventStyleGetter = (event: any) => {
    if (event.resource.type === 'event') {
      return {
        style: {
          backgroundColor: '#4F46E5',
          borderColor: '#4338CA',
          color: 'white',
          fontWeight: 'bold',
          cursor: 'pointer',
        },
      };
    } else {
      const color = event.resource.color || '#9CA3AF';
      const isOwn = event.resource.data.userId === user?.id;
      return {
        style: {
          backgroundColor: hexToRgba(color, 0.3),
          borderColor: color,
          borderWidth: '2px',
          borderStyle: 'solid',
          color: color,
          fontWeight: 'normal',
          cursor: isOwn ? 'pointer' : 'default',
        },
      };
    }
  };

  const handleSelectSlot = useCallback(({ start, end }: { start: Date; end: Date }) => {
    if (!user) return;

    // react-big-calendar в month view при драге выдаёт end = следующий день после последнего выбранного
    // Собираем все дни от start до end (не включая end)
    const days: Date[] = [];
    const current = new Date(start);
    while (current < end) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    for (const day of days) {
      const existingForDay = availability.find(
        a => a.userId === user.id && isSameDay(new Date(a.startDateTime), day)
      );

      if (existingForDay) {
        deleteAvailabilityMutation.mutate(existingForDay.id);
      } else {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 0);
        createAvailabilityMutation.mutate({
          startDateTime: toLocalISOString(dayStart),
          endDateTime: toLocalISOString(dayEnd),
        });
      }
    }
  }, [createAvailabilityMutation, deleteAvailabilityMutation, availability, user]);

  const handleSelectEvent = useCallback((event: any) => {
    // Клик на свою метку — удалить
    if (event.resource.type === 'availability' && event.resource.data.userId === user?.id) {
      deleteAvailabilityMutation.mutate(event.resource.data.id);
      return;
    }
    // Клик на игру — ГМ: редактирование, игрок: просмотр
    if (event.resource.type === 'event') {
      const eventData = event.resource.data;
      setEventModalData(eventData);
      setEventModalMode(group && group.ownerId === user?.id ? 'edit' : 'view');
      setEventInitialStart(undefined);
      setEventInitialEnd(undefined);
      setEventModalOpen(true);
    }
  }, [deleteAvailabilityMutation, user, group]);

  const handleScheduleFromSuggestion = useCallback((startDateTime: string, endDateTime: string) => {
    setEventModalMode('create');
    setEventModalData(null);
    setEventInitialStart(new Date(startDateTime));
    setEventInitialEnd(new Date(endDateTime));
    setEventModalOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Загрузка...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600">Группа не найдена</p>
      </div>
    );
  }

  const isOwner = group.ownerId === user?.id;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <Link
              to="/groups"
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Все группы
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">
              {group.name}
              {isOwner && (
                <span className="ml-3 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  Мастер
                </span>
              )}
            </h1>
            {group.description && (
              <p className="mt-2 text-gray-600">{group.description}</p>
            )}
          </div>
          {isOwner && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEventModalMode('create');
                  setEventModalData(null);
                  setEventInitialStart(undefined);
                  setEventInitialEnd(undefined);
                  setEventModalOpen(true);
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Назначить игру
              </button>
              <button
                onClick={() => setDeleteModalOpen(true)}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                title="Удалить группу"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Members */}
          <div className="lg:col-span-1">
            <MembersSidebar group={group} isOwner={isOwner} />
          </div>

          {/* Center - Calendar */}
          <div className="lg:col-span-2">
            {/* Player Legend */}
            <div className="mb-4 flex flex-wrap gap-2">
              {group.memberships.map((member) => {
                const color = getUserColor(member.userId, allUserIds);
                return (
                  <div key={member.userId} className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                    <span className="text-sm text-gray-700">
                      {member.user.name || member.user.email.split('@')[0]}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-lg shadow p-4" style={{ height: '900px' }}>
              <Calendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                view="month"
                date={date}
                onNavigate={handleNavigate}
                eventPropGetter={eventStyleGetter}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                selectable
                views={['month']}
                popup
              />
            </div>

            <div className="mt-4 text-sm text-gray-600">
              <p>
                Кликните на дату чтобы отметить доступность. Повторный клик — убрать.
              </p>
            </div>
          </div>

          {/* Right Sidebar - Suggested Dates */}
          <div className="lg:col-span-1">
            <SuggestedDatesSidebar
              groupId={groupId!}
              memberCount={group.memberships.length}
              isOwner={isOwner}
              onSchedule={handleScheduleFromSuggestion}
            />
          </div>
        </div>
      </div>

      <EventModal
        isOpen={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        groupId={groupId!}
        mode={eventModalMode}
        event={eventModalData}
        initialStart={eventInitialStart}
        initialEnd={eventInitialEnd}
      />

      <DeleteGroupModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        group={{ id: group.id, name: group.name }}
        onDeleteSuccess={() => navigate('/groups')}
      />
    </div>
  );
}
