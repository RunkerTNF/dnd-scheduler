import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '../../api/events';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
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

export default function EventModal({ isOpen, onClose, groupId, initialStart, initialEnd }: EventModalProps) {
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('180');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Синхронизируем поля формы при открытии модалки
  useEffect(() => {
    if (isOpen) {
      setScheduledAt(initialStart ? toLocalDateTimeString(initialStart) : '');
      if (initialStart && initialEnd) {
        const diffMin = Math.round((initialEnd.getTime() - initialStart.getTime()) / 60000);
        setDurationMinutes(closestDuration(diffMin));
      } else {
        setDurationMinutes('180');
      }
      setTitle('');
      setNotes('');
      setError(null);
    }
  }, [isOpen, initialStart, initialEnd]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !scheduledAt || !durationMinutes) return;

    const localDate = new Date(scheduledAt);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const localISO = `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}T${pad(localDate.getHours())}:${pad(localDate.getMinutes())}:00`;

    createMutation.mutate({
      scheduledAt: localISO,
      durationMinutes: parseInt(durationMinutes),
      title,
      notes: notes || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Назначить игру">
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

        <div className="flex justify-end space-x-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Назначить
          </Button>
        </div>
      </form>
    </Modal>
  );
}
