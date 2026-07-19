/** How many topics to show in the sidebar before the "Show more" button. */
export const SIDEBAR_COLLAPSED_TOPIC_LIMIT = 3;

interface SidebarCollapsibleTopic {
  isDone?: boolean;
}

/** Keep active topics ahead of completed topics while preserving each group's source order. */
export function orderSidebarTopicsByCompletion<T extends SidebarCollapsibleTopic>(
  topics: readonly T[],
): T[] {
  const activeTopics: T[] = [];
  const doneTopics: T[] = [];

  for (const topic of topics) {
    if (topic.isDone === true) {
      doneTopics.push(topic);
    } else {
      activeTopics.push(topic);
    }
  }

  return [...activeTopics, ...doneTopics];
}

export function getSidebarCollapsedVisibleTopicCount<T extends SidebarCollapsibleTopic>(
  topics: readonly T[],
): number {
  const activeTopicCount = topics.reduce(
    (count, topic) => count + (topic.isDone === true ? 0 : 1),
    0,
  );
  return Math.min(activeTopicCount, SIDEBAR_COLLAPSED_TOPIC_LIMIT);
}

/** How many topics are hidden while the list is collapsed. */
export function getSidebarHiddenTopicCount<T extends SidebarCollapsibleTopic>(
  topics: readonly T[],
): number {
  return topics.length - getSidebarCollapsedVisibleTopicCount(topics);
}
