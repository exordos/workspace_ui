import {
  buildWorkspaceQuoteBlock,
  buildWorkspaceQuoteHeader,
} from "~/shared/lib/workspace-message-quote.lib";
import {
  createWorkspaceReplyTab,
  EMPTY_WORKSPACE_REPLY_SESSION,
  normalizeWorkspaceReplyQuote,
  normalizeWorkspaceReplySession,
} from "./workspace-reply.model";
import type {
  WorkspaceReplyQuote,
  WorkspaceReplySession,
  WorkspaceReplyTab,
  WorkspaceReplyTabIdentity,
} from "./workspace-reply.types";

function activeTabIndex(session: WorkspaceReplySession): number {
  return session.tabs.findIndex((tab) => tab.id === session.activeTabId);
}

function withActiveTab(session: WorkspaceReplySession, tabId: string): WorkspaceReplySession {
  if (!session.tabs.some((tab) => tab.id === tabId)) return session;
  return { ...session, activeTabId: tabId };
}

export function replyToWorkspaceReply(
  session: WorkspaceReplySession,
  quote: WorkspaceReplyQuote,
  identity: WorkspaceReplyTabIdentity,
): WorkspaceReplySession {
  const normalizedSession = normalizeWorkspaceReplySession(session);
  const normalizedQuote = normalizeWorkspaceReplyQuote(quote);
  if (normalizedQuote == null) return normalizedSession;

  const activeIndex = activeTabIndex(normalizedSession);
  if (activeIndex < 0) {
    const firstTab = createWorkspaceReplyTab(normalizedQuote, identity);
    return firstTab == null
      ? EMPTY_WORKSPACE_REPLY_SESSION
      : { tabs: [firstTab], activeTabId: firstTab.id };
  }

  const activeTab = normalizedSession.tabs[activeIndex];
  if (activeTab == null) return normalizedSession;

  const replacedTab: WorkspaceReplyTab = {
    ...activeTab,
    ...normalizedQuote,
  };
  const nextTabs = normalizedSession.tabs.map((tab, index) =>
    index === activeIndex ? replacedTab : tab,
  );

  return normalizeWorkspaceReplySession({
    tabs: nextTabs,
    activeTabId: replacedTab.id,
  });
}

export function addWorkspaceReplyTab(
  session: WorkspaceReplySession,
  quote: WorkspaceReplyQuote,
  identity: WorkspaceReplyTabIdentity,
): WorkspaceReplySession {
  const normalizedSession = normalizeWorkspaceReplySession(session);
  const normalizedQuote = normalizeWorkspaceReplyQuote(quote);
  if (normalizedQuote == null) return normalizedSession;

  const tab = createWorkspaceReplyTab(normalizedQuote, identity);
  if (tab == null) return normalizedSession;
  if (normalizedSession.tabs.some((existingTab) => existingTab.id === tab.id)) {
    return normalizedSession;
  }

  return {
    tabs: [...normalizedSession.tabs, tab],
    activeTabId: tab.id,
  };
}

export function setWorkspaceReplyAnswer(
  session: WorkspaceReplySession,
  answer: string,
): WorkspaceReplySession {
  const normalizedSession = normalizeWorkspaceReplySession(session);
  const activeIndex = activeTabIndex(normalizedSession);
  if (activeIndex < 0) return normalizedSession;

  return {
    ...normalizedSession,
    tabs: normalizedSession.tabs.map((tab, index) =>
      index === activeIndex ? { ...tab, answer } : tab,
    ),
  };
}

export function selectWorkspaceReplyTab(
  session: WorkspaceReplySession,
  tabId: string,
): WorkspaceReplySession {
  return withActiveTab(normalizeWorkspaceReplySession(session), tabId);
}

export function removeWorkspaceReplyTab(
  session: WorkspaceReplySession,
  tabId: string,
): WorkspaceReplySession {
  const normalizedSession = normalizeWorkspaceReplySession(session);
  const removedIndex = normalizedSession.tabs.findIndex((tab) => tab.id === tabId);
  if (removedIndex < 0) return normalizedSession;

  const nextTabs = normalizedSession.tabs.filter((tab) => tab.id !== tabId);
  if (nextTabs.length === 0) return EMPTY_WORKSPACE_REPLY_SESSION;
  if (normalizedSession.activeTabId !== tabId) return { ...normalizedSession, tabs: nextTabs };

  const nextActiveTab = nextTabs[removedIndex] ?? nextTabs[removedIndex - 1];
  return {
    tabs: nextTabs,
    activeTabId: nextActiveTab?.id ?? null,
  };
}

/**
 * Reorders a tab using its insertion position in the list before removal.
 * The list length is a valid destination index and means append to the end.
 */
export function reorderWorkspaceReplyTab(
  session: WorkspaceReplySession,
  tabId: string,
  destinationIndex: number,
): WorkspaceReplySession {
  const normalizedSession = normalizeWorkspaceReplySession(session);
  const sourceIndex = normalizedSession.tabs.findIndex((tab) => tab.id === tabId);
  if (sourceIndex < 0 || normalizedSession.tabs.length < 2) return normalizedSession;
  if (!Number.isFinite(destinationIndex)) return normalizedSession;

  const boundedDestinationIndex = Math.max(
    0,
    Math.min(Math.trunc(destinationIndex), normalizedSession.tabs.length),
  );
  const adjustedDestinationIndex =
    boundedDestinationIndex > sourceIndex ? boundedDestinationIndex - 1 : boundedDestinationIndex;
  if (adjustedDestinationIndex === sourceIndex) return normalizedSession;

  const movedTab = normalizedSession.tabs[sourceIndex];
  if (movedTab == null) return normalizedSession;

  const nextTabs = [...normalizedSession.tabs];
  nextTabs.splice(sourceIndex, 1);
  nextTabs.splice(adjustedDestinationIndex, 0, movedTab);

  return {
    ...normalizedSession,
    tabs: nextTabs,
  };
}

export function buildWorkspaceReplyMarkdown(
  tabs: readonly WorkspaceReplyTab[],
  options?: { wroteLabel?: string },
): string {
  const normalizedSession = normalizeWorkspaceReplySession({
    tabs: [...tabs],
    activeTabId: tabs[0]?.id ?? null,
  });
  const wroteLabel = options?.wroteLabel ?? "wrote";

  return normalizedSession.tabs
    .map((tab) => {
      const header = buildWorkspaceQuoteHeader({
        senderName: tab.senderName,
        senderUuid: tab.senderUuid,
        wroteLabel,
        messageUuid: tab.messageUuid,
      });
      const selectedText = tab.selectedText?.trim();
      const quoteContent =
        selectedText != null && selectedText.length > 0 ? selectedText : tab.quotedContent;
      const quoteBlock = buildWorkspaceQuoteBlock(header, quoteContent).trimEnd();
      const answer = tab.answer.trim();
      return answer.length > 0 ? `${quoteBlock}\n\n${answer}` : quoteBlock;
    })
    .join("\n\n")
    .trimEnd();
}
