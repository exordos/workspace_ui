/**
 * Hook for reading user custom status in UI.
 *
 * Exposes `{ statusLabel, fetchState, hasStatus }` and routes missing-status fetches
 * through the centralized orchestrator — components never call the network directly.
 */
import { useEffect, useMemo, useState } from "react";
import { createLogger } from "~/shared/lib/logger";
import { ensureRealmEmojisLoaded, getCachedRealmEmojis } from "~/shared/lib/realm-emojis-cache";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";
import { requestUserStatus, type RequestUserStatusOptions } from "./api/user.api";
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

const log = createLogger("user:status");

export interface UserStatusSnapshot {
  statusLabel?: string;
  fetchState: UserStatusFetchState;
  hasStatus: boolean;
}

export interface UseUserStatusOptions extends Pick<
  RequestUserStatusOptions,
  "reason" | "priority"
> {
  /** When true and status is missing, triggers centralized fallback load. */
  requestOnMissing?: boolean;
}

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
  options?: UseUserStatusOptions,
): UserStatusSnapshot {
  const user = useUsersStore((state) => (userId != null ? state.getUser(userId) : undefined));
  const snapshot = useMemo(() => selectUserStatusSnapshot(user), [user]);

  useEffect(() => {
    const numericUserId = numericUserIdOrNull(userId);
    if (numericUserId == null || options?.requestOnMissing !== true) {
      return;
    }
    if (snapshot.hasStatus || snapshot.fetchState === "loading") {
      return;
    }
    void requestUserStatus(numericUserId, {
      reason: options.reason ?? "compat",
      priority: options.priority ?? "low",
    });
  }, [
    options?.priority,
    options?.reason,
    options?.requestOnMissing,
    snapshot.fetchState,
    snapshot.hasStatus,
    userId,
  ]);

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
