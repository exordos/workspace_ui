/**
 * User API for presence and custom statuses.
 *
 * POST /users/me/presence  — Zulip presence endpoint.
 * The server uses this to build aggregated presence for all users.
 * GET /users/{user_id}/status and POST /users/me/status — custom status endpoints.
 */

import { getCurrentInstance, refreshZulipApiBase, zulipApi } from "~/shared/api/client";
import { createLogger } from "~/shared/lib/logger";
import { type UserStatusReactionType, useUsersStore, type UserStatus } from "./user.model";

interface ZulipStatusEmojiDisplayInfo {
  emoji_name?: string;
  emoji_code?: string;
  reaction_type?: string;
}

interface ZulipUserStatusResponse {
  status_text?: string;
  status_emoji?: string;
  status_emoji_display_info?: ZulipStatusEmojiDisplayInfo | ZulipStatusEmojiDisplayInfo[] | null;
  away?: boolean;
}

export interface UpdateOwnStatusParams {
  text: string;
  emojiName?: string;
  away?: boolean;
}

const log = createLogger("user:api");
const STATUS_CACHE_TTL_MS = 90_000;
const statusRequestCache = new Map<number, Promise<void>>();

function isReactionType(value: string | undefined): value is UserStatusReactionType {
  return value === "unicode_emoji" || value === "realm_emoji" || value === "zulip_extra_emoji";
}

function normalizeStatusResponse(data: ZulipUserStatusResponse): UserStatus | null {
  const text = typeof data.status_text === "string" ? data.status_text.trim() : "";
  const away = data.away === true;
  const rawEmojiName = typeof data.status_emoji === "string" ? data.status_emoji.trim() : "";
  const emojiInfo = Array.isArray(data.status_emoji_display_info)
    ? data.status_emoji_display_info[0]
    : (data.status_emoji_display_info ?? undefined);
  const emojiName =
    rawEmojiName || (typeof emojiInfo?.emoji_name === "string" ? emojiInfo.emoji_name : "");
  const emojiCode = typeof emojiInfo?.emoji_code === "string" ? emojiInfo.emoji_code : undefined;
  const reactionType = isReactionType(emojiInfo?.reaction_type)
    ? emojiInfo.reaction_type
    : undefined;
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

/**
 * Report presence to Zulip server.
 * @param status "active" or "idle"
 * @param pingOnly If true, just pings without changing status (keep-alive)
 */
export async function reportPresence(status: "active" | "idle", pingOnly = false): Promise<void> {
  const instance = getCurrentInstance();
  if (!instance?.realm || !instance.email || !instance.apiKey) {
    return;
  }

  try {
    refreshZulipApiBase();
    await zulipApi.post("/users/me/presence", {
      status: pingOnly ? "idle" : status,
      client: "workspace-web",
      ...(pingOnly ? { ping_only: "true" } : {}),
    });
  } catch (err) {
    log.warn("Failed to report presence", { status, error: String(err) });
  }
}

export async function fetchUserStatus(userId: number): Promise<UserStatus | null> {
  const instance = getCurrentInstance();
  if (!instance?.realm || !instance.email || !instance.apiKey) {
    return null;
  }

  try {
    refreshZulipApiBase();
    const response = await zulipApi.get(`/users/${userId}/status`);
    return normalizeStatusResponse((response.data ?? {}) as ZulipUserStatusResponse);
  } catch (err) {
    log.warn("Failed to fetch user status", { userId, error: String(err) });
    return null;
  }
}

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
    const payload: Record<string, string> = {
      status_text: text,
      status_emoji: emojiName,
      emoji_name: emojiName,
      away: String(away),
    };
    const response = await zulipApi.post("/users/me/status", payload);
    const normalized = normalizeStatusResponse((response.data ?? {}) as ZulipUserStatusResponse);
    if (normalized != null) {
      return normalized;
    }
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

export async function ensureUserStatusLoaded(
  userId: number,
  options?: { force?: boolean },
): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) {
    return;
  }
  const user = useUsersStore.getState().getUser(userId);
  if (!user) {
    return;
  }
  const now = Date.now();
  const force = options?.force === true;
  if (!force && user.statusFetchedAt != null && now - user.statusFetchedAt < STATUS_CACHE_TTL_MS) {
    return;
  }
  const inFlight = statusRequestCache.get(userId);
  if (inFlight) {
    await inFlight;
    return;
  }
  const promise = (async () => {
    const status = await fetchUserStatus(userId);
    useUsersStore.getState().setStatus(userId, status, Date.now());
  })();
  statusRequestCache.set(userId, promise);
  try {
    await promise;
  } finally {
    statusRequestCache.delete(userId);
  }
}
