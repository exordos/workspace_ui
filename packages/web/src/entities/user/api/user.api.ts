// Файл с публичными API-методами user-слайса.
// Здесь только вызовы endpoint'ов и связывание с оркестратором загрузки статусов.

import {
  getCurrentInstance,
  refreshWorkspaceApiBase,
  refreshZulipApiBase,
  zulipApi,
} from "~/shared/api/client";
import { createLogger } from "~/shared/lib/logger";
import { requestUserStatusWithPolicy } from "./user.api.orchestrator";
import {
  isBadRequestError,
  normalizeGetUserStatusPayload,
  normalizeOwnStatusResponse,
} from "./user.api.parsers";
import type { UserStatus } from "../user.model";
import type {
  RequestUserStatusOptions,
  StatusFetchOutcome,
  ZulipGetUserStatusResponse,
  ZulipUpdateOwnStatusResponse,
} from "./user.api.types";

export type {
  RequestUserStatusOptions,
  UserStatusRequestPriority,
  UserStatusRequestReason,
} from "./user.api.types";

export interface UpdateOwnStatusParams {
  // Текст статуса (например "На встрече").
  text: string;
  // Emoji-имя (например "calendar").
  emojiName?: string;
  // away=true: пользователь помечен как "отошел".
  away?: boolean;
}

const log = createLogger("user:api");

// Отправляем presence: active/idle.
// pingOnly=true: только keep-alive без явной смены статуса активности.
export async function reportPresence(status: "active" | "idle", pingOnly = false): Promise<void> {
  const instance = getCurrentInstance();
  if (!instance?.realm || !instance.email || !instance.apiKey) {
    return;
  }

  try {
    refreshZulipApiBase();
    refreshWorkspaceApiBase();
    await zulipApi.post("/users/me/presence", {
      status: pingOnly ? "idle" : status,
      client: "workspace-web",
      ...(pingOnly ? { ping_only: "true" } : {}),
    });
  } catch (err) {
    log.warn("Failed to report presence", { status, error: String(err) });
  }
}

// Низкоуровневый GET /users/{id}/status с классификацией ошибок.
async function fetchUserStatusDetailed(userId: number): Promise<StatusFetchOutcome> {
  const instance = getCurrentInstance();
  if (!instance?.realm || !instance.email || !instance.apiKey) {
    return { kind: "transient_error", status: null };
  }

  try {
    refreshZulipApiBase();
    refreshWorkspaceApiBase();
    const response = await zulipApi.get(`/users/${userId}/status`);
    const data = (response.data ?? {}) as ZulipGetUserStatusResponse;

    if (!response.ok) {
      if (response.status === 400 || isBadRequestError(data)) {
        log.warn("User status rejected as invalid user", { userId, status: response.status });
        return { kind: "invalid_user", status: null };
      }
      log.warn("User status request failed", { userId, status: response.status });
      return { kind: "transient_error", status: null };
    }

    if (data.result === "error") {
      if (isBadRequestError(data)) {
        return { kind: "invalid_user", status: null };
      }
      log.warn("User status payload returned error", { userId, code: data.code ?? "unknown" });
      return { kind: "transient_error", status: null };
    }

    // Строгий контракт: статус должен приходить внутри поля "status".
    if (!("status" in data)) {
      log.warn("User status payload has unexpected shape", { userId });
      return { kind: "transient_error", status: null };
    }

    return {
      kind: "ok",
      status: normalizeGetUserStatusPayload(data.status),
    };
  } catch (err) {
    log.warn("Failed to fetch user status", { userId, error: String(err) });
    return { kind: "transient_error", status: null };
  }
}

// Прямой метод чтения статуса пользователя (без записи в store).
export async function fetchUserStatus(userId: number): Promise<UserStatus | null> {
  const outcome = await fetchUserStatusDetailed(userId);
  return outcome.kind === "ok" ? outcome.status : null;
}

// Обновляем собственный custom status через POST /users/me/status.
export async function updateOwnStatus(params: UpdateOwnStatusParams): Promise<UserStatus | null> {
  const instance = getCurrentInstance();
  if (!instance?.realm || !instance.email || !instance.apiKey) {
    return null;
  }

  const text = params.text.trim();
  const emojiName = params.emojiName?.trim() ?? "";
  const away = params.away === true;

  try {
    refreshZulipApiBase();
    refreshWorkspaceApiBase();
    const payload: Record<string, string> = {
      status_text: text,
      status_emoji: emojiName,
      emoji_name: emojiName,
      away: String(away),
    };
    const response = await zulipApi.post("/users/me/status", payload);
    const normalized = normalizeOwnStatusResponse(
      (response.data ?? {}) as ZulipUpdateOwnStatusResponse,
    );

    if (normalized != null) {
      return normalized;
    }

    // Если сервер ничего полезного не вернул, используем локально известные данные.
    if (!text && !emojiName && !away) {
      return null;
    }
    return {
      text,
      emojiName: emojiName || undefined,
      away,
    };
  } catch (err) {
    log.warn("Failed to update own status", { error: String(err) });
    return null;
  }
}

// Централизованный вход для fallback-загрузки статуса в store.
export async function requestUserStatus(
  userId: number,
  options?: RequestUserStatusOptions,
): Promise<void> {
  await requestUserStatusWithPolicy(userId, options, fetchUserStatusDetailed);
}

// Совместимость со старым именем API.
export async function ensureUserStatusLoaded(
  userId: number,
  options?: RequestUserStatusOptions,
): Promise<void> {
  await requestUserStatus(userId, { ...options, reason: options?.reason ?? "compat" });
}
