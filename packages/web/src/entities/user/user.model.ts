import { create } from "zustand";
import type { User, UserLoadStatus, UsersById, UserUuid } from "./user.types";

export interface UsersStoreState {
  ownerKey: string | null;
  usersById: UsersById;
  userIds: UserUuid[];
  loadStatus: UserLoadStatus;
  error: string | null;
  lastLoadedAt: number | null;
  lastRefreshedAt: number | null;

  startOwnerSync: (ownerKey: string) => void;
  replaceUsers: (users: User[], loadedAt?: number) => void;
  replaceUsersForOwner: (ownerKey: string, users: User[], loadedAt?: number) => boolean;
  upsertUsers: (users: User[], refreshedAt?: number) => void;
  upsertUsersForOwner: (ownerKey: string, users: User[], refreshedAt?: number) => boolean;
  upsertUser: (user: User, refreshedAt?: number) => void;
  upsertUserForOwner: (ownerKey: string, user: User, refreshedAt?: number) => boolean;
  markOffline: (userUuid: UserUuid, updatedAt?: number) => void;
  markOfflineForOwner: (ownerKey: string, userUuid: UserUuid, updatedAt?: number) => boolean;
  setLoadStatus: (status: UserLoadStatus, error?: string | null) => void;
  setLoadStatusForOwner: (
    ownerKey: string,
    status: UserLoadStatus,
    error?: string | null,
  ) => boolean;
  getUser: (userUuid: UserUuid) => User | undefined;
  clear: () => void;
}

const EMPTY_USERS_BY_ID: UsersById = {};
const EMPTY_USER_IDS: UserUuid[] = [];

function getTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isOlderUser(incoming: User, existing: User | undefined): boolean {
  return existing != null && getTimestamp(incoming.updatedAt) < getTimestamp(existing.updatedAt);
}

function buildUserIds(usersById: UsersById): UserUuid[] {
  return Object.keys(usersById);
}

function mergeFreshUser(usersById: UsersById, user: User): UsersById {
  const existing = usersById[user.uuid];
  if (isOlderUser(user, existing)) {
    return usersById;
  }
  return {
    ...usersById,
    [user.uuid]: user,
  };
}

function buildUsersById(
  users: User[],
  existingUsersById: UsersById = EMPTY_USERS_BY_ID,
): UsersById {
  let usersById: UsersById = {};
  for (const user of users) {
    const existing = existingUsersById[user.uuid];
    const freshUser = isOlderUser(user, existing) && existing != null ? existing : user;
    usersById = mergeFreshUser(usersById, freshUser);
  }
  return usersById;
}

function toIsoTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function buildReplaceUsersState(
  state: Pick<UsersStoreState, "usersById">,
  users: User[],
  loadedAt: number,
): Pick<
  UsersStoreState,
  "usersById" | "userIds" | "loadStatus" | "error" | "lastLoadedAt" | "lastRefreshedAt"
> {
  const usersById = buildUsersById(users, state.usersById);
  return {
    usersById,
    userIds: buildUserIds(usersById),
    loadStatus: "ready",
    error: null,
    lastLoadedAt: loadedAt,
    lastRefreshedAt: loadedAt,
  };
}

function buildUpsertUsersState(
  state: Pick<UsersStoreState, "usersById">,
  users: User[],
  refreshedAt: number,
): Pick<UsersStoreState, "usersById" | "userIds" | "lastRefreshedAt"> {
  let usersById = state.usersById;
  for (const user of users) {
    usersById = mergeFreshUser(usersById, user);
  }
  return {
    usersById,
    userIds: buildUserIds(usersById),
    lastRefreshedAt: refreshedAt,
  };
}

function buildUpsertUserState(
  state: Pick<UsersStoreState, "usersById">,
  user: User,
  refreshedAt: number,
): Pick<UsersStoreState, "usersById" | "userIds" | "lastRefreshedAt"> {
  const usersById = mergeFreshUser(state.usersById, user);
  return {
    usersById,
    userIds: buildUserIds(usersById),
    lastRefreshedAt: refreshedAt,
  };
}

// This store intentionally includes system users for author and member rendering.
// Action pickers must use selectSelectableWorkspaceUsers() from user-selectors.lib.ts.
export const useUsersStore = create<UsersStoreState>((set, get) => ({
  ownerKey: null,
  usersById: EMPTY_USERS_BY_ID,
  userIds: EMPTY_USER_IDS,
  loadStatus: "idle",
  error: null,
  lastLoadedAt: null,
  lastRefreshedAt: null,

  startOwnerSync(ownerKey) {
    set((state) => {
      if (state.ownerKey === ownerKey) {
        return {
          loadStatus: "loading",
          error: null,
        };
      }

      return {
        ownerKey,
        usersById: EMPTY_USERS_BY_ID,
        userIds: EMPTY_USER_IDS,
        loadStatus: "loading",
        error: null,
        lastLoadedAt: null,
        lastRefreshedAt: null,
      };
    });
  },

  replaceUsers(users, loadedAt = Date.now()) {
    set((state) => buildReplaceUsersState(state, users, loadedAt));
  },

  replaceUsersForOwner(ownerKey, users, loadedAt = Date.now()) {
    if (get().ownerKey !== ownerKey) {
      return false;
    }
    set((state) => buildReplaceUsersState(state, users, loadedAt));
    return true;
  },

  upsertUsers(users, refreshedAt = Date.now()) {
    set((state) => buildUpsertUsersState(state, users, refreshedAt));
  },

  upsertUsersForOwner(ownerKey, users, refreshedAt = Date.now()) {
    if (get().ownerKey !== ownerKey) {
      return false;
    }
    set((state) => buildUpsertUsersState(state, users, refreshedAt));
    return true;
  },

  upsertUser(user, refreshedAt = Date.now()) {
    set((state) => buildUpsertUserState(state, user, refreshedAt));
  },

  upsertUserForOwner(ownerKey, user, refreshedAt = Date.now()) {
    if (get().ownerKey !== ownerKey) {
      return false;
    }
    set((state) => buildUpsertUserState(state, user, refreshedAt));
    return true;
  },

  markOffline(userUuid, updatedAt = Date.now()) {
    set((state) => {
      const existing = state.usersById[userUuid];
      if (existing == null) {
        return state;
      }

      const nextUpdatedAt = toIsoTimestamp(updatedAt);
      if (getTimestamp(nextUpdatedAt) < getTimestamp(existing.updatedAt)) {
        return state;
      }

      return {
        usersById: {
          ...state.usersById,
          [userUuid]: {
            ...existing,
            status: "offline",
            updatedAt: nextUpdatedAt,
          },
        },
        lastRefreshedAt: updatedAt,
      };
    });
  },

  markOfflineForOwner(ownerKey, userUuid, updatedAt = Date.now()) {
    if (get().ownerKey !== ownerKey) {
      return false;
    }
    get().markOffline(userUuid, updatedAt);
    return true;
  },

  setLoadStatus(status, error = null) {
    set({ loadStatus: status, error });
  },

  setLoadStatusForOwner(ownerKey, status, error = null) {
    if (get().ownerKey !== ownerKey) {
      return false;
    }
    set({ loadStatus: status, error });
    return true;
  },

  getUser(userUuid) {
    return get().usersById[userUuid];
  },

  clear() {
    set({
      ownerKey: null,
      usersById: EMPTY_USERS_BY_ID,
      userIds: EMPTY_USER_IDS,
      loadStatus: "idle",
      error: null,
      lastLoadedAt: null,
      lastRefreshedAt: null,
    });
  },
}));
