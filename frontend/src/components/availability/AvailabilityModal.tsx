import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { availabilityApi } from '../../api/availability';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';


interface AvailabilityModalProps {
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

export default function AvailabilityModal({ isOpen, onClose, groupId, initialStart, initialEnd }: AvailabilityModalProps) {
  const [startDateTime, setStartDateTime] = useState(
    initialStart ? toLocalDateTimeString(initialStart) : ''
  );
  const [endDateTime, setEndDateTime] = useState(
    initialEnd ? toLocalDateTimeString(initialEnd) : ''
  );
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: { startDateTime: string; endDateTime: string; notes?: string }) =>
      availabilityApi.create(groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', groupId] });
      onClose();
      setNotes('');
    },
    onError: (error: any) => {
      console.error('Availability save error:', error.response?.data?.detail);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDateTime || !endDateTime) return;

    createMutation.mutate({
      startDateTime: new Date(startDateTime).toISOString(),
      endDateTime: new Date(endDateTime).toISOString(),
      notes: notes || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Отметить доступность">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="datetime-local"
          label="Начало"
          value={startDateTime}
          onChange={(e) => setStartDateTime(e.target.value)}
          required
        />
        <Input
          type="datetime-local"
          label="Конец"
          value={endDateTime}
          onChange={(e) => setEndDateTime(e.target.value)}
          required
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Заметка (необязательно)</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Например: могу, но лучше вечером"
          />
        </div>
        <div className="flex justify-end space-x-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
}
