import apiClient from './client';
import type {
  GroupCreateRequest,
  InviteCreateRequest,
  JoinRequest,
  JoinResponse,
} from '../types/api';
import type { GroupBase, GroupDetail, Invite } from '../types/models';

export const groupsApi = {
  list: () => apiClient.get<GroupBase[]>('/groups'),

  get: (id: string) => apiClient.get<GroupDetail>(`/groups/${id}`),

  create: (data: GroupCreateRequest) =>
    apiClient.post<GroupBase>('/groups', data),

  delete: (id: string) => apiClient.delete(`/groups/${id}`),

  // Invites
  listInvites: (groupId: string) =>
    apiClient.get<Invite[]>(`/groups/${groupId}/invites`),

  createInvite: (groupId: string, data: InviteCreateRequest) =>
    apiClient.post<Invite>(`/groups/${groupId}/invites`, data),

  deleteInvite: (groupId: string, inviteId: string) =>
    apiClient.delete(`/groups/${groupId}/invites/${inviteId}`),

  // Members
  removeMember: (groupId: string, userId: string) =>
    apiClient.delete(`/groups/${groupId}/members/${userId}`),
};

export const joinApi = {
  join: (data: JoinRequest) =>
    apiClient.post<JoinResponse>('/join', data),
};
