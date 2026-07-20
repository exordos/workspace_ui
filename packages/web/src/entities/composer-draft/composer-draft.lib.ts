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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = normalizeRequiredText(value);
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeReplyTab(tab: unknown): WorkspaceComposerDraftReplyTab | null {
  if (!isRecord(tab)) return null;

  const id = normalizeRequiredText(tab.id);
  const messageUuid = normalizeRequiredText(tab.messageUuid);
  const senderUuid = normalizeRequiredText(tab.senderUuid);
  const senderName = normalizeRequiredText(tab.senderName);
  const createdAt = normalizeRequiredText(tab.createdAt);
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
    quotedContent: normalizeText(tab.quotedContent).replace(/\r\n?/g, "\n"),
    selectedText: normalizeOptionalText(tab.selectedText),
    createdAt,
    answer: normalizeText(tab.answer),
  };
}

export function normalizeWorkspaceComposerDraftReplySession(
  session: unknown,
): WorkspaceComposerDraftReplySession {
  if (!isRecord(session) || !Array.isArray(session.tabs)) {
    return EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION;
  }

  const tabs: WorkspaceComposerDraftReplyTab[] = [];
  const tabIds = new Set<string>();
  for (const tab of session.tabs) {
    const normalizedTab = normalizeReplyTab(tab);
    if (normalizedTab == null || tabIds.has(normalizedTab.id)) continue;
    tabIds.add(normalizedTab.id);
    tabs.push(normalizedTab);
  }
  if (tabs.length === 0) return EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION;

  const activeTabId =
    typeof session.activeTabId === "string" && tabs.some((tab) => tab.id === session.activeTabId)
      ? session.activeTabId
      : (tabs[0]?.id ?? null);
  return { tabs, activeTabId };
}

export function normalizeWorkspaceComposerDraftContent(
  content: unknown,
): WorkspaceComposerDraftContent {
  if (!isRecord(content)) return EMPTY_WORKSPACE_COMPOSER_DRAFT_CONTENT;

  return {
    text: normalizeText(content.text),
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

export function createWorkspaceComposerDraftUuid(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid != null) return randomUuid;

  const ordinal = nextSnapshotOrdinal;
  nextSnapshotOrdinal += 1;
  const timestamp = Date.now().toString(16).padStart(12, "0").slice(-12);
  const suffix = ordinal.toString(16).padStart(3, "0").slice(-3);
  return `00000000-0000-4000-8000-${timestamp.slice(0, 9)}${suffix}`;
}
