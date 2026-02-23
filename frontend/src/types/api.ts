// API request and response types
import type { User } from './models';

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface GoogleAuthRequest {
  idToken: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  user: User;
}

export interface RegisterResponse {
  message: string;
}

// Group types
export interface GroupCreateRequest {
  name: string;
  description?: string;
}

export interface InviteCreateRequest {
  expiresAt?: string;
  usesLeft?: number;
}

export interface JoinRequest {
  token: string;
}

export interface JoinResponse {
  ok: boolean;
  groupId: string;
}

// Event types
export interface EventCreateRequest {
  scheduledAt: string;
  durationMinutes: number;
  title: string;
  notes?: string;
}

export interface EventUpdateRequest {
  scheduledAt?: string;
  durationMinutes?: number;
  title?: string;
  notes?: string;
}

// Availability types
export interface AvailabilityCreateRequest {
  startDateTime: string;
  endDateTime: string;
  notes?: string;
}

export interface AvailabilityUpdateRequest {
  startDateTime?: string;
  endDateTime?: string;
  notes?: string;
}

// Query params
export interface AvailabilityListParams {
  start_date?: string;
  end_date?: string;
}

export interface AvailabilityOverlapsParams {
  min_players?: number;
  duration_hours?: number;
  start_date?: string;
  end_date?: string;
}

export interface EventListParams {
  upcoming_only?: boolean;
  start_date?: string;
  end_date?: string;
}
