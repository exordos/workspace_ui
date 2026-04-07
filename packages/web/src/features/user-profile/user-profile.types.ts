/**
 * User profile type definitions.
 *
 * Maps Zulip's user object to a richer profile view with optional
 * fields for job title, manager, birthday, local time, phone, and timezone.
 */

export interface UserProfileData {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl: string;
  role: number;
  isBot?: boolean;
  isActive?: boolean;
  dateJoined?: string;
  jobTitle?: string;
  manager?: string;
  birthday?: string;
  localTime?: string;
  phone?: string;
  timezone?: string;
}

export interface OwnStatusData {
  statusText: string;
  away: boolean;
}
