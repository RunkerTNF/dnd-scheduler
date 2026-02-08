import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

const availabilitySchema = z.object({
  startDateTime: z.string().min(1, 'Выберите дату и время начала'),
  endDateTime: z.string().min(1, 'Выберите дату и время окончания'),
  notes: z.string().optional(),
}).refine((data) => {
  if (!data.startDateTime || !data.endDateTime) return true;
  return new Date(data.endDateTime) > new Date(data.startDateTime);
}, {
  message: 'Время окончания должно быть позже времени начала',
  path: ['endDateTime'],
});

type AvailabilityFormData = z.infer<typeof availabilitySchema>;

export default function AvailabilityModal({ isOpen, onClose, groupId, initialStart, initialEnd }: AvailabilityModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit: hookFormHandleSubmit,
    reset,
    formState: { errors },
  } = useForm<AvailabilityFormData>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: {
      startDateTime: initialStart ? toLocalDateTimeString(initialStart) : '',
      endDateTime: initialEnd ? toLocalDateTimeString(initialEnd) : '',
      notes: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        startDateTime: initialStart ? toLocalDateTimeString(initialStart) : '',
        endDateTime: initialEnd ? toLocalDateTimeString(initialEnd) : '',
        notes: '',
      });
    }
  }, [isOpen, initialStart, initialEnd, reset]);

  const createMutation = useMutation({
    mutationFn: (data: { startDateTime: string; endDateTime: string; notes?: string }) =>
      availabilityApi.create(groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability', groupId] });
      onClose();
    },
    onError: (error: any) => {
      console.error('Availability save error:', error.response?.data?.detail);
    },
  });

  const handleSubmit = (formData: AvailabilityFormData) => {
    createMutation.mutate({
      startDateTime: new Date(formData.startDateTime).toISOString(),
      endDateTime: new Date(formData.endDateTime).toISOString(),
      notes: formData.notes || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Отметить доступность">
      <form onSubmit={hookFormHandleSubmit(handleSubmit)} className="space-y-4">
        <Input
          type="datetime-local"
          label="Начало"
          error={errors.startDateTime?.message}
          {...register('startDateTime')}
        />
        <Input
          type="datetime-local"
          label="Конец"
          error={errors.endDateTime?.message}
          {...register('endDateTime')}
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Заметка (необязательно)</label>
          <textarea
            {...register('notes')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={2}
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
