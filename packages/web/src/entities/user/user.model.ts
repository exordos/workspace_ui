/**
 * Users store — profiles, presence, custom status, and email→userId index for presence updates.
 */
import { create } from "zustand";
import type {
  AvatarUrlByUserId,
  MessengerGroupSettingValue,
  WorkspaceUserPresenceStatus,
  WorkspaceRawMessage,
} from "~/shared/api/messenger.types";
import { bumpAvatarVersion } from "~/shared/lib/avatar";
import { messageAuthorId } from "~/shared/lib/message-author.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { userIdStorageKey } from "~/shared/lib/user-id.lib";
import type { WorkspaceCustomProfileDataMap } from "~/shared/lib/user-profile-fields.lib";
import type { CurrentUserMessageEditPolicy } from "~/shared/types/message-edit-policy";

export type { UserId };

export type PresenceStatus = WorkspaceUserPresenceStatus;

export interface UserPresence {
  status: PresenceStatus;
  timestamp: number;
}

export type UserStatusReactionType = "unicode_emoji" | "realm_emoji";

export interface UserStatus {
  text: string;
  emojiName?: string;
  emojiCode?: string;
  reactionType?: UserStatusReactionType;
  away: boolean;
}

export type UserStatusFetchState = "idle" | "loading" | "ready" | "error" | "invalid_user";
export type UserStatusErrorKind = "transient" | "invalid_user";

export interface UserRecord {
  user_id: UserId;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  role?: number;
  presence?: UserPresence;
  status?: UserStatus;
  statusFetchedAt?: number;
  statusFetchState?: UserStatusFetchState;
  /** Backoff / negative-cache window — skip network until this timestamp. */
  statusNextRetryAt?: number;
  statusErrorKind?: UserStatusErrorKind;
  /** Workspace directory: `false` when the account is deactivated. */
  is_active?: boolean;
  /** Workspace GET /users `profile_data` (custom profile fields). */
  profile_data?: WorkspaceCustomProfileDataMap;
  identity_kind?: "external";
  provider?: { kind: "zulip"; account_uuid: string } | null;
}

export interface UserStatusFetchMeta {
  fetchState?: UserStatusFetchState;
  nextRetryAt?: number | null;
  errorKind?: UserStatusErrorKind | null;
  fetchedAt?: number;
}

type UserMergePayload = Omit<Partial<UserRecord>, "status"> & {
  user_id: UserId;
  status?: UserStatus | null;
};

export interface CurrentUserChannelCapabilities {
  realmCanAddSubscribersGroup?: MessengerGroupSettingValue;
  realmCanResolveTopicsGroup?: MessengerGroupSettingValue;
  realmCanMoveMessagesBetweenChannelsGroup?: MessengerGroupSettingValue;
}

interface UsersState {
  users: Map<string, UserRecord>;
  emailToUserId: Map<string, UserId>;
  currentUserChannelCapabilities: CurrentUserChannelCapabilities;
  currentUserMessageEditPolicy: CurrentUserMessageEditPolicy;

  mergeUser: (payload: UserMergePayload) => void;
  mergeUsers: (list: UserMergePayload[]) => void;
  mergeFromMessage: (msg: WorkspaceRawMessage) => void;
  setCurrentUserChannelCapabilities: (capabilities: CurrentUserChannelCapabilities) => void;
  setCurrentUserMessageEditPolicy: (policy: CurrentUserMessageEditPolicy) => void;
  setPresenceByEmail: (email: string, presence: UserPresence) => void;
  setPresence: (userId: UserId, presence: UserPresence) => void;
  setStatus: (userId: UserId, status: UserStatus | null, fetchedAt?: number) => void;
  setStatusFetchMeta: (userId: UserId, meta: UserStatusFetchMeta) => void;
  getUser: (userId: UserId) => UserRecord | undefined;
  getAvatarUrl: (userId: UserId) => string | undefined;
  getDisplayName: (userId: UserId) => string;
  /** Resolves mention display name without subscribing to the full users Map. */
  findUserIdByDisplayName: (displayName: string) => UserId | null;
  getAvatarMap: () => AvatarUrlByUserId;
  clear: () => void;
}

const emptyUsers = (): Map<string, UserRecord> => new Map();
const emptyEmailMap = (): Map<string, UserId> => new Map();
const defaultCurrentUserChannelCapabilities = (): CurrentUserChannelCapabilities => ({});
const defaultCurrentUserMessageEditPolicy = (): CurrentUserMessageEditPolicy => ({});

let _cachedAvatarMap: AvatarUrlByUserId | null = null;
let _cachedAvatarMapUsersRef: Map<string, UserRecord> | null = null;

function normalizeUser(payload: UserMergePayload): UserRecord {
  return {
    user_id: payload.user_id,
    full_name: payload.full_name ?? "",
    email: payload.email,
    avatar_url: payload.avatar_url,
    role: payload.role,
    presence: payload.presence,
    status: payload.status ?? undefined,
    statusFetchedAt: payload.statusFetchedAt,
    statusFetchState: payload.statusFetchState,
    statusNextRetryAt: payload.statusNextRetryAt,
    statusErrorKind: payload.statusErrorKind,
    is_active: payload.is_active,
    profile_data: payload.profile_data,
    identity_kind: payload.identity_kind,
    provider: payload.provider,
  };
}

function meaningfulString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : undefined;
}

function mergeName(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string {
  return meaningfulString(incoming) ?? meaningfulString(existing) ?? "";
}

function mergeOptionalString(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | undefined {
  return meaningfulString(incoming) ?? meaningfulString(existing);
}

function userKey(userId: UserId): string {
  return userIdStorageKey(userId);
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: emptyUsers(),
  emailToUserId: emptyEmailMap(),
  currentUserChannelCapabilities: defaultCurrentUserChannelCapabilities(),
  currentUserMessageEditPolicy: defaultCurrentUserMessageEditPolicy(),

  mergeUser(payload) {
    const { user_id } = payload;
    if (user_id == null) return;
    const key = userKey(user_id);
    set((state) => {
      const next = new Map(state.users);
      const existing = next.get(key);
      const merged: UserRecord = {
        ...normalizeUser(existing ?? payload),
        ...normalizeUser(payload),
        user_id,
        full_name: mergeName(payload.full_name, existing?.full_name),
        email: mergeOptionalString(payload.email, existing?.email),
        avatar_url: mergeOptionalString(payload.avatar_url, existing?.avatar_url),
        role: payload.role ?? existing?.role,
        presence: payload.presence ?? existing?.presence,
        status: "status" in payload ? (payload.status ?? undefined) : existing?.status,
        statusFetchedAt: payload.statusFetchedAt ?? existing?.statusFetchedAt,
        statusFetchState: payload.statusFetchState ?? existing?.statusFetchState,
        statusNextRetryAt: payload.statusNextRetryAt ?? existing?.statusNextRetryAt,
        statusErrorKind: payload.statusErrorKind ?? existing?.statusErrorKind,
        is_active: payload.is_active ?? existing?.is_active,
        profile_data: payload.profile_data ?? existing?.profile_data,
        identity_kind: payload.identity_kind ?? existing?.identity_kind,
        provider: payload.provider !== undefined ? payload.provider : existing?.provider,
      };
      next.set(key, merged);
      const nextEmail = new Map(state.emailToUserId);
      if (merged.email) {
        nextEmail.set(merged.email, user_id);
      }
      return { users: next, emailToUserId: nextEmail };
    });
  },

  mergeUsers(list) {
    bumpAvatarVersion();
    set((state) => {
      const next = new Map(state.users);
      const nextEmail = new Map(state.emailToUserId);
      for (const u of list) {
        if (u.user_id == null) continue;
        const key = userKey(u.user_id);
        const existing = next.get(key);
        const merged: UserRecord = {
          ...normalizeUser(existing ?? u),
          ...normalizeUser(u),
          user_id: u.user_id,
          full_name: mergeName(u.full_name, existing?.full_name),
          email: mergeOptionalString(u.email, existing?.email),
          avatar_url: mergeOptionalString(u.avatar_url, existing?.avatar_url),
          role: u.role ?? existing?.role,
          presence: u.presence ?? existing?.presence,
          status: "status" in u ? (u.status ?? undefined) : existing?.status,
          statusFetchedAt: u.statusFetchedAt ?? existing?.statusFetchedAt,
          statusFetchState: u.statusFetchState ?? existing?.statusFetchState,
          statusNextRetryAt: u.statusNextRetryAt ?? existing?.statusNextRetryAt,
          statusErrorKind: u.statusErrorKind ?? existing?.statusErrorKind,
          is_active: u.is_active ?? existing?.is_active,
          profile_data: u.profile_data ?? existing?.profile_data,
          identity_kind: u.identity_kind ?? existing?.identity_kind,
          provider: u.provider !== undefined ? u.provider : existing?.provider,
        };
        next.set(key, merged);
        if (merged.email) {
          nextEmail.set(merged.email, u.user_id);
        }
      }
      return { users: next, emailToUserId: nextEmail };
    });
  },

  mergeFromMessage(msg) {
    const { mergeUser } = get();
    mergeUser({
      user_id: messageAuthorId(msg),
      full_name: msg.sender_full_name ?? "",
      avatar_url: msg.avatar_url ?? undefined,
    });
    if (msg.type === "private" && Array.isArray(msg.display_recipient)) {
      for (const r of msg.display_recipient) {
        if (r.id != null) {
          mergeUser({
            user_id: r.id,
            full_name: r.full_name ?? "",
            email: r.email,
            avatar_url: r.avatar_url ?? undefined,
          });
        }
      }
    }
  },

  setCurrentUserChannelCapabilities(capabilities) {
    set({ currentUserChannelCapabilities: capabilities });
  },

  setCurrentUserMessageEditPolicy(policy) {
    set({ currentUserMessageEditPolicy: policy });
  },

  setPresenceByEmail(email, presence) {
    const userId = get().emailToUserId.get(email);
    if (userId == null) return;
    get().setPresence(userId, presence);
  },

  setPresence(userId, presence) {
    set((state) => {
      const existing = state.users.get(userKey(userId));
      if (!existing) return state;
      const next = new Map(state.users);
      next.set(userKey(userId), { ...existing, presence });
      return { users: next };
    });
  },

  setStatus(userId, status, fetchedAt = Date.now()) {
    set((state) => {
      const existing = state.users.get(userKey(userId));
      if (!existing) return state;
      const next = new Map(state.users);
      next.set(userKey(userId), {
        ...existing,
        status: status ?? undefined,
        statusFetchedAt: fetchedAt,
        statusFetchState: "ready",
        statusNextRetryAt: undefined,
        statusErrorKind: undefined,
      });
      return { users: next };
    });
  },

  setStatusFetchMeta(userId, meta) {
    set((state) => {
      const existing = state.users.get(userKey(userId));
      if (!existing) return state;
      const next = new Map(state.users);
      next.set(userKey(userId), {
        ...existing,
        statusFetchState: meta.fetchState ?? existing.statusFetchState,
        statusNextRetryAt:
          meta.nextRetryAt === undefined
            ? existing.statusNextRetryAt
            : (meta.nextRetryAt ?? undefined),
        statusErrorKind:
          meta.errorKind === undefined ? existing.statusErrorKind : (meta.errorKind ?? undefined),
        statusFetchedAt: meta.fetchedAt ?? existing.statusFetchedAt,
      });
      return { users: next };
    });
  },

  getUser(userId) {
    return get().users.get(userKey(userId));
  },

  getAvatarUrl(userId) {
    const u = get().users.get(userKey(userId));
    const url = u?.avatar_url;
    if (url == null || String(url).trim() === "") return undefined;
    return String(url).trim();
  },

  getDisplayName(userId) {
    const u = get().users.get(userKey(userId));
    const name = u?.full_name;
    if (name != null && String(name).trim() !== "") return String(name).trim();
    return "Unknown";
  },

  findUserIdByDisplayName(displayName) {
    const trimmed = displayName.trim();
    if (trimmed.length === 0) return null;
    for (const [, user] of get().users) {
      if (user.full_name.trim() === trimmed) return user.user_id;
    }
    return null;
  },

  getAvatarMap() {
    const users = get().users;
    if (users === _cachedAvatarMapUsersRef && _cachedAvatarMap != null) return _cachedAvatarMap;
    _cachedAvatarMapUsersRef = users;
    const map: AvatarUrlByUserId = new Map();
    for (const [id, u] of users) {
      const url = u?.avatar_url;
      if (url != null && String(url).trim() !== "") {
        map.set(id, String(url).trim());
      }
    }
    _cachedAvatarMap = map;
    return map;
  },

  clear() {
    _cachedAvatarMap = null;
    _cachedAvatarMapUsersRef = null;
    set({
      users: emptyUsers(),
      emailToUserId: emptyEmailMap(),
      currentUserChannelCapabilities: defaultCurrentUserChannelCapabilities(),
      currentUserMessageEditPolicy: defaultCurrentUserMessageEditPolicy(),
    });
  },
}));
