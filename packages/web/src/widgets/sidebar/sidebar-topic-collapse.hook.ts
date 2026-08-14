import { useCallback, useMemo, useState } from "react";
import {
  resolveSidebarTopicCollapseState,
  type SidebarTopicRevealLevel,
  type SidebarTopicToggleAction,
} from "./sidebar-topic-collapse.lib";

/**
 * Local state for revealing unfinished topics before completed topics.
 * The component unmounts when the channel collapses, so state resets automatically.
 */
export function useSidebarTopicCollapse(topics: readonly { isDone: boolean }[]): {
  expanded: boolean;
  hiddenCount: number;
  toggleAction: SidebarTopicToggleAction | null;
  visibleCount: number;
  toggleTopics: () => void;
} {
  const [revealLevel, setRevealLevel] = useState<SidebarTopicRevealLevel>("collapsed");
  const unfinishedTopics = useMemo(
    () => topics.reduce((count, topic) => count + Number(!topic.isDone), 0),
    [topics],
  );
  const collapseState = resolveSidebarTopicCollapseState(
    topics.length,
    unfinishedTopics,
    revealLevel,
  );

  const toggleTopics = useCallback(() => {
    setRevealLevel((currentLevel) => {
      const currentState = resolveSidebarTopicCollapseState(
        topics.length,
        unfinishedTopics,
        currentLevel,
      );
      if (currentState.toggleAction === "showMore") return "unfinished";
      if (currentState.toggleAction === "showCompleted") return "all";
      if (currentState.toggleAction === "collapse") return "collapsed";
      return currentLevel;
    });
  }, [topics.length, unfinishedTopics]);

  return {
    expanded: collapseState.expanded,
    hiddenCount: collapseState.hiddenCount,
    toggleAction: collapseState.toggleAction,
    visibleCount: collapseState.visibleCount,
    toggleTopics,
  };
}
