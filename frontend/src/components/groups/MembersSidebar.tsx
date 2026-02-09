import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCircleIcon, TrashIcon, PlusIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';
import type { GroupDetail } from '../../types/models';
import { groupsApi } from '../../api/groups';
import { resolveImageUrl } from '../../utils/imageUrl';
import { sortMemberships } from '../../utils/colorHelpers';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import InviteManager from './InviteManager';

interface MembersSidebarProps {
  group: GroupDetail;
  isOwner: boolean;
}

export default function MembersSidebar({ group, isOwner }: MembersSidebarProps) {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Отсортированные участники: ГМ сверху, остальные по алфавиту
  const sortedMemberships = useMemo(() => {
    return sortMemberships(group.memberships, group.ownerId);
  }, [group.memberships, group.ownerId]);

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => groupsApi.removeMember(group.id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', group.id] });
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: (inviteId: string) => groupsApi.deleteInvite(group.id, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', group.id] });
    },
  });

  const handleRemoveMember = (userId: string, userName: string) => {
    if (confirm(`Удалить ${userName} из группы?`)) {
      removeMemberMutation.mutate(userId);
    }
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(link);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Участники ({group.memberships.length})</h3>
          {isOwner && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Пригласить
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {sortedMemberships.map((membership) => (
            <div
              key={membership.userId}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center space-x-3">
                {membership.user.image ? (
                  <img
                    src={resolveImageUrl(membership.user.image)}
                    alt={membership.user.name || ''}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <UserCircleIcon className="h-10 w-10 text-gray-400" />
                )}
                <div>
                  <p className="font-medium text-gray-900">
                    {membership.user.name || membership.user.email}
                  </p>
                  {membership.role === 'gm' && (
                    <span className="text-xs text-indigo-600 font-medium">Мастер</span>
                  )}
                </div>
              </div>

              {isOwner && membership.userId !== group.ownerId && (
                <button
                  onClick={() => handleRemoveMember(membership.userId, membership.user.name || membership.user.email)}
                  className="text-red-600 hover:text-red-700 p-1"
                  title="Удалить участника"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isOwner && group.invites.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Активные приглашения</h3>
          <div className="space-y-3">
            {group.invites.map((invite) => (
              <div key={invite.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">
                    {invite.usesLeft ? `Осталось: ${invite.usesLeft}` : 'Без ограничений'}
                  </span>
                  <button
                    onClick={() => deleteInviteMutation.mutate(invite.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="Удалить приглашение"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/join/${invite.token}`}
                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white truncate"
                  />
                  <button
                    onClick={() => copyInviteLink(invite.token)}
                    className={`p-1.5 rounded transition-colors ${copied === invite.token ? 'bg-green-50 text-green-600' : 'text-indigo-600 hover:bg-indigo-50'}`}
                    title={copied === invite.token ? 'Скопировано!' : 'Копировать ссылку'}
                  >
                    {copied === invite.token ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      <ClipboardDocumentIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Пригласить участников"
      >
        <InviteManager
          groupId={group.id}
          invites={group.invites}
          onClose={() => setIsInviteModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
