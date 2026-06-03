/**
 * Hook for reading user custom status in UI.
 *
 * Exposes `{ statusLabel, fetchState, hasStatus }` and routes missing-status fetches
 * through the centralized orchestrator — components never call the network directly.
 */
import { useEffect, useMemo } from "react";
import { requestUserStatus, type RequestUserStatusOptions } from "./api/user.api";
import { formatUserStatusLabel } from "./user-status.lib";
import { useUsersStore, type UserRecord, type UserStatusFetchState } from "./user.model";

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
  userId: number | undefined | null,
  options?: UseUserStatusOptions,
): UserStatusSnapshot {
  const user = useUsersStore((state) => (userId != null ? state.getUser(userId) : undefined));
  const snapshot = useMemo(() => selectUserStatusSnapshot(user), [user]);

  useEffect(() => {
    if (userId == null || options?.requestOnMissing !== true) {
      return;
    }
    if (snapshot.hasStatus || snapshot.fetchState === "loading") {
      return;
    }
    void requestUserStatus(userId, {
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
