import { useEffect } from "react";
import { brand } from "~/shared/lib/brand";
import { getElectronAPI } from "~/shared/lib/electron";
import { formatWebWindowTitleWithUnreadCount } from "./layout-instance-unread.lib";

export function useLayoutWindowBranding(options: {
  unreadCount: number;
  activeChatWindowTitle: string | null;
}): void {
  const { unreadCount, activeChatWindowTitle } = options;

  useEffect(() => {
    if (getElectronAPI() != null) return;
    document.title = formatWebWindowTitleWithUnreadCount(
      unreadCount,
      brand.appName,
      activeChatWindowTitle ?? "",
    );
  }, [unreadCount, activeChatWindowTitle]);
}
