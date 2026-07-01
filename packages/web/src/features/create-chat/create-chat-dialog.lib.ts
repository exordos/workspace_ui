export const CREATE_CHAT_TABS = [
  "dm",
  "group",
  "channels",
  "channel",
  "topic",
  "archived",
] as const;
export type CreateChatTab = (typeof CREATE_CHAT_TABS)[number];
export const LEGACY_CREATE_CHAT_TABS: CreateChatTab[] = [
  "dm",
  "group",
  "channels",
  "channel",
  "archived",
];
export const WORKSPACE_CREATE_CHAT_TABS: CreateChatTab[] = ["dm", "group", "channel", "topic"];

export function slugifyUserNameForDm(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function buildDmSlug(userId: number, fullName: string): string {
  return `${userId}-${slugifyUserNameForDm(fullName)}`;
}

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
