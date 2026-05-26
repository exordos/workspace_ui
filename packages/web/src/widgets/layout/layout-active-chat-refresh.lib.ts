import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("layout-reconnect");

export interface RefreshActiveChatMessagesOptions {
  focusedMessageId?: number | null;
  isCancelled?: () => boolean;
}

/**
 * Re-fetches the open chat from the API (cache-first + network refresh).
 * Used after reconnect so the message list matches the server, not only append deltas.
 */
export function refreshActiveChatMessagesFromApi(options?: RefreshActiveChatMessagesOptions): void {
  const { context, loadInitialMessagesForContext } = useCurrentChatMessagesStore.getState();
  if (context == null) {
    return;
  }

  const currentUserId = useChatListStore.getState().currentUserId ?? null;
  const focusedMessageId = options?.focusedMessageId ?? null;

  void loadInitialMessagesForContext({
    context,
    focusedMessageId,
    currentUserId,
  })
    .then(() => {
      if (options?.isCancelled?.()) return;
    })
    .catch((error: unknown) => {
      if (options?.isCancelled?.()) return;
      log.warn("reconnect: active chat refresh failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
