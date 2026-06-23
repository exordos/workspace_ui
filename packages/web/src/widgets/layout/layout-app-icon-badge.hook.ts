import { useEffect } from "react";
import { getElectronAPI } from "~/shared/lib/electron";
import { syncFaviconWithUnreadIndicator } from "~/shared/lib/organization-branding";
import { osIntegration } from "~/shared/lib/os-integration";

export function useLayoutAppIconBadge(options: { personalUnreadCount: number }): void {
  const hasPersonalUnread = options.personalUnreadCount > 0;

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
