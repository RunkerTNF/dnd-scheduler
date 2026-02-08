import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types/models';

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  updateUser: (updates: Partial<User>) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,

      setAuth: (user, token) => set({ user, token }),

      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null,
      })),

      logout: () => set({ user: null, token: null }),

      isAuthenticated: () => {
        const state = get();
        return state.token !== null && state.user !== null;
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
