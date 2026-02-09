import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { groupsApi } from '../../api/groups';

interface DeleteGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: { id: string; name: string };
  onDeleteSuccess: () => void;
}

export default function DeleteGroupModal({
  isOpen,
  onClose,
  group,
  onDeleteSuccess,
}: DeleteGroupModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const isValid = inputValue === group.name;

  const deleteMutation = useMutation({
    mutationFn: () => groupsApi.delete(group.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group', group.id] });
      onDeleteSuccess();
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      if (detail === 'forbidden') {
        setError('Только владелец может удалить группу');
      } else if (detail === 'not_found') {
        onDeleteSuccess();
      } else {
        setError('Не удалось удалить группу');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      deleteMutation.mutate();
    }
  };

  const handleClose = () => {
    setInputValue('');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <form onSubmit={handleSubmit}>
        <div className="sm:flex sm:items-start">
          <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600" aria-hidden="true" />
          </div>
          <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left flex-1">
            <h3 className="text-lg font-semibold leading-6 text-gray-900 mb-2">
              Удалить группу?
            </h3>
            <div className="mt-2">
              <p className="text-sm text-gray-500 mb-4">
                Это действие необратимо. Будут удалены все участники, события и данные о доступности.
              </p>
              <Input
                label={`Введите название группы для подтверждения: ${group.name}`}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={group.name}
                error={!isValid && inputValue.length > 0 ? 'Название не совпадает' : ''}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-2">
          <Button
            type="submit"
            variant="danger"
            disabled={!isValid}
            isLoading={deleteMutation.isPending}
          >
            Удалить группу
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={deleteMutation.isPending}
          >
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  );
}
