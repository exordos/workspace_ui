import { useCallback, useMemo, useState } from "react";
import {
  getSidebarCollapsedVisibleTopicCount,
  getSidebarHiddenTopicCount,
  orderSidebarTopicsByCompletion,
} from "./sidebar-topic-collapse.lib";

/**
 * Local state for expanding the full channel topic list.
 * The component unmounts when the channel collapses, so state resets automatically.
 */
export function useSidebarTopicCollapse<T extends { isDone?: boolean }>(
  topics: readonly T[],
): {
  allTopicsVisible: boolean;
  hiddenCount: number;
  showToggle: boolean;
  visibleTopics: T[];
  toggleAllTopics: () => void;
} {
  const [allTopicsVisible, setAllTopicsVisible] = useState(false);

  const hiddenCount = getSidebarHiddenTopicCount(topics);
  const showToggle = hiddenCount > 0;
  const visibleCount = allTopicsVisible
    ? topics.length
    : getSidebarCollapsedVisibleTopicCount(topics);
  const visibleTopics = useMemo(
    () => orderSidebarTopicsByCompletion(topics).slice(0, visibleCount),
    [topics, visibleCount],
  );

  const toggleAllTopics = useCallback(() => {
    setAllTopicsVisible((prev) => !prev);
  }, []);

  return {
    allTopicsVisible,
    hiddenCount,
    showToggle,
    visibleTopics,
    toggleAllTopics,
  };
}
