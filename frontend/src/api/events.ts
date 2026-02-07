import apiClient from './client';
import type {
  EventCreateRequest,
  EventUpdateRequest,
  EventListParams,
} from '../types/api';
import type { Event } from '../types/models';

export const eventsApi = {
  list: (groupId: string, params?: EventListParams) =>
    apiClient.get<Event[]>(`/groups/${groupId}/events`, { params }),

  get: (groupId: string, eventId: string) =>
    apiClient.get<Event>(`/groups/${groupId}/events/${eventId}`),

  create: (groupId: string, data: EventCreateRequest) =>
    apiClient.post<Event>(`/groups/${groupId}/events`, data),

  update: (groupId: string, eventId: string, data: EventUpdateRequest) =>
    apiClient.put<Event>(`/groups/${groupId}/events/${eventId}`, data),

  delete: (groupId: string, eventId: string) =>
    apiClient.delete(`/groups/${groupId}/events/${eventId}`),
};
