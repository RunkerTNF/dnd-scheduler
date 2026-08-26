import apiClient from './client';
import type {
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  AuthResponse,
} from '../types/api';

export const authApi = {
  register: (data: RegisterRequest) =>
    apiClient.post<RegisterResponse>('/auth/register', data),

  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>('/auth/login', data),

  verifyEmail: (token: string) =>
    apiClient.get<AuthResponse>(`/auth/verify-email?token=${encodeURIComponent(token)}`),

  resendVerification: (email: string) =>
    apiClient.post<RegisterResponse>('/auth/resend-verification', { email }),

  forgotPassword: (data: ForgotPasswordRequest) =>
    apiClient.post<RegisterResponse>('/auth/forgot-password', data),

  resetPassword: (data: ResetPasswordRequest) =>
    apiClient.post<AuthResponse>('/auth/reset-password', data),

  logout: () => apiClient.post('/auth/logout'),
};
