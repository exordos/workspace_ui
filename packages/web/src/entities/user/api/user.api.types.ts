// Файл с типами для user API.
// Здесь только контракты ответов и типы для оркестратора статусов.

import type { UserStatus } from "../user.model";

// Базовая обертка ответов Zulip: успех/ошибка.
export interface ZulipApiResultEnvelope {
  result?: "success" | "error";
  msg?: string;
  code?: string;
}

// Поля emoji из ответа обновления статуса.
export interface ZulipStatusEmojiDisplayInfo {
  emoji_name?: string;
  emoji_code?: string;
  reaction_type?: string;
}

// Строгий payload для GET /users/{id}/status.
export interface ZulipGetUserStatusPayload {
  status_text?: string;
  emoji_name?: string;
  emoji_code?: string;
  reaction_type?: string;
  away?: boolean;
}

// Строгий ответ для GET /users/{id}/status.
export interface ZulipGetUserStatusResponse extends ZulipApiResultEnvelope {
  status?: ZulipGetUserStatusPayload | null;
}

// Ответ для POST /users/me/status.
export interface ZulipUpdateOwnStatusResponse extends ZulipApiResultEnvelope {
  status_text?: string;
  status_emoji?: string;
  away?: boolean;
  status_emoji_display_info?: ZulipStatusEmojiDisplayInfo | ZulipStatusEmojiDisplayInfo[] | null;
}

// Результат низкоуровневой загрузки статуса.
export type StatusFetchOutcome =
  | { kind: "ok"; status: UserStatus | null }
  | { kind: "invalid_user"; status: null }
  | { kind: "transient_error"; status: null };

export type UserStatusRequestReason =
  | "bootstrap"
  | "dm_header"
  | "right_panel"
  | "top_bar"
  | "compat";

export type UserStatusRequestPriority = "high" | "low";

export interface RequestUserStatusOptions {
  // force=true игнорирует TTL/backoff и запускает запрос сразу.
  force?: boolean;
  // reason нужен для диагностики источника запроса.
  reason?: UserStatusRequestReason;
  // priority управляет порядком в очереди.
  priority?: UserStatusRequestPriority;
}

// Подпись функции, которая реально ходит в сеть за статусом.
export type FetchUserStatusDetailed = (userId: number) => Promise<StatusFetchOutcome>;
