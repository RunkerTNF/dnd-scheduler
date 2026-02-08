import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardDocumentIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Invite } from '../../types/models';
import { groupsApi } from '../../api/groups';
import Button from '../ui/Button';
import Input from '../ui/Input';

const inviteSchema = z.object({
  usesLeft: z.string().optional().refine((val) => {
    if (!val || val === '') return true;
    const num = parseInt(val);
    return !isNaN(num) && num > 0;
  }, 'Введите положительное число'),
  expiresIn: z.string(),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface InviteManagerProps {
  groupId: string;
  invites: Invite[];
  onClose: () => void;
}

export default function InviteManager({ groupId, invites }: InviteManagerProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit: hookFormHandleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      usesLeft: '',
      expiresIn: '7',
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: (data: { usesLeft?: number; expiresAt?: string }) =>
      groupsApi.createInvite(groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      reset();
      setError(null);
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Не удалось создать приглашение');
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: ({ inviteId }: { inviteId: string }) => groupsApi.deleteInvite(groupId, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    },
  });

  const handleCreateInvite = (formData: InviteFormData) => {
    const expiresAt = formData.expiresIn
      ? new Date(Date.now() + parseInt(formData.expiresIn) * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    createInviteMutation.mutate({
      usesLeft: formData.usesLeft ? parseInt(formData.usesLeft) : undefined,
      expiresAt,
    });
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(link);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-medium mb-4">Новое приглашение</h4>
        <form onSubmit={hookFormHandleSubmit(handleCreateInvite)} className="space-y-3">
          <Input
            type="number"
            label="Количество использований (необязательно)"
            placeholder="Без ограничений"
            error={errors.usesLeft?.message}
            min="1"
            {...register('usesLeft')}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Срок действия
            </label>
            <select
              {...register('expiresIn')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Бессрочно</option>
              <option value="1">1 день</option>
              <option value="7">7 дней</option>
              <option value="30">30 дней</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <Button
            type="submit"
            isLoading={createInviteMutation.isPending}
            className="w-full"
          >
            Создать ссылку
          </Button>
        </form>
      </div>

      {invites.length > 0 && (
        <div>
          <h4 className="font-medium mb-4">Активные приглашения</h4>
          <div className="space-y-2">
            {invites.map((invite) => (
              <div key={invite.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">
                      {invite.usesLeft ? `Осталось: ${invite.usesLeft}` : 'Без ограничений'}
                      {invite.expiresAt && (
                        <span className="ml-2">• До {format(new Date(invite.expiresAt), 'd MMM', { locale: ru })}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteInviteMutation.mutate({ inviteId: invite.id })}
                    className="text-red-600 hover:text-red-700"
                    title="Удалить приглашение"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/join/${invite.token}`}
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded bg-gray-50"
                  />
                  <button
                    onClick={() => copyInviteLink(invite.token)}
                    className={`p-2 rounded transition-colors ${copied === invite.token ? 'bg-green-50 text-green-600' : 'text-indigo-600 hover:bg-indigo-50'}`}
                    title={copied === invite.token ? 'Скопировано!' : 'Копировать ссылку'}
                  >
                    {copied === invite.token ? (
                      <CheckIcon className="h-5 w-5" />
                    ) : (
                      <ClipboardDocumentIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
