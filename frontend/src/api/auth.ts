import apiClient from './client';
import type {
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  GoogleAuthRequest,
  AuthResponse,
} from '../types/api';

export const authApi = {
  register: (data: RegisterRequest) =>
    apiClient.post<RegisterResponse>('/auth/register', data),

  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>('/auth/login', data),

  googleAuth: (data: GoogleAuthRequest) =>
    apiClient.post<AuthResponse>('/auth/google', data),

  verifyEmail: (token: string) =>
    apiClient.get<AuthResponse>(`/auth/verify-email?token=${encodeURIComponent(token)}`),

  resendVerification: (email: string) =>
    apiClient.post<RegisterResponse>('/auth/resend-verification', { email }),

  logout: () => apiClient.post('/auth/logout'),
};
