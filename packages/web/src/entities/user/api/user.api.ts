/**
 * Public user API facade for backend-only user data.
 *
 * The new backend user contract exposes account data through /api/messenger/v1/users/.
 * Separate presence and custom status endpoints are not part of this contract.
 */

import type { UserId, UserStatus, UserStatusReactionType } from "../user.model";
import type { OwnStatusMutationResult, RequestUserStatusOptions } from "./user.api.types";

export type {
  OwnStatusMutationResult,
  RequestUserStatusOptions,
  UserStatusRequestPriority,
  UserStatusRequestReason,
} from "./user.api.types";

export interface UpdateOwnStatusParams {
  text: string;
  emojiName?: string;
  emojiCode?: string;
  reactionType?: UserStatusReactionType;
  away?: boolean;
}

function normalizeSubmittedStatus(params: UpdateOwnStatusParams): UserStatus | null {
  const text = params.text.trim();
  const emojiName = params.emojiName?.trim() ?? "";
  const emojiCode = emojiName ? (params.emojiCode?.trim() ?? "") : "";
  const reactionType = emojiName ? params.reactionType : undefined;
  const away = params.away === true;

  if (!text && !emojiName && !away) {
    return null;
  }

  return {
    text,
    emojiName: emojiName || undefined,
    emojiCode: emojiCode || undefined,
    reactionType,
    away,
  };
}

/** The new backend has no presence mutation endpoint; keep local presence tracking client-side only. */
export async function reportPresence(_status: "active" | "idle", _pingOnly = false): Promise<void> {
  return;
}

/** The new backend has no per-user custom status payload endpoint. */
export async function fetchUserStatus(_userId: UserId): Promise<UserStatus | null> {
  return null;
}

/** The new backend has no own custom status payload endpoint. */
export async function fetchOwnStatus(): Promise<UserStatus | null> {
  return null;
}

/**
 * Custom status is not persisted through the backend.
 * Return a normalized local snapshot so existing UI can update without issuing a request.
 */
export async function updateOwnStatus(
  params: UpdateOwnStatusParams,
): Promise<OwnStatusMutationResult> {
  return { ok: true, status: normalizeSubmittedStatus(params) };
}

/** Status hydration is now driven by the users list/current-user payloads. */
export async function requestUserStatus(
  _userId: UserId,
  _options?: RequestUserStatusOptions,
): Promise<void> {
  return;
}

export async function ensureUserStatusLoaded(
  _userId: UserId,
  _options?: RequestUserStatusOptions,
): Promise<void> {
  return;
}
