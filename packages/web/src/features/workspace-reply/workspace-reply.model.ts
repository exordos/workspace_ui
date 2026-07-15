import type {
  WorkspaceReplyQuote,
  WorkspaceReplySession,
  WorkspaceReplyTab,
  WorkspaceReplyTabIdentity,
} from "./workspace-reply.types";

export const EMPTY_WORKSPACE_REPLY_SESSION: WorkspaceReplySession = {
  tabs: [],
  activeTabId: null,
};

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized == null || normalized.length === 0 ? undefined : normalized;
}

export function normalizeWorkspaceReplyQuote(
  quote: WorkspaceReplyQuote,
): WorkspaceReplyQuote | null {
  const messageUuid = quote.messageUuid.trim();
  const senderUuid = quote.senderUuid.trim();
  const senderName = quote.senderName.trim();

  if (messageUuid.length === 0 || senderUuid.length === 0 || senderName.length === 0) {
    return null;
  }

  return {
    messageUuid,
    senderUuid,
    senderName,
    quotedContent: quote.quotedContent.replace(/\r\n?/g, "\n"),
    selectedText: normalizeOptionalText(quote.selectedText),
  };
}

export function createWorkspaceReplyTab(
  quote: WorkspaceReplyQuote,
  identity: WorkspaceReplyTabIdentity,
): WorkspaceReplyTab | null {
  const normalizedQuote = normalizeWorkspaceReplyQuote(quote);
  const id = identity.id.trim();
  const createdAt = identity.createdAt.trim();

  if (normalizedQuote == null || id.length === 0 || createdAt.length === 0) {
    return null;
  }

  return {
    ...normalizedQuote,
    id,
    createdAt,
    answer: "",
  };
}

function normalizeWorkspaceReplyTab(tab: WorkspaceReplyTab): WorkspaceReplyTab | null {
  const normalizedQuote = normalizeWorkspaceReplyQuote(tab);
  const id = tab.id.trim();
  const createdAt = tab.createdAt.trim();

  if (normalizedQuote == null || id.length === 0 || createdAt.length === 0) return null;

  return {
    ...normalizedQuote,
    id,
    createdAt,
    answer: tab.answer,
  };
}

export function normalizeWorkspaceReplySession(
  session: WorkspaceReplySession,
): WorkspaceReplySession {
  const normalizedTabs: WorkspaceReplyTab[] = [];
  const seenTabIds = new Set<string>();

  for (const tab of session.tabs) {
    const normalizedTab = normalizeWorkspaceReplyTab(tab);
    if (normalizedTab == null || seenTabIds.has(normalizedTab.id)) continue;
    seenTabIds.add(normalizedTab.id);
    normalizedTabs.push(normalizedTab);
  }

  if (normalizedTabs.length === 0) return EMPTY_WORKSPACE_REPLY_SESSION;

  const activeTab = normalizedTabs.find((tab) => tab.id === session.activeTabId);
  return {
    tabs: normalizedTabs,
    activeTabId: activeTab?.id ?? normalizedTabs[0]?.id ?? null,
  };
}
