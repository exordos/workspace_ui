import type {
  WorkspaceComposerDraftContent,
  WorkspaceComposerDraftReplySession,
  WorkspaceComposerDraftReplyTab,
} from "./composer-draft.types";

export const EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION: WorkspaceComposerDraftReplySession = {
  tabs: [],
  activeTabId: null,
};

export const EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT: WorkspaceComposerDraftContent = {
  text: "",
  replySession: EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION,
};

let nextSnapshotOrdinal = 1;

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized == null || normalized.length === 0 ? undefined : normalized;
}

function normalizeReplyTab(
  tab: WorkspaceComposerDraftReplyTab,
): WorkspaceComposerDraftReplyTab | null {
  const id = tab.id.trim();
  const messageUuid = tab.messageUuid.trim();
  const senderUuid = tab.senderUuid.trim();
  const senderName = tab.senderName.trim();
  const createdAt = tab.createdAt.trim();
  if (
    id.length === 0 ||
    messageUuid.length === 0 ||
    senderUuid.length === 0 ||
    senderName.length === 0 ||
    createdAt.length === 0
  ) {
    return null;
  }

  return {
    id,
    messageUuid,
    senderUuid,
    senderName,
    quotedContent: tab.quotedContent.replace(/\r\n?/g, "\n"),
    selectedText: normalizeOptionalText(tab.selectedText),
    createdAt,
    answer: tab.answer,
  };
}

export function normalizeWorkspaceComposerDraftReplySession(
  session: WorkspaceComposerDraftReplySession,
): WorkspaceComposerDraftReplySession {
  const tabs: WorkspaceComposerDraftReplyTab[] = [];
  const tabIds = new Set<string>();
  for (const tab of session.tabs) {
    const normalizedTab = normalizeReplyTab(tab);
    if (normalizedTab == null || tabIds.has(normalizedTab.id)) continue;
    tabIds.add(normalizedTab.id);
    tabs.push(normalizedTab);
  }
  if (tabs.length === 0) return EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION;

  const activeTabId = tabs.some((tab) => tab.id === session.activeTabId)
    ? session.activeTabId
    : (tabs[0]?.id ?? null);
  return { tabs, activeTabId };
}

export function normalizeWorkspaceComposerDraftContent(
  content: WorkspaceComposerDraftContent,
): WorkspaceComposerDraftContent {
  return {
    text: content.text,
    replySession: normalizeWorkspaceComposerDraftReplySession(content.replySession),
  };
}

export function isWorkspaceComposerDraftContentEmpty(
  content: WorkspaceComposerDraftContent,
): boolean {
  return content.text.trim().length === 0 && content.replySession.tabs.length === 0;
}

export function createWorkspaceComposerDraftKey(ownerKey: string, conversationId: string): string {
  return `${ownerKey}:${conversationId}`;
}

export function createWorkspaceComposerDraftSnapshotId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid != null) return `composer-draft:${randomUuid}`;

  const ordinal = nextSnapshotOrdinal;
  nextSnapshotOrdinal += 1;
  return `composer-draft:${Date.now().toString(36)}:${ordinal.toString(36)}`;
}
