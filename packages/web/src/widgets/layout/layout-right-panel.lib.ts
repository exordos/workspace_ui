import { formatLastSeen } from "~/shared/lib/format";
import type { RightPanelPresenceLike } from "./layout-right-panel.types";

export function formatRightPanelLocalTime(
  timezone: string | undefined,
  now: Date = new Date(),
): string | undefined {
  if (!timezone || timezone.trim() === "") return undefined;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(now);
  } catch {
    return undefined;
  }
}

export function formatRightPanelLastSeen(
  presence: RightPanelPresenceLike | undefined,
): string | undefined {
  if (presence == null) return undefined;
  return formatLastSeen(presence.timestamp, presence.status);
}

export { buildRightPanelUserInfo } from "./layout-right-panel-user-info.lib";
