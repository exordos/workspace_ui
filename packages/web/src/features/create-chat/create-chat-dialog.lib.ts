export const CREATE_CHAT_TABS = ["dm", "channels", "channel", "topic", "archived"] as const;
export type CreateChatTab = (typeof CREATE_CHAT_TABS)[number];

export function resolveNextTabFromKey(options: {
  key: string;
  currentTab: CreateChatTab;
  tabs?: readonly CreateChatTab[];
}): CreateChatTab | null {
  const { key, currentTab, tabs = CREATE_CHAT_TABS } = options;
  const currentTabIndex = tabs.indexOf(currentTab);
  if (currentTabIndex < 0) return null;

  if (key === "ArrowRight") {
    return tabs[(currentTabIndex + 1) % tabs.length] ?? null;
  }
  if (key === "ArrowLeft") {
    return tabs[(currentTabIndex - 1 + tabs.length) % tabs.length] ?? null;
  }
  if (key === "Home") {
    return tabs[0] ?? null;
  }
  if (key === "End") {
    return tabs[tabs.length - 1] ?? null;
  }
  return null;
}
