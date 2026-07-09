import { useEffect } from "react";
import { brand } from "~/shared/lib/brand";
import { getElectronAPI } from "~/shared/lib/electron";

function formatWebWindowTitleWithUnreadCount(
  unreadCount: number,
  appName: string,
  activeChatWindowTitle = "",
): string {
  const safeUnreadCount = Number.isFinite(unreadCount) ? Math.floor(unreadCount) : 0;
  const prefix = safeUnreadCount > 0 ? `(${safeUnreadCount}) ` : "";
  const chatTitle = activeChatWindowTitle.trim();
  return chatTitle.length > 0 ? `${prefix}${chatTitle} - ${appName}` : `${prefix}${appName}`;
}

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
