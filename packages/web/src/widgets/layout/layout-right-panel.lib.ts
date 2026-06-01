import { formatLastSeen } from "~/shared/lib/format";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import type { RightPanelCommonGroup, RightPanelPresenceLike } from "./layout-right-panel.types";

export type { RightPanelCommonGroup };

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

export function buildRightPanelCommonGroups(
  dms: Extract<SidebarChat, { type: "dm" }>[],
  partnerUserId: number,
  currentDmSlug?: string,
  maxItems = 6,
): RightPanelCommonGroup[] {
  return dms
    .filter((dm) => dm.isGroup && dm.slug !== currentDmSlug && dm.userIds?.includes(partnerUserId))
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
    .slice(0, maxItems)
    .map((dm) => ({
      name: dm.name,
      lastMessage: dm.lastMessage,
      unread: dm.badge,
      slug: dm.slug,
    }));
}

export function formatRightPanelLastSeen(
  presence: RightPanelPresenceLike | undefined,
): string | undefined {
  if (presence == null) return undefined;
  return formatLastSeen(presence.timestamp, presence.status);
}

export { buildRightPanelUserInfo } from "./layout-right-panel-user-info.lib";
