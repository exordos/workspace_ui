/**
 * JWT access-token helpers for client-side identity routing.
 */
import { isIamUserUuid } from "~/shared/lib/user-id.lib";

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.trim().split(".");
  if (segments.length < 2) {
    return null;
  }
  const encoded = segments[1]!.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (encoded.length % 4)) % 4);
  try {
    const json = atob(encoded + padding);
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function resolveEmailFromAccessToken(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  const email = typeof payload?.email === "string" ? payload.email.trim() : "";
  return email.length > 0 ? email : null;
}

export function resolveUserUuidFromAccessToken(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  for (const key of ["sub", "user_uuid", "uuid", "user_id"]) {
    const candidate = payload?.[key];
    if (typeof candidate !== "string") {
      continue;
    }
    const normalized = candidate.trim().toLowerCase();
    if (isIamUserUuid(normalized)) {
      return normalized;
    }
  }
  return null;
}

export function resolveProjectUuidFromAccessToken(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  for (const key of ["project_id", "project_uuid"]) {
    const candidate = payload?.[key];
    if (typeof candidate !== "string") continue;
    const normalized = candidate.trim().toLowerCase();
    if (isIamUserUuid(normalized)) return normalized;
  }
  return null;
}
