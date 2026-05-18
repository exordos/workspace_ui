import { useEffect, useMemo } from "react";
import { getElectronAPI } from "~/shared/lib/electron";
import { syncFaviconWithUnreadIndicator } from "~/shared/lib/organization-branding";
import { osIntegration } from "~/shared/lib/os-integration";
import { computeTotalUnreadAcrossInstances } from "./layout-instance-unread.lib";

export function useLayoutAppIconBadge(options: {
  unreadCountsByInstance: Record<string, number>;
  currentInstanceId: string | null;
  currentInstanceUnread: number;
  realmIcon?: string;
  realmBaseUrl?: string;
}): void {
  const {
    unreadCountsByInstance,
    currentInstanceId,
    currentInstanceUnread,
    realmIcon,
    realmBaseUrl,
  } = options;

  const totalUnread = useMemo(
    () =>
      computeTotalUnreadAcrossInstances(
        unreadCountsByInstance,
        currentInstanceId != null
          ? { instanceId: currentInstanceId, unreadCount: currentInstanceUnread }
          : null,
      ),
    [unreadCountsByInstance, currentInstanceId, currentInstanceUnread],
  );

  const hasUnread = totalUnread > 0;

  useEffect(() => {
    osIntegration.setBadgeCount(totalUnread);
  }, [totalUnread]);

  useEffect(() => {
    if (getElectronAPI() != null) return;
    return syncFaviconWithUnreadIndicator({ hasUnread, realmIcon, realmBaseUrl });
  }, [hasUnread, realmIcon, realmBaseUrl]);
}
