/**
 * Date/time and presence formatting utilities.
 *
 * Presence logic: a user is considered "online" if their aggregated timestamp
 * is within PRESENCE_ONLINE_THRESHOLD_SEC (2 min) and status is "active".
 *
 * Usage:
 *   import { formatMessageTime, formatLastSeen, isPresenceOnline } from "~/shared/lib/format";
 */
import { t } from "~/i18n/i18n";
import { formatMessageTimeShort } from "~/shared/lib/datetime.lib";

/** @deprecated Prefer `formatMessageTimeShort` from `~/shared/lib/datetime.lib`. */
export function formatMessageTime(timestamp: number): string {
  return formatMessageTimeShort(timestamp);
}

export { formatMessageTimeShort } from "~/shared/lib/datetime.lib";

const PRESENCE_ONLINE_THRESHOLD_SEC = 2 * 60;
const PRESENCE_IDLE_THRESHOLD_SEC = 10 * 60;

/** Formats a "last seen" string from presence timestamp and status. */
export function formatLastSeen(timestamp: number, status?: "active" | "idle"): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
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
export function isPresenceOnline(timestamp: number, status?: "active" | "idle"): boolean {
  const now = Math.floor(Date.now() / 1000);
  return status === "active" && now - timestamp <= PRESENCE_ONLINE_THRESHOLD_SEC;
}

/**
 * Returns the presence indicator state for UI rendering.
 *
 * - "active"  — online, interacting right now (green dot)
 * - "idle"    — connected but away (yellow dot)
 * - "offline" — not seen for > IDLE_THRESHOLD (gray dot)
 * - null      — no presence data
 */
export function getPresenceState(
  timestamp: number,
  status?: "active" | "idle",
): "active" | "idle" | "offline" | null {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (status === "active" && diff <= PRESENCE_ONLINE_THRESHOLD_SEC) return "active";
  if (diff <= PRESENCE_IDLE_THRESHOLD_SEC) return "idle";
  return "offline";
}

/** Returns Tailwind classes for a sidebar row (active vs hover). */
export function sidebarRowClass(isActive: boolean): string {
  return isActive ? "bg-sidebar-hover" : "hover:bg-sidebar-hover";
}
