/**
 * Guards for user-managed vs system IMAP mailboxes.
 */

import { sanitizeFolderPath } from "./validation.lib";

const PROTECTED_EXACT = new Set(["INBOX"]);

const PROTECTED_LEAF_NAMES = new Set([
  "SENT",
  "DRAFTS",
  "ARCHIVE",
  "SPAM",
  "TRASH",
  "JUNK",
  "DELETED",
]);

export function getMailFolderLeafName(path: string, delimiter: string): string {
  const index = path.lastIndexOf(delimiter);
  if (index < 0) return path;
  return path.slice(index + delimiter.length);
}

export function isProtectedMailFolderPath(path: string, delimiter = "."): boolean {
  const normalized = sanitizeFolderPath(path);
  if (PROTECTED_EXACT.has(normalized.toUpperCase())) return true;
  const leaf = getMailFolderLeafName(normalized, delimiter);
  return PROTECTED_LEAF_NAMES.has(leaf.toUpperCase());
}

export function assertMailFolderManageable(path: string, delimiter = "."): void {
  if (isProtectedMailFolderPath(path, delimiter)) {
    throw new Error("Cannot modify system folder");
  }
}

export function isDescendantMailboxPath(
  parent: string,
  candidate: string,
  delimiter: string,
): boolean {
  if (candidate === parent) return true;
  return candidate.startsWith(`${parent}${delimiter}`);
}
