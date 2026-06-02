import { useCallback, useEffect, useRef } from "react";
import { ensureMentionsUnreadSynced } from "~/entities/chat-list/chat-list-mentions-sync.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { createResilientInterval } from "~/shared/lib/visibility";

const DEFAULT_MENTIONS_SYNC_POLL_MS = 90_000;

export function useLayoutMentionsSyncPolling(options: {
  enabled: boolean;
  currentInstanceId: string | null;
  pollMs?: number;
}): void {
  const { enabled, currentInstanceId, pollMs = DEFAULT_MENTIONS_SYNC_POLL_MS } = options;
  const cancelledRef = useRef(false);

  const syncMentions = useCallback(() => {
    if (cancelledRef.current) return;
    const currentUserId = useChatListStore.getState().currentUserId ?? null;
    void ensureMentionsUnreadSynced({
      currentInstanceId,
      currentUserId,
      forceRefresh: true,
    });
  }, [currentInstanceId]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled || currentInstanceId == null) return;

    syncMentions();
    return createResilientInterval(syncMentions, pollMs);
  }, [enabled, currentInstanceId, pollMs, syncMentions]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);
}
