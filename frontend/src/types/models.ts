// Domain models matching backend schemas

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  isGM: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  isGM: boolean;
}

export interface Membership {
  userId: string;
  groupId: string;
  role: string;
  createdAt: string;
  user: MembershipUser;
}

export interface Invite {
  id: string;
  groupId: string;
  token: string;
  usesLeft: number | null;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface Event {
  id: string;
  groupId: string;
  scheduledAt: string;
  durationMinutes: number;
  title: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface Availability {
  id: string;
  userId: string;
  groupId: string;
  startDateTime: string;
  endDateTime: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityWithUser extends Availability {
  user: MembershipUser;
}

export interface GroupBase {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface GroupDetail extends GroupBase {
  memberships: Membership[];
  invites: Invite[];
  events: Event[];
}

export interface OverlapSuggestion {
  date: string; // ISO date string (YYYY-MM-DD)
  startDateTime: string;
  endDateTime: string;
  playerCount: number;
  duration_hours: number;
  availablePlayers: MembershipUser[];
}
