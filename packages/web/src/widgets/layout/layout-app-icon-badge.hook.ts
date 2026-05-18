import { useEffect, useMemo } from "react";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { getElectronAPI } from "~/shared/lib/electron";
import { syncFaviconWithUnreadIndicator } from "~/shared/lib/organization-branding";
import { osIntegration } from "~/shared/lib/os-integration";
import { hasPersonalDmUnreadAcrossInstances } from "./layout-instance-unread.lib";

export function useLayoutAppIconBadge(options: {
  dmUnreadCountsByInstance: Record<string, number>;
  currentInstanceId: string | null;
  currentInstanceDmUnread: number;
}): void {
  const { dmUnreadCountsByInstance, currentInstanceId, currentInstanceDmUnread } = options;
  const instances = useInstancesStore((s) => s.instances);

  const hasPersonalDmUnread = useMemo(
    () =>
      hasPersonalDmUnreadAcrossInstances({
        instances,
        currentInstanceId,
        currentInstanceDmUnread,
        dmUnreadCountsByInstance,
      }),
    [instances, dmUnreadCountsByInstance, currentInstanceId, currentInstanceDmUnread],
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
