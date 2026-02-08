import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { UsersIcon, CalendarIcon } from '@heroicons/react/24/outline';
import type { GroupDetail } from '../../types/models';

interface GroupCardProps {
  group: GroupDetail;
  isOwner: boolean;
}

export default function GroupCard({ group, isOwner }: GroupCardProps) {
  const navigate = useNavigate();

  const nextEvent = group.events
    .filter((event) => new Date(event.scheduledAt) > new Date())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

  return (
    <div
      onClick={() => navigate(`/groups/${group.id}`)}
      className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer p-6 border border-gray-200"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-gray-900 mb-1">
            {group.name}
            {isOwner && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                Мастер
              </span>
            )}
          </h3>
          {group.description && (
            <p className="text-sm text-gray-600 line-clamp-2">{group.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center">
          <UsersIcon className="h-5 w-5 mr-1" />
          <span>{group.memberships.length} уч.</span>
        </div>

        {nextEvent ? (
          <div className="flex items-center text-indigo-600">
            <CalendarIcon className="h-5 w-5 mr-1" />
            <span>{format(new Date(nextEvent.scheduledAt), 'd MMM, HH:mm', { locale: ru })}</span>
          </div>
        ) : (
          <div className="flex items-center text-gray-400">
            <CalendarIcon className="h-5 w-5 mr-1" />
            <span>Нет запланированных игр</span>
          </div>
        )}
      </div>
    </div>
  );
}
