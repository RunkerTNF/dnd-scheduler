import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '../../api/events';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

type EventModalMode = 'create' | 'edit' | 'view';

interface EventData {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  notes?: string | null;
}

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  mode: EventModalMode;
  event?: EventData | null;
  initialStart?: Date;
  initialEnd?: Date;
}

function toLocalDateTimeString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const DURATION_OPTIONS = ['60', '90', '120', '150', '180', '240', '300', '360'];

function closestDuration(minutes: number): string {
  let best = DURATION_OPTIONS[0];
  let bestDiff = Math.abs(minutes - parseInt(best));
  for (const opt of DURATION_OPTIONS) {
    const diff = Math.abs(minutes - parseInt(opt));
    if (diff < bestDiff) {
      best = opt;
      bestDiff = diff;
    }
  }
  return best;
}

function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) {
    return `${h} ${h === 1 ? 'час' : h < 5 ? 'часа' : 'часов'}`;
  }
  return `${h}.5 часа`;
}

function toGoogleCalendarUrl(title: string, startDate: Date, endDate: Date, notes?: string | null): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
    details: notes || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function EventModal({ isOpen, onClose, groupId, mode, event, initialStart, initialEnd }: EventModalProps) {
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('180');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (mode === 'create') {
      setTitle('');
      setNotes('');
      setScheduledAt(initialStart ? toLocalDateTimeString(initialStart) : '');
      if (initialStart && initialEnd) {
        const diffMin = Math.round((initialEnd.getTime() - initialStart.getTime()) / 60000);
        setDurationMinutes(closestDuration(diffMin));
      } else {
        setDurationMinutes('180');
      }
    } else if (event) {
      setTitle(event.title);
      setNotes(event.notes || '');
      setScheduledAt(toLocalDateTimeString(new Date(event.scheduledAt)));
      setDurationMinutes(closestDuration(event.durationMinutes));
    }
  }, [isOpen, mode, event, initialStart, initialEnd]);

  const createMutation = useMutation({
    mutationFn: (data: { scheduledAt: string; durationMinutes: number; title: string; notes?: string }) =>
      eventsApi.create(groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', groupId] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Не удалось создать игру');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { scheduledAt: string; durationMinutes: number; title: string; notes?: string }) =>
      eventsApi.update(groupId, event!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', groupId] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Не удалось обновить игру');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => eventsApi.delete(groupId, event!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', groupId] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Не удалось отменить игру');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !scheduledAt || !durationMinutes) return;

    const localDate = new Date(scheduledAt);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const localISO = `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}T${pad(localDate.getHours())}:${pad(localDate.getMinutes())}:00`;

    const data = {
      scheduledAt: localISO,
      durationMinutes: parseInt(durationMinutes),
      title,
      notes: notes || undefined,
    };

    if (mode === 'create') {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const modalTitle = mode === 'create' ? 'Назначить игру' : mode === 'edit' ? 'Редактировать игру' : 'Информация об игре';

  // View mode — read only
  if (mode === 'view' && event) {
    const startDate = new Date(event.scheduledAt);
    const endDate = new Date(startDate.getTime() + event.durationMinutes * 60000);

    return (
      <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Название</p>
            <p className="text-lg font-semibold text-gray-900">{event.title}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Дата и время</p>
            <p className="text-gray-900">
              {format(startDate, 'EEEE, d MMMM yyyy, HH:mm', { locale: ru })}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Длительность</p>
            <p className="text-gray-900">
              {durationLabel(event.durationMinutes)} ({format(startDate, 'HH:mm')} — {format(endDate, 'HH:mm')})
            </p>
          </div>
          {event.notes && (
            <div>
              <p className="text-sm font-medium text-gray-500">Заметки</p>
              <p className="text-gray-900 whitespace-pre-wrap">{event.notes}</p>
            </div>
          )}
          <div className="flex justify-between pt-2">
            <a
              href={toGoogleCalendarUrl(event.title, startDate, endDate, event.notes)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Google Calendar
            </a>
            <Button variant="secondary" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // Create / Edit mode
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: Сессия #5 — Логово дракона"
          required
        />
        <Input
          type="datetime-local"
          label="Дата и время"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          required
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Длительность</label>
          <select
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="60">1 час</option>
            <option value="90">1.5 часа</option>
            <option value="120">2 часа</option>
            <option value="150">2.5 часа</option>
            <option value="180">3 часа</option>
            <option value="240">4 часа</option>
            <option value="300">5 часов</option>
            <option value="360">6 часов</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Заметки (необязательно)</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Например: Возьмите листы персонажей"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {mode === 'edit' && event && (
          <div className="flex items-center space-x-3 pt-2">
            <Button
              variant="danger"
              type="button"
              isLoading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Отменить игру
            </Button>
            <a
              href={toGoogleCalendarUrl(
                event.title,
                new Date(event.scheduledAt),
                new Date(new Date(event.scheduledAt).getTime() + event.durationMinutes * 60000),
                event.notes
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Google Calendar
            </a>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {mode === 'create' ? 'Назначить' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
