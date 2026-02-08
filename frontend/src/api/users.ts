import apiClient from './client';

export const usersApi = {
  updateProfile: (data: { name?: string; image?: string }) =>
    apiClient.put('/users/me', data),

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    apiClient.post('/users/me/password', data),
};
