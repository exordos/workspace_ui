/**
 * Triggers lazy per-channel topic hydrate when a stream row expands or enters the sidebar viewport.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  isStreamSidebarTopicsHydrateInFlight,
  requestStreamSidebarTopicsHydrate,
} from "~/entities/chat-list/chat-list-hydrate-stream-sidebar.lib";
import { useIntersectedOnce } from "~/shared/lib/intersected-once.hook";

const SIDEBAR_SCROLL_ROOT_SELECTOR = "[data-sidebar-scroll]";

export interface UseStreamSidebarTopicsHydrateOptions {
  streamId: number;
  topicsCount: number;
  expanded: boolean;
}

export function useStreamSidebarTopicsHydrate({
  streamId,
  topicsCount,
  expanded,
}: UseStreamSidebarTopicsHydrateOptions): {
  rowRef: RefObject<HTMLDivElement | null>;
  topicsLoading: boolean;
} {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const visible = useIntersectedOnce(rowRef, { rootSelector: SIDEBAR_SCROLL_ROOT_SELECTOR });

  useEffect(() => {
    if (topicsCount > 0) {
      setTopicsLoading(false);
      return;
    }
    const shouldHydrate = expanded || visible;
    if (!shouldHydrate) {
      setTopicsLoading(false);
      return;
    }

    const reason = expanded ? "expand" : "visible";
    setTopicsLoading(true);
    void requestStreamSidebarTopicsHydrate(streamId, reason).finally(() => {
      setTopicsLoading(false);
    });
  }, [expanded, visible, streamId, topicsCount]);

  const loading =
    topicsLoading || (topicsCount === 0 && isStreamSidebarTopicsHydrateInFlight(streamId));

  return { rowRef, topicsLoading: loading };
}
