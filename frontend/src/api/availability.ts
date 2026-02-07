import apiClient from './client';
import type {
  AvailabilityCreateRequest,
  AvailabilityUpdateRequest,
  AvailabilityListParams,
  AvailabilityOverlapsParams,
} from '../types/api';
import type {
  Availability,
  AvailabilityWithUser,
  OverlapSuggestion,
} from '../types/models';

export const availabilityApi = {
  list: (groupId: string, params?: AvailabilityListParams) =>
    apiClient.get<AvailabilityWithUser[]>(
      `/groups/${groupId}/availability`,
      { params }
    ),

  listMine: (groupId: string) =>
    apiClient.get<Availability[]>(`/groups/${groupId}/availability/me`),

  create: (groupId: string, data: AvailabilityCreateRequest) =>
    apiClient.post<Availability>(`/groups/${groupId}/availability`, data),

  update: (
    groupId: string,
    availId: string,
    data: AvailabilityUpdateRequest
  ) =>
    apiClient.put<Availability>(
      `/groups/${groupId}/availability/${availId}`,
      data
    ),

  delete: (groupId: string, availId: string) =>
    apiClient.delete(`/groups/${groupId}/availability/${availId}`),

  getOverlaps: (groupId: string, params?: AvailabilityOverlapsParams) =>
    apiClient.get<OverlapSuggestion[]>(
      `/groups/${groupId}/availability/overlaps`,
      { params }
    ),
};
