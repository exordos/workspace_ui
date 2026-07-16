import { useEffect } from "react";
import { requestStreamSidebarTopicListHydrate } from "~/entities/chat-list/chat-list-hydrate-stream-sidebar.lib";

/** Ensures direct stream/topic routes resolve canonical topic labels without sidebar interaction. */
export function useChatPageRouteMetadataHydrate(activeStreamId: string | null): void {
  useEffect(() => {
    if (activeStreamId == null) return;
    void requestStreamSidebarTopicListHydrate(activeStreamId);
  }, [activeStreamId]);
}
