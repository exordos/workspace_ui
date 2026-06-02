import { useEffect, useMemo } from "react";
import { getElectronAPI } from "~/shared/lib/electron";
import { syncFaviconWithUnreadIndicator } from "~/shared/lib/organization-branding";
import { osIntegration } from "~/shared/lib/os-integration";
import { hasPersonalUnreadIndicator } from "./layout-instance-unread.lib";

export function useLayoutAppIconBadge(options: {
  personalDmUnread: number;
  mentionsUnread: number;
}): void {
  const { personalDmUnread, mentionsUnread } = options;

  const hasPersonalUnread = useMemo(
    () => hasPersonalUnreadIndicator(personalDmUnread, mentionsUnread),
    [personalDmUnread, mentionsUnread],
  );

  useEffect(() => {
    osIntegration.setBadgeCount(hasPersonalUnread ? 1 : 0);
    return () => {
      osIntegration.setBadgeCount(0);
    };
  }, [hasPersonalUnread]);

  useEffect(() => {
    if (getElectronAPI() != null) return;
    return syncFaviconWithUnreadIndicator({ hasUnread: hasPersonalUnread });
  }, [hasPersonalUnread]);
}
