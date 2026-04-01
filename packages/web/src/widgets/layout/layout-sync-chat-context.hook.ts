import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore, type CurrentChatContext } from "~/entities/message/message.model";
import { parseChatContextFromPathname } from "./layout-sync-chat-context.lib";

function isSameContext(a: CurrentChatContext | null, b: CurrentChatContext | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.type !== b.type) return false;
  if (a.type === "dm") return a.dmKey === (b as Extract<CurrentChatContext, { type: "dm" }>).dmKey;
  const bs = b as Extract<CurrentChatContext, { type: "stream" }>;
  return a.streamId === bs.streamId && a.topic === bs.topic;
}

export function useSyncChatContextFromLocation(): void {
  const location = useLocation();
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const storeContext = useCurrentChatMessagesStore((s) => s.context);

  useEffect(() => {
    const next = parseChatContextFromPathname({
      pathname: location.pathname,
      streamsMap,
      currentUserId,
    });
    if (isSameContext(storeContext, next)) return;
    useCurrentChatMessagesStore.getState().setContextFromNavigation(next);
  }, [location.pathname, streamsMap, currentUserId, storeContext]);
}
