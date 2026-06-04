import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import type { ChatMessagesLoadErrorKind } from "./chat-page-message-list-section.types";

/** Maps store initialLoadError to UI error kind after loadInitial resolves without throwing. */
export function resolveMessagesLoadErrorAfterInitialLoad(
  cacheHydratedBeforeApi: boolean,
): ChatMessagesLoadErrorKind | null {
  const storeError = useCurrentChatMessagesStore.getState().initialLoadError;
  if (storeError == null) {
    return null;
  }
  const hadCachedMessages = useCurrentChatMessagesStore.getState().messages.length > 0;
  return cacheHydratedBeforeApi && hadCachedMessages ? "refresh" : "initial";
}
