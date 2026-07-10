import { isLegacyMessengerPathname } from "~/shared/lib/workspace-messenger-route.lib";

export function sanitizeInternalRedirectTarget(
  rawTarget: string | null | undefined,
): string | null {
  const trimmed = rawTarget?.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }
  if (isLegacyMessengerPathname(trimmed)) {
    return null;
  }

  return trimmed;
}
