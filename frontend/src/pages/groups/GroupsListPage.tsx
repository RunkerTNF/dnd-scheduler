import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from '@heroicons/react/24/outline';
import { groupsApi } from '../../api/groups';
import { useAuthStore } from '../../store/authStore';
import GroupCard from '../../components/groups/GroupCard';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import CreateGroupForm from '../../components/groups/CreateGroupForm';

export default function GroupsListPage() {
  const user = useAuthStore((state) => state.user);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data: groups, isLoading, error } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const response = await groupsApi.list();
      // Fetch full details for each group to get memberships and events
      const detailsPromises = response.data.map(group =>
        groupsApi.get(group.id).then(res => res.data)
      );
      return Promise.all(detailsPromises);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading groups...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Failed to load groups</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Groups</h1>
            <p className="text-gray-600 mt-1">
              Manage your D&D campaigns and schedule sessions
            </p>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Create Group
          </Button>
        </div>

        {groups && groups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                isOwner={group.ownerId === user?.id}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-200 mb-4">
              <PlusIcon className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No groups yet
            </h3>
            <p className="text-gray-600 mb-4">
              Get started by creating your first campaign group
            </p>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              Create Your First Group
            </Button>
          </div>
        )}
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Group"
      >
        <CreateGroupForm onSuccess={() => setIsCreateModalOpen(false)} />
      </Modal>
    </div>
  );
}
