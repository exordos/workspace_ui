// Файл с парсерами ответов user API.
// Здесь только преобразование DTO -> доменная модель UserStatus.

import type { UserStatus, UserStatusReactionType } from "../user.model";
import type {
  ZulipApiResultEnvelope,
  ZulipGetUserStatusPayload,
  ZulipUpdateOwnStatusResponse,
} from "./user.api.types";

// Проверяем, что тип emoji поддерживается приложением.
function isReactionType(value: string | undefined): value is UserStatusReactionType {
  return value === "unicode_emoji" || value === "realm_emoji" || value === "zulip_extra_emoji";
}

// true, если сервер вернул BAD_REQUEST для невалидного пользователя.
export function isBadRequestError(data: ZulipApiResultEnvelope): boolean {
  return data.code === "BAD_REQUEST";
}

// Строгий парсер payload из GET /users/{id}/status.
export function normalizeGetUserStatusPayload(
  payload: ZulipGetUserStatusPayload | null | undefined,
): UserStatus | null {
  if (payload == null) {
    return null;
  }

  const text = typeof payload.status_text === "string" ? payload.status_text.trim() : "";
  const emojiName = typeof payload.emoji_name === "string" ? payload.emoji_name.trim() : "";
  const emojiCode = typeof payload.emoji_code === "string" ? payload.emoji_code : undefined;
  const reactionType = isReactionType(payload.reaction_type) ? payload.reaction_type : undefined;
  const away = payload.away === true;

  if (!text && !emojiName && !away) {
    return null;
  }

  return {
    text,
    emojiName: emojiName || undefined,
    emojiCode,
    reactionType,
    away,
  };
}

// Парсер ответа POST /users/me/status.
export function normalizeOwnStatusResponse(data: ZulipUpdateOwnStatusResponse): UserStatus | null {
  if (data.result === "error") {
    return null;
  }

  const text = typeof data.status_text === "string" ? data.status_text.trim() : "";
  const emojiInfo = Array.isArray(data.status_emoji_display_info)
    ? data.status_emoji_display_info[0]
    : (data.status_emoji_display_info ?? undefined);
  const emojiName =
    typeof emojiInfo?.emoji_name === "string"
      ? emojiInfo.emoji_name
      : typeof data.status_emoji === "string"
        ? data.status_emoji
        : "";
  const emojiCode = typeof emojiInfo?.emoji_code === "string" ? emojiInfo.emoji_code : undefined;
  const reactionType = isReactionType(emojiInfo?.reaction_type)
    ? emojiInfo.reaction_type
    : undefined;
  const away = data.away === true;

  if (!text && !emojiName && !away) {
    return null;
  }

  return {
    text,
    emojiName: emojiName || undefined,
    emojiCode,
    reactionType,
    away,
  };
}
