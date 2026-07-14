/**
 * User-managed vs system IMAP mailbox paths (client-side guards for UI).
 */

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

export function isProtectedMailFolder(path: string, delimiter = "."): boolean {
  const normalized = path.trim();
  if (PROTECTED_EXACT.has(normalized.toUpperCase())) return true;
  const leaf = getMailFolderLeafName(normalized, delimiter);
  return PROTECTED_LEAF_NAMES.has(leaf.toUpperCase());
}

export function canManageMailFolder(path: string, delimiter = "."): boolean {
  return !isProtectedMailFolder(path, delimiter);
}

export function isDescendantMailFolderPath(
  parent: string,
  candidate: string,
  delimiter: string,
): boolean {
  if (candidate === parent) return true;
  return candidate.startsWith(`${parent}${delimiter}`);
}
