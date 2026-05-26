/**
 * Parses Zulip `GET /users/me` payloads into a normalized current-user record.
 */
import type { ZulipCurrentUser } from "./zulip.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsePositiveUserId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return null;
}

/** Accepts flat and nested (`user`) Zulip `/users/me` JSON bodies. */
export function parseCurrentUserFromApiData(data: unknown): ZulipCurrentUser | null {
  if (!isRecord(data)) {
    return null;
  }
  if (data.result === "error") {
    return null;
  }

  let userId = parsePositiveUserId(data.user_id);
  let fullName = typeof data.full_name === "string" ? data.full_name : "";
  let email = typeof data.email === "string" ? data.email : "";

  if (userId == null && isRecord(data.user)) {
    userId = parsePositiveUserId(data.user.user_id);
    if (typeof data.user.full_name === "string") {
      fullName = data.user.full_name;
    }
    if (typeof data.user.email === "string") {
      email = data.user.email;
    }
  }

  if (userId == null) {
    return null;
  }

  return {
    user_id: userId,
    full_name: fullName,
    email,
  };
}
