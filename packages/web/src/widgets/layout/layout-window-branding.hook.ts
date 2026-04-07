import { useEffect } from "react";
import { brand } from "~/shared/lib/brand";
import { getElectronAPI } from "~/shared/lib/electron";
import { syncOrganizationFavicon } from "~/shared/lib/organization-branding";
import { formatWebWindowTitleWithUnreadCount } from "./layout-instance-unread.lib";

export function useLayoutWindowBranding(options: {
  unreadCount: number;
  activeChatWindowTitle: string | null;
  realmIcon?: string;
}): void {
  const { unreadCount, activeChatWindowTitle, realmIcon } = options;

  useEffect(() => {
    if (getElectronAPI() != null) return;
    document.title = formatWebWindowTitleWithUnreadCount(
      unreadCount,
      brand.appName,
      activeChatWindowTitle ?? "",
    );
  }, [unreadCount, activeChatWindowTitle]);

  useEffect(() => {
    if (getElectronAPI() != null) return;
    return syncOrganizationFavicon(realmIcon);
  }, [realmIcon]);
}

