/** How many topics to show in the sidebar before the "Show more" button. */
export const SIDEBAR_COLLAPSED_TOPIC_LIMIT = 3;

export type SidebarTopicRevealLevel = "collapsed" | "unfinished" | "all";

export type SidebarTopicToggleAction = "showMore" | "showCompleted" | "collapse";

export interface SidebarTopicCollapseState {
  expanded: boolean;
  hiddenCount: number;
  toggleAction: SidebarTopicToggleAction | null;
  visibleCount: number;
}

/** Resolve the visible slice and the next available reveal action. */
export function resolveSidebarTopicCollapseState(
  totalTopics: number,
  unfinishedTopics: number,
  revealLevel: SidebarTopicRevealLevel,
): SidebarTopicCollapseState {
  const safeTotalTopics = Math.max(0, totalTopics);
  const safeUnfinishedTopics = Math.min(Math.max(0, unfinishedTopics), safeTotalTopics);
  const completedTopics = safeTotalTopics - safeUnfinishedTopics;
  const collapsedVisibleCount = Math.min(safeTotalTopics, SIDEBAR_COLLAPSED_TOPIC_LIMIT);

  if (revealLevel === "all") {
    return {
      expanded: safeTotalTopics > collapsedVisibleCount,
      hiddenCount: 0,
      toggleAction: safeTotalTopics > collapsedVisibleCount ? "collapse" : null,
      visibleCount: safeTotalTopics,
    };
  }

  if (revealLevel === "unfinished") {
    const visibleCount = Math.max(collapsedVisibleCount, safeUnfinishedTopics);
    const hiddenCompletedTopics = Math.max(
      0,
      completedTopics - (visibleCount - safeUnfinishedTopics),
    );
    let toggleAction: SidebarTopicToggleAction | null = null;
    if (hiddenCompletedTopics > 0) {
      toggleAction = "showCompleted";
    } else if (visibleCount > collapsedVisibleCount) {
      toggleAction = "collapse";
    }

    return {
      expanded: visibleCount > collapsedVisibleCount,
      hiddenCount: hiddenCompletedTopics,
      toggleAction,
      visibleCount,
    };
  }

  const hiddenUnfinishedTopics = Math.max(0, safeUnfinishedTopics - collapsedVisibleCount);
  const visibleCompletedTopics = Math.max(0, collapsedVisibleCount - safeUnfinishedTopics);
  const hiddenCompletedTopics = Math.max(0, completedTopics - visibleCompletedTopics);
  let toggleAction: SidebarTopicToggleAction | null = null;
  if (hiddenUnfinishedTopics > 0) {
    toggleAction = "showMore";
  } else if (hiddenCompletedTopics > 0) {
    toggleAction = "showCompleted";
  }

  return {
    expanded: false,
    hiddenCount: hiddenUnfinishedTopics > 0 ? hiddenUnfinishedTopics : hiddenCompletedTopics,
    toggleAction,
    visibleCount: collapsedVisibleCount,
  };
}
