/**
 * High-level mailbox folder operations (rename, move, delete) with validation.
 */

import {
  assertMailFolderManageable,
  getMailFolderLeafName,
  isDescendantMailboxPath,
  isProtectedMailFolderPath,
} from "./folder-guard.lib";
import {
  clearMailFolder,
  deleteMailFolder,
  markAllMailFolderRead,
  renameMailFolder,
  resolveTrashFolder,
} from "./imap.lib";
import type { MailSessionRecord } from "../shared/session/session.lib";
import { getMailFolderParentPath, joinMailFolderPath } from "./validation.lib";

export async function renameMailMailbox(
  session: MailSessionRecord,
  path: string,
  name: string,
  delimiter: string,
): Promise<string> {
  assertMailFolderManageable(path, delimiter);
  const parent = getMailFolderParentPath(path, delimiter) ?? "";
  const toPath = joinMailFolderPath(parent, name, delimiter);
  if (isProtectedMailFolderPath(toPath, delimiter)) {
    throw new Error("Cannot rename to a system folder name");
  }
  if (toPath === path) return path;
  await renameMailFolder(session, path, toPath);
  return toPath;
}

export async function moveMailMailbox(
  session: MailSessionRecord,
  path: string,
  parentPath: string,
  delimiter: string,
): Promise<string> {
  assertMailFolderManageable(path, delimiter);
  if (parentPath.length > 0 && isDescendantMailboxPath(path, parentPath, delimiter)) {
    throw new Error("Cannot move folder into itself or its subfolder");
  }
  const leaf = getMailFolderLeafName(path, delimiter);
  const toPath = joinMailFolderPath(parentPath, leaf, delimiter);
  if (isProtectedMailFolderPath(toPath, delimiter)) {
    throw new Error("Cannot move folder to a system location");
  }
  if (toPath === path) return path;
  await renameMailFolder(session, path, toPath);
  return toPath;
}

export async function removeMailMailbox(
  session: MailSessionRecord,
  path: string,
  delimiter: string,
): Promise<void> {
  assertMailFolderManageable(path, delimiter);
  const trashFolder = await resolveTrashFolder(session);
  await deleteMailFolder(session, path, delimiter, trashFolder);
}

export async function clearMailMailbox(session: MailSessionRecord, path: string): Promise<void> {
  const trashFolder = await resolveTrashFolder(session);
  await clearMailFolder(session, path, trashFolder);
}

export async function markMailMailboxAllRead(session: MailSessionRecord, path: string): Promise<void> {
  await markAllMailFolderRead(session, path);
}
