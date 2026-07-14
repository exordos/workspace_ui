/**
 * Pure mail utilities — folder ordering and display helpers.
 */

import type { MailFolder, MailMessageSummary } from "./mail.types";

const FOLDER_ORDER = ["INBOX", "Sent", "Drafts", "Archive", "Spam", "Trash"] as const;

const SPECIAL_FOLDER_CANDIDATES: Record<string, readonly string[]> = {
  Archive: ["Archive", "INBOX.Archive"],
  Spam: ["Spam", "Junk", "INBOX.Spam", "INBOX.Junk"],
  Trash: ["Trash", "INBOX.Trash", "Deleted", "INBOX.Deleted"],
  Sent: ["Sent", "INBOX.Sent", "Sent Messages", "INBOX.Sent Messages"],
  Drafts: ["Drafts", "INBOX.Drafts", "Draft"],
};

export type MailFolderClearMode = "permanent" | "move";

export interface MailFolderClearOptions {
  mode: MailFolderClearMode;
  targetFolder?: string;
}

export function compareMailFolders(a: MailFolder, b: MailFolder): number {
  const aIndex = FOLDER_ORDER.indexOf(a.path as (typeof FOLDER_ORDER)[number]);
  const bIndex = FOLDER_ORDER.indexOf(b.path as (typeof FOLDER_ORDER)[number]);
  if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
  if (aIndex >= 0) return -1;
  if (bIndex >= 0) return 1;
  return a.name.localeCompare(b.name);
}

export function sortMailFolders(folders: readonly MailFolder[]): MailFolder[] {
  return [...folders].sort(compareMailFolders);
}

export function getMailApiBase(configuredOrigin: string): string {
  const trimmed = configuredOrigin.trim().replace(/\/+$/, "");
  return trimmed;
}

export function isMailApiConfigured(configuredOrigin: string): boolean {
  return getMailApiBase(configuredOrigin).length > 0;
}

export function isMailUnauthorizedError(error: unknown): boolean {
  if (typeof error === "object" && error != null && "status" in error) {
    const status = error.status;
    if (status === 401) return true;
  }
  return error instanceof Error && error.message.toLowerCase() === "unauthorized";
}

export type MailPreviewBody = { mode: "html"; html: string } | { mode: "plain"; text: string };

/** Prefer HTML part so reply quotes (blockquote, gmail_quote) render with structure. */
export function resolveMailPreviewBody(
  bodyHtml: string | null,
  bodyText: string | null,
): MailPreviewBody | null {
  if (bodyHtml != null && bodyHtml.trim().length > 0) {
    return { mode: "html", html: bodyHtml };
  }
  if (bodyText != null && bodyText.trim().length > 0) {
    return { mode: "plain", text: bodyText };
  }
  return null;
}

const FOLDER_I18N_KEYS: Record<string, string> = {
  INBOX: "mail.folders.inbox",
  Sent: "mail.folders.sent",
  Drafts: "mail.folders.drafts",
  Archive: "mail.folders.archive",
  Spam: "mail.folders.spam",
  Trash: "mail.folders.trash",
};

export function getMailFolderLabelKey(path: string): string | null {
  return FOLDER_I18N_KEYS[path] ?? null;
}

const FOLDER_ICON_NAMES = {
  INBOX: "mail",
  Sent: "send",
  Drafts: "drafts",
  Archive: "folder",
  Spam: "block",
  Trash: "delete",
} as const;

export type MailFolderIconName =
  | (typeof FOLDER_ICON_NAMES)[keyof typeof FOLDER_ICON_NAMES]
  | "folder";

/** Maps a mailbox folder path to an icon registry name. */
export function getMailFolderIconName(path: string): MailFolderIconName {
  return FOLDER_ICON_NAMES[path as keyof typeof FOLDER_ICON_NAMES] ?? "folder";
}

export function sortMailMessagesByUidDesc(
  messages: readonly MailMessageSummary[],
): MailMessageSummary[] {
  return [...messages].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function isTrashFolder(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === "trash" || lower.endsWith(".trash") || lower === "deleted";
}

export function isDraftsFolder(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === "drafts" || lower.endsWith(".drafts");
}

export function resolveSpecialFolderPath(
  folders: readonly MailFolder[],
  kind: keyof typeof SPECIAL_FOLDER_CANDIDATES,
): string | null {
  const specialUse = kind.toLowerCase();
  const bySpecialUse = folders.find((folder) => folder.specialUse?.toLowerCase() === specialUse);
  if (bySpecialUse != null) return bySpecialUse.path;
  const candidates = SPECIAL_FOLDER_CANDIDATES[kind] ?? [];
  const paths = new Set(folders.map((folder) => folder.path));
  for (const candidate of candidates) {
    if (paths.has(candidate)) return candidate;
  }
  const lowerMap = new Map(folders.map((folder) => [folder.path.toLowerCase(), folder.path]));
  for (const candidate of candidates) {
    const match = lowerMap.get(candidate.toLowerCase());
    if (match != null) return match;
  }
  return null;
}

/** Client-side clear/delete semantics — move to Trash unless already in Trash. */
export function buildMailFolderClearOptions(
  folders: readonly MailFolder[],
  path: string,
): MailFolderClearOptions {
  if (isTrashFolder(path)) {
    return { mode: "permanent" };
  }
  const trashPath = resolveSpecialFolderPath(folders, "Trash");
  if (trashPath != null) {
    return { mode: "move", targetFolder: trashPath };
  }
  return { mode: "permanent" };
}

export function buildDefaultSearchFolders(
  folders: readonly MailFolder[],
  selectedFolder?: string | null,
): string[] {
  if (selectedFolder != null && selectedFolder.trim().length > 0) {
    return [selectedFolder];
  }
  const paths = new Set<string>(["INBOX"]);
  const sentPath = resolveSpecialFolderPath(folders, "Sent");
  if (sentPath != null) {
    paths.add(sentPath);
  }
  return [...paths];
}

export function selectAdjacentMessageUid(
  messages: readonly MailMessageSummary[],
  currentUid: string,
): string | null {
  const index = messages.findIndex((message) => message.uid === currentUid);
  if (index < 0) return messages[0]?.uid ?? null;
  if (index + 1 < messages.length) return messages[index + 1]!.uid;
  if (index > 0) return messages[index - 1]!.uid;
  return null;
}
