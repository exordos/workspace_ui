/**
 * Presence and sidebar row formatting utilities.
 *
 * Usage:
 *   import { formatLastSeen, getPresenceState, sidebarRowClass } from "~/shared/lib/format";
 */
import { t } from "~/i18n/i18n";
import type { WorkspaceUserPresenceStatus } from "~/shared/api/messenger.types";

const PRESENCE_ONLINE_THRESHOLD_SEC = 2 * 60;
const PRESENCE_IDLE_THRESHOLD_SEC = 10 * 60;

/** Formats a "last seen" string from presence timestamp and status. */
export function formatLastSeen(timestamp: number, status?: WorkspaceUserPresenceStatus): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (status === "offline") {
    return t("presence.offline");
  }
  if (status === "do_not_disturb" && diff <= PRESENCE_ONLINE_THRESHOLD_SEC) {
    return t("presence.doNotDisturb");
  }
  if (status === "active" && diff <= PRESENCE_ONLINE_THRESHOLD_SEC) {
    return t("presence.online");
  }
  if (status === "idle" && diff <= PRESENCE_IDLE_THRESHOLD_SEC) {
    return t("presence.away");
  }
  if (diff < 60) return t("presence.justNow");
  if (diff < 3600) {
    const min = Math.floor(diff / 60);
    return t("presence.minutesAgo", { count: min });
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return t("presence.hoursAgo", { count: h });
  }
  const d = Math.floor(diff / 86400);
  return t("presence.daysAgo", { count: d });
}

/** Returns true if the user is considered online based on presence data. */
export function isPresenceOnline(timestamp: number, status?: WorkspaceUserPresenceStatus): boolean {
  const now = Math.floor(Date.now() / 1000);
  return (
    (status === "active" || status === "do_not_disturb") &&
    now - timestamp <= PRESENCE_ONLINE_THRESHOLD_SEC
  );
}

/**
 * Returns the presence indicator state for UI rendering.
 *
 * - "active"  — online, interacting right now (green dot)
 * - "idle"    — connected but away (yellow dot)
 * - "do_not_disturb" — connected but suppressing interruptions (red dot)
 * - "offline" — not seen for > IDLE_THRESHOLD (gray dot)
 * - null      — no presence data
 */
export function getPresenceState(
  timestamp: number,
  status?: WorkspaceUserPresenceStatus,
): "active" | "idle" | "offline" | "do_not_disturb" | null {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (status === "offline") return "offline";
  if (status === "do_not_disturb" && diff <= PRESENCE_ONLINE_THRESHOLD_SEC) {
    return "do_not_disturb";
  }
  if (status === "active" && diff <= PRESENCE_ONLINE_THRESHOLD_SEC) return "active";
  if (diff <= PRESENCE_IDLE_THRESHOLD_SEC) return "idle";
  return "offline";
}

/** Returns Tailwind classes for a sidebar row (active vs hover). */
export function sidebarRowClass(isActive: boolean): string {
  return isActive ? "bg-sidebar-hover" : "hover:bg-sidebar-hover";
}
