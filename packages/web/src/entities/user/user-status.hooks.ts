/**
 * Hook for reading user custom status in UI.
 *
 * Exposes `{ statusLabel, fetchState, hasStatus }` and routes optional missing-status
 * requests through the backend-only user API facade.
 */
import { useEffect, useMemo, useState } from "react";
import { createLogger } from "~/shared/lib/logger";
import { ensureRealmEmojisLoaded, getCachedRealmEmojis } from "~/shared/lib/realm-emojis-cache";
import type { UserId } from "~/shared/lib/user-id.lib";
import {
  formatUserStatusLabel,
  getUserStatusEmojiDisplay,
  type UserStatusEmojiDisplay,
} from "./user-status.lib";
import {
  useUsersStore,
  type UserRecord,
  type UserStatus,
  type UserStatusFetchState,
} from "./user.model";
import type { RequestUserStatusOptions } from "./api/user.api";

const log = createLogger("user:status");

export interface UserStatusSnapshot {
  statusLabel?: string;
  fetchState: UserStatusFetchState;
  hasStatus: boolean;
}

export type UseUserStatusOptions = Pick<RequestUserStatusOptions, "reason" | "priority">;

export function selectUserStatusSnapshot(user: UserRecord | undefined): UserStatusSnapshot {
  const statusLabel = formatUserStatusLabel(user?.status) ?? undefined;
  return {
    statusLabel,
    fetchState: user?.statusFetchState ?? "idle",
    hasStatus: statusLabel != null && statusLabel.length > 0,
  };
}

export function useUserStatus(
  userId: UserId | undefined | null,
  _options?: UseUserStatusOptions,
): UserStatusSnapshot {
  const user = useUsersStore((state) => (userId != null ? state.getUser(userId) : undefined));
  const snapshot = useMemo(() => selectUserStatusSnapshot(user), [user]);

  return snapshot;
}

export function useUserStatusEmojiDisplay(
  status: UserStatus | null | undefined,
): UserStatusEmojiDisplay | null {
  const [realmEmojis, setRealmEmojis] = useState(() => getCachedRealmEmojis());
  const needsRealmEmoji = status?.reactionType === "realm_emoji";

  useEffect(() => {
    if (!needsRealmEmoji) {
      return;
    }
    let cancelled = false;
    void ensureRealmEmojisLoaded()
      .then((list) => {
        if (!cancelled) {
          setRealmEmojis(list);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          log.warn("Failed to load realm emojis for user status", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [needsRealmEmoji]);

  return useMemo(() => getUserStatusEmojiDisplay(status, realmEmojis), [realmEmojis, status]);
}
