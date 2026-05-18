import { useEffect, useMemo } from "react";
import { getElectronAPI } from "~/shared/lib/electron";
import { syncFaviconWithUnreadIndicator } from "~/shared/lib/organization-branding";
import { osIntegration } from "~/shared/lib/os-integration";
import { hasPersonalDmUnreadForActiveInstance } from "./layout-instance-unread.lib";

export function useLayoutAppIconBadge(options: { currentInstanceDmUnread: number }): void {
  const { currentInstanceDmUnread } = options;

  const hasPersonalDmUnread = useMemo(
    () => hasPersonalDmUnreadForActiveInstance(currentInstanceDmUnread),
    [currentInstanceDmUnread],
  );

  useEffect(() => {
    osIntegration.setBadgeCount(hasPersonalDmUnread ? 1 : 0);
    return () => {
      osIntegration.setBadgeCount(0);
    };
  }, [hasPersonalDmUnread]);

  useEffect(() => {
    if (getElectronAPI() != null) return;
    return syncFaviconWithUnreadIndicator({ hasUnread: hasPersonalDmUnread });
  }, [hasPersonalDmUnread]);
}
