import apiClient from './client';
import type {
  LoginRequest,
  RegisterRequest,
  GoogleAuthRequest,
  AuthResponse,
} from '../types/api';

export const authApi = {
  register: (data: RegisterRequest) =>
    apiClient.post<AuthResponse>('/auth/register', data),

  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>('/auth/login', data),

  googleAuth: (data: GoogleAuthRequest) =>
    apiClient.post<AuthResponse>('/auth/google', data),

  logout: () => apiClient.post('/auth/logout'),
};
