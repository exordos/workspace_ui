import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import {
  isStoreContextAlignedWithParsedRoute,
  parseChatContextFromPathname,
} from "./layout-sync-chat-context.lib";

export function useSyncChatContextFromLocation(): void {
  const location = useLocation();
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const currentUserId = useChatListStore((s) => s.currentUserId);

  useEffect(() => {
    const storeContext = useCurrentChatMessagesStore.getState().context;
    const parsed = parseChatContextFromPathname({
      pathname: location.pathname,
      streamsMap,
      currentUserId,
    });
    if (isStoreContextAlignedWithParsedRoute(storeContext, parsed)) return;
    useCurrentChatMessagesStore.getState().setContextFromNavigation(parsed.context);
  }, [location.pathname, streamsMap, currentUserId]);
}
