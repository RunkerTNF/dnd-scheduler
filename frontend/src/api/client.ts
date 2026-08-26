import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Add JWT token to all requests
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Запросы, где 401 означает «не тот пароль / плохой код», а не «сессия протухла»
const AUTH_ATTEMPT_PATHS = ['/auth/login', '/auth/token', '/auth/yandex'];

// Response interceptor: Handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url ?? '';
    const isAuthAttempt = AUTH_ATTEMPT_PATHS.some((path) => url.startsWith(path));

    if (error.response?.status === 401 && !isAuthAttempt) {
      // Clear auth and redirect to login
      useAuthStore.getState().logout();
      // Очищаем весь localStorage кроме темы (если она есть)
      const theme = localStorage.getItem('theme');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
