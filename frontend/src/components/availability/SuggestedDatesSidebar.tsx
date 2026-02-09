import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { UserGroupIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { availabilityApi } from '../../api/availability';

interface SuggestedDatesSidebarProps {
  groupId: string;
  memberCount: number;
  isOwner: boolean;
  onSchedule?: (startDateTime: string, endDateTime: string) => void;
}

export default function SuggestedDatesSidebar({ groupId, memberCount, isOwner, onSchedule }: SuggestedDatesSidebarProps) {
  const { data: suggestions = [] } = useQuery({
    queryKey: ['availability-overlaps', groupId],
    queryFn: async () => {
      const response = await availabilityApi.getOverlaps(groupId, {
        min_players: Math.ceil(memberCount * 0.75),
        duration_hours: 3,
      });
      return response.data;
    },
    enabled: memberCount > 0,
  });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Подходящие даты</h3>
        <CalendarIcon className="h-5 w-5 text-gray-400" />
      </div>

      {suggestions.length > 0 ? (
        <div className="space-y-3">
          {suggestions.map((suggestion, index) => {
            const start = new Date(suggestion.startDateTime);
            const end = new Date(suggestion.endDateTime);
            const duration = suggestion.duration_hours;

            return (
              <div
                key={index}
                className="border border-gray-200 rounded-lg p-3 hover:border-indigo-300 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-900">
                      {format(start, 'EEEE, d MMMM', { locale: ru })}
                    </p>
                    <p className="text-sm text-gray-600">
                      {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {duration.toFixed(1)} ч. пересечения
                    </p>
                  </div>
                  <div className="flex items-center space-x-1 text-indigo-600">
                    <UserGroupIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {suggestion.playerCount}/{memberCount}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 mt-2">
                  {suggestion.availablePlayers.slice(0, 3).map((player) => (
                    <span
                      key={player.id}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"
                    >
                      {player.name || player.email.split('@')[0]}
                    </span>
                  ))}
                  {suggestion.availablePlayers.length > 3 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      +{suggestion.availablePlayers.length - 3}
                    </span>
                  )}
                </div>

                {isOwner && onSchedule && (
                  <button
                    onClick={() => onSchedule(suggestion.startDateTime, suggestion.endDateTime)}
                    className="mt-2 w-full text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Назначить сессию
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <UserGroupIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Пока нет подходящих дат
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Участники должны отметить свою доступность
          </p>
        </div>
      )}
    </div>
  );
}
