export type UserUuid = string;

export type UserPresenceStatus = "active" | "idle" | "offline" | "do_not_disturb";

export type UserLoadStatus = "idle" | "loading" | "ready" | "error";

export interface User {
  uuid: UserUuid;
  username: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  status: UserPresenceStatus;
  statusEmoji: string | null;
  statusText: string | null;
  lastPingAt: string;
  createdAt: string;
  updatedAt: string;
}

export type UsersById = Record<UserUuid, User>;

export interface UsersSnapshot {
  usersById: UsersById;
  userIds: UserUuid[];
}
