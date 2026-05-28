/**
 * Triggers lazy per-channel topic hydrate when a stream row expands or enters the sidebar viewport.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  isStreamSidebarTopicsHydrateInFlight,
  requestStreamSidebarTopicListHydrate,
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
    const shouldHydrateFromMessages = (expanded || visible) && topicsCount === 0;
    const shouldHydrateTopicList = expanded;

    if (!shouldHydrateFromMessages && !shouldHydrateTopicList) {
      setTopicsLoading(false);
      return;
    }

    setTopicsLoading(true);

    // Always ensure we fetched the topic list when user expands a stream.
    // This fixes cases where some topics exist (from messages) but not the full list.
    const listPromise = shouldHydrateTopicList
      ? requestStreamSidebarTopicListHydrate(streamId)
      : Promise.resolve();

    const messagePromise = shouldHydrateFromMessages
      ? requestStreamSidebarTopicsHydrate(streamId, expanded ? "expand" : "visible")
      : Promise.resolve();

    void Promise.all([listPromise.catch(() => {}), messagePromise.catch(() => {})]).finally(() => {
      setTopicsLoading(false);
    });
  }, [expanded, visible, streamId, topicsCount]);

  const loading =
    topicsLoading || (topicsCount === 0 && isStreamSidebarTopicsHydrateInFlight(streamId));

  return { rowRef, topicsLoading: loading };
}
