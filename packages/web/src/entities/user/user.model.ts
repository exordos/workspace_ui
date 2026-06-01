// Файл отвечает за users store:
// - хранит профиль пользователя
// - хранит presence (online/idle)
// - хранит custom status и метаданные его загрузки
// - держит индекс email -> userId для быстрых обновлений presence
import { create } from "zustand";
import type {
  AvatarUrlByUserId,
  ZulipGroupSettingValue,
  ZulipRawMessage,
} from "~/shared/api/zulip.types";
import { bumpAvatarVersion } from "~/shared/lib/avatar";
import type { ZulipCustomProfileDataMap } from "~/shared/lib/user-profile-fields.lib";

export type PresenceStatus = "active" | "idle";

export interface UserPresence {
  status: PresenceStatus;
  timestamp: number;
}

export type UserStatusReactionType = "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji";

export interface UserStatus {
  // Обычный текстовый статус.
  text: string;
  // Имя emoji (если есть).
  emojiName?: string;
  // Код emoji от сервера (если есть).
  emojiCode?: string;
  // Тип emoji в Zulip.
  reactionType?: UserStatusReactionType;
  // Признак "отошел".
  away: boolean;
}

// Состояние загрузки custom status для конкретного пользователя.
export type UserStatusFetchState = "idle" | "loading" | "ready" | "error" | "invalid_user";
// Вид ошибки: временная или невалидный пользователь.
export type UserStatusErrorKind = "transient" | "invalid_user";

export interface UserRecord {
  user_id: number;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  role?: number;
  presence?: UserPresence;
  status?: UserStatus;
  // Время последнего успешного получения статуса.
  statusFetchedAt?: number;
  // Текущее состояние загрузки статуса.
  statusFetchState?: UserStatusFetchState;
  // До какого времени не надо повторять запрос (backoff/negative cache).
  statusNextRetryAt?: number;
  // Какая была последняя ошибка загрузки.
  statusErrorKind?: UserStatusErrorKind;
  /** Zulip directory: `false` when the account is deactivated. */
  is_active?: boolean;
  /** Zulip GET /users `profile_data` (custom profile fields). */
  profile_data?: ZulipCustomProfileDataMap;
}

export interface UserStatusFetchMeta {
  fetchState?: UserStatusFetchState;
  nextRetryAt?: number | null;
  errorKind?: UserStatusErrorKind | null;
  fetchedAt?: number;
}

export interface CurrentUserChannelCapabilities {
  realmCanAddSubscribersGroup?: ZulipGroupSettingValue;
  realmCanResolveTopicsGroup?: ZulipGroupSettingValue;
}

interface UsersState {
  users: Map<number, UserRecord>;
  emailToUserId: Map<string, number>;
  currentUserChannelCapabilities: CurrentUserChannelCapabilities;

  mergeUser: (payload: Partial<UserRecord> & { user_id: number }) => void;
  mergeUsers: (list: (Partial<UserRecord> & { user_id: number })[]) => void;
  mergeFromMessage: (msg: ZulipRawMessage) => void;
  setCurrentUserChannelCapabilities: (capabilities: CurrentUserChannelCapabilities) => void;
  setPresenceByEmail: (email: string, presence: UserPresence) => void;
  setPresence: (userId: number, presence: UserPresence) => void;
  // Сохраняет результат статуса и сбрасывает ошибку/backoff.
  setStatus: (userId: number, status: UserStatus | null, fetchedAt?: number) => void;
  // Обновляет служебные поля загрузки статуса.
  setStatusFetchMeta: (userId: number, meta: UserStatusFetchMeta) => void;
  getUser: (userId: number) => UserRecord | undefined;
  getAvatarUrl: (userId: number) => string | undefined;
  getDisplayName: (userId: number) => string;
  /** Resolves mention display name without subscribing to the full users Map. */
  findUserIdByDisplayName: (displayName: string) => number | null;
  getAvatarMap: () => AvatarUrlByUserId;
  clear: () => void;
}

const emptyUsers = (): Map<number, UserRecord> => new Map();
const emptyEmailMap = (): Map<string, number> => new Map();
const defaultCurrentUserChannelCapabilities = (): CurrentUserChannelCapabilities => ({});

let _cachedAvatarMap: Map<number, string> | null = null;
let _cachedAvatarMapUsersRef: Map<number, UserRecord> | null = null;

function normalizeUser(payload: Partial<UserRecord> & { user_id: number }): UserRecord {
  return {
    user_id: payload.user_id,
    full_name: payload.full_name ?? "",
    email: payload.email,
    avatar_url: payload.avatar_url,
    role: payload.role,
    presence: payload.presence,
    status: payload.status,
    statusFetchedAt: payload.statusFetchedAt,
    statusFetchState: payload.statusFetchState,
    statusNextRetryAt: payload.statusNextRetryAt,
    statusErrorKind: payload.statusErrorKind,
    is_active: payload.is_active,
    profile_data: payload.profile_data,
  };
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: emptyUsers(),
  emailToUserId: emptyEmailMap(),
  currentUserChannelCapabilities: defaultCurrentUserChannelCapabilities(),

  mergeUser(payload) {
    const { user_id } = payload;
    if (user_id == null) return;
    set((state) => {
      const next = new Map(state.users);
      const existing = next.get(user_id);
      const merged: UserRecord = {
        ...normalizeUser(existing ?? payload),
        ...normalizeUser(payload),
        user_id,
        full_name: payload.full_name ?? existing?.full_name ?? "",
        email: payload.email ?? existing?.email,
        avatar_url: payload.avatar_url ?? existing?.avatar_url,
        role: payload.role ?? existing?.role,
        presence: payload.presence ?? existing?.presence,
        status: payload.status ?? existing?.status,
        statusFetchedAt: payload.statusFetchedAt ?? existing?.statusFetchedAt,
        statusFetchState: payload.statusFetchState ?? existing?.statusFetchState,
        statusNextRetryAt: payload.statusNextRetryAt ?? existing?.statusNextRetryAt,
        statusErrorKind: payload.statusErrorKind ?? existing?.statusErrorKind,
        is_active: payload.is_active ?? existing?.is_active,
        profile_data: payload.profile_data ?? existing?.profile_data,
      };
      next.set(user_id, merged);
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
        const existing = next.get(u.user_id);
        const merged: UserRecord = {
          ...normalizeUser(existing ?? u),
          ...normalizeUser(u),
          user_id: u.user_id,
          full_name: u.full_name ?? existing?.full_name ?? "",
          email: u.email ?? existing?.email,
          avatar_url: u.avatar_url ?? existing?.avatar_url,
          role: u.role ?? existing?.role,
          presence: u.presence ?? existing?.presence,
          status: u.status ?? existing?.status,
          statusFetchedAt: u.statusFetchedAt ?? existing?.statusFetchedAt,
          statusFetchState: u.statusFetchState ?? existing?.statusFetchState,
          statusNextRetryAt: u.statusNextRetryAt ?? existing?.statusNextRetryAt,
          statusErrorKind: u.statusErrorKind ?? existing?.statusErrorKind,
          is_active: u.is_active ?? existing?.is_active,
          profile_data: u.profile_data ?? existing?.profile_data,
        };
        next.set(u.user_id, merged);
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
      user_id: msg.sender_id,
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

  setPresenceByEmail(email, presence) {
    const userId = get().emailToUserId.get(email);
    if (userId == null) return;
    get().setPresence(userId, presence);
  },

  setPresence(userId, presence) {
    set((state) => {
      const existing = state.users.get(userId);
      if (!existing) return state;
      const next = new Map(state.users);
      next.set(userId, { ...existing, presence });
      return { users: next };
    });
  },

  setStatus(userId, status, fetchedAt = Date.now()) {
    set((state) => {
      const existing = state.users.get(userId);
      if (!existing) return state;
      const next = new Map(state.users);
      next.set(userId, {
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
      const existing = state.users.get(userId);
      if (!existing) return state;
      const next = new Map(state.users);
      next.set(userId, {
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
    return get().users.get(userId);
  },

  getAvatarUrl(userId) {
    const u = get().users.get(userId);
    const url = u?.avatar_url;
    if (url == null || String(url).trim() === "") return undefined;
    return String(url).trim();
  },

  getDisplayName(userId) {
    const u = get().users.get(userId);
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
    const map = new Map<number, string>();
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
    });
  },
}));
