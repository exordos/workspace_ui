const CREATE_CHAT_TABS = ["dm", "group", "channel"] as const;
export type CreateChatTab = (typeof CREATE_CHAT_TABS)[number];

export function getCreateChatTabs(): readonly CreateChatTab[] {
  return CREATE_CHAT_TABS;
}

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
}): CreateChatTab | null {
  const { key, currentTab } = options;
  const currentTabIndex = CREATE_CHAT_TABS.indexOf(currentTab);
  if (currentTabIndex < 0) return null;

  if (key === "ArrowRight") {
    return CREATE_CHAT_TABS[(currentTabIndex + 1) % CREATE_CHAT_TABS.length] ?? null;
  }
  if (key === "ArrowLeft") {
    return (
      CREATE_CHAT_TABS[
        (currentTabIndex - 1 + CREATE_CHAT_TABS.length) % CREATE_CHAT_TABS.length
      ] ?? null
    );
  }
  if (key === "Home") {
    return CREATE_CHAT_TABS[0] ?? null;
  }
  if (key === "End") {
    return CREATE_CHAT_TABS[CREATE_CHAT_TABS.length - 1] ?? null;
  }
  return null;
}

