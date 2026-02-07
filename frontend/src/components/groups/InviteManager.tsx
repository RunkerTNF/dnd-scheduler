import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardDocumentIcon, TrashIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import type { Invite } from '../../types/models';
import { groupsApi } from '../../api/groups';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface InviteManagerProps {
  groupId: string;
  invites: Invite[];
  onClose: () => void;
}

export default function InviteManager({ groupId, invites, onClose }: InviteManagerProps) {
  const [usesLeft, setUsesLeft] = useState<string>('');
  const [expiresIn, setExpiresIn] = useState<string>('7');
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createInviteMutation = useMutation({
    mutationFn: (data: { usesLeft?: number; expiresAt?: string }) =>
      groupsApi.createInvite(groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      setUsesLeft('');
      setError(null);
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Failed to create invite');
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: ({ inviteId }: { inviteId: string }) => groupsApi.deleteInvite(groupId, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    },
  });

  const handleCreateInvite = () => {
    const expiresAt = expiresIn
      ? new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    createInviteMutation.mutate({
      usesLeft: usesLeft ? parseInt(usesLeft) : undefined,
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
      {/* Create New Invite */}
      <div>
        <h4 className="font-medium mb-4">Create New Invite</h4>
        <div className="space-y-3">
          <Input
            type="number"
            label="Uses Left (optional)"
            placeholder="Unlimited"
            value={usesLeft}
            onChange={(e) => setUsesLeft(e.target.value)}
            min="1"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expires In
            </label>
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Never</option>
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <Button
            onClick={handleCreateInvite}
            isLoading={createInviteMutation.isPending}
            className="w-full"
          >
            Generate Invite Link
          </Button>
        </div>
      </div>

      {/* Existing Invites */}
      {invites.length > 0 && (
        <div>
          <h4 className="font-medium mb-4">Active Invites</h4>
          <div className="space-y-2">
            {invites.map((invite) => (
              <div key={invite.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">
                      {invite.usesLeft ? `${invite.usesLeft} uses left` : 'Unlimited uses'}
                      {invite.expiresAt && (
                        <span className="ml-2">• Expires {format(new Date(invite.expiresAt), 'MMM d')}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteInviteMutation.mutate({ inviteId: invite.id })}
                    className="text-red-600 hover:text-red-700"
                    title="Delete invite"
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
                    className={`p-2 ${copied === invite.token ? 'text-green-600' : 'text-indigo-600 hover:text-indigo-700'}`}
                    title={copied === invite.token ? 'Copied!' : 'Copy link'}
                  >
                    {copied === invite.token ? (
                      <span className="text-xs font-medium">Copied!</span>
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
