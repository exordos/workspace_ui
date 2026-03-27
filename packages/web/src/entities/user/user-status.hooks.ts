// Файл отвечает за единое чтение статуса в UI.
// UI получает простой контракт:
// { statusLabel, fetchState, hasStatus }
// и не делает прямой сетевой запрос сам.
import { useEffect, useMemo } from "react";
import { requestUserStatus, type RequestUserStatusOptions } from "./api/user.api";
import { formatUserStatusLabel } from "./user-status.lib";
import { useUsersStore, type UserRecord, type UserStatusFetchState } from "./user.model";

export interface UserStatusSnapshot {
  // Готовая строка для UI (текст + emoji, если есть).
  statusLabel?: string;
  // Текущее состояние загрузки.
  fetchState: UserStatusFetchState;
  // Быстрый флаг: есть ли что показать по статусу.
  hasStatus: boolean;
}

export interface UseUserStatusOptions extends Pick<
  RequestUserStatusOptions,
  "reason" | "priority"
> {
  // Если true и статуса нет, хук попросит централизованный fallback.
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
    // Просим статус только через общий центр загрузки.
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
