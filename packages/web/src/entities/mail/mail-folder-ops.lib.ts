/**
 * Mailbox folder path operations — validation before IMAP transport calls.
 */

import {
  getMailFolderLeafName,
  isDescendantMailFolderPath,
  isProtectedMailFolder,
} from "./mail-folder-guard.lib";
import {
  getMailFolderParentPath,
  joinMailFolderPath,
  sanitizeFolderPath,
} from "./mail-validation.lib";

function assertMailFolderManageable(path: string, delimiter: string): void {
  if (isProtectedMailFolder(path, delimiter)) {
    throw new Error("Cannot modify system folder");
  }
}

export function computeRenameFolderPath(path: string, name: string, delimiter: string): string {
  assertMailFolderManageable(path, delimiter);
  const parent = getMailFolderParentPath(path, delimiter) ?? "";
  const toPath = joinMailFolderPath(parent, name, delimiter);
  if (isProtectedMailFolder(toPath, delimiter)) {
    throw new Error("Cannot rename to a system folder name");
  }
  if (toPath === path) return path;
  return toPath;
}

export function computeMoveFolderPath(path: string, parentPath: string, delimiter: string): string {
  assertMailFolderManageable(path, delimiter);
  const sanitizedParent = sanitizeFolderPath(parentPath);
  if (sanitizedParent.length > 0 && isDescendantMailFolderPath(path, sanitizedParent, delimiter)) {
    throw new Error("Cannot move folder into itself or its subfolder");
  }
  const leaf = getMailFolderLeafName(path, delimiter);
  const toPath = joinMailFolderPath(sanitizedParent, leaf, delimiter);
  if (isProtectedMailFolder(toPath, delimiter)) {
    throw new Error("Cannot move folder to a system location");
  }
  if (toPath === path) return path;
  return toPath;
}

export function assertDeleteFolderAllowed(path: string, delimiter: string): void {
  assertMailFolderManageable(path, delimiter);
}
