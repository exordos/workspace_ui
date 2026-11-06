import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";

export const MESSAGE_APP_PREFERENCE_TTL = 30 * 24 * 60 * 60 * 1000;
const preferenceKey = (orgId: string) =>
  `workspace.message-open-preference.v1.${encodeURIComponent(orgId)}`;
type Preference = "desktop" | "browser";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readMessageOpenPreference(
  storage: PreferenceStorage,
  orgId: string,
  now = Date.now(),
): Preference {
  try {
    const raw: unknown = JSON.parse(storage.getItem(preferenceKey(orgId)) ?? "null");
    if (typeof raw !== "object" || raw == null) return "browser";
    const record = raw as Record<string, unknown>;
    return record.version === 1 &&
      record.preference === "desktop" &&
      typeof record.expiresAt === "number" &&
      Number.isFinite(record.expiresAt) &&
      record.expiresAt > now &&
      record.expiresAt <= now + MESSAGE_APP_PREFERENCE_TTL
      ? "desktop"
      : "browser";
  } catch {
    return "browser";
  }
}

export function writeMessageOpenPreference(
  storage: PreferenceStorage,
  orgId: string,
  preference: Preference,
  now = Date.now(),
): void {
  try {
    storage.setItem(
      preferenceKey(orgId),
      JSON.stringify({ version: 1, preference, expiresAt: now + MESSAGE_APP_PREFERENCE_TTL }),
    );
  } catch {
    // Opening in the browser remains available when preferences cannot be saved.
  }
}

export function resolveMessageEntrySession(
  sessions: WorkspaceAuthSession[],
  pathname: string,
  currentAccountId: string | null = null,
): WorkspaceAuthSession | null {
  const route = parseWorkspaceMessengerRoute(pathname);
  if (route?.kind !== "message") return null;
  const candidates = sessions.filter(
    (session) => session.organizationId === route.orgId && session.projectId === route.projectId,
  );
  return (
    candidates.find((session) => session.accountId === currentAccountId) ?? candidates[0] ?? null
  );
}

/** Desktop protocol actions are unavailable in mobile browsers, including iPad desktop mode. */
export function isMessageEntryMobileBrowser(
  nav: Pick<Navigator, "userAgent" | "maxTouchPoints">,
): boolean {
  return (
    /Android|iPhone|iPad|iPod/i.test(nav.userAgent) ||
    (/Macintosh/i.test(nav.userAgent) && nav.maxTouchPoints > 1)
  );
}
