/**
 * Mail folder hierarchy — delimiter detection, path joining, visible tree rows.
 */

import { compareMailFolders } from "./mail.lib";
import type { MailFolder } from "./mail.types";

export interface MailFolderTreeRow {
  folder: MailFolder;
  depth: number;
  hasChildren: boolean;
}

const DEFAULT_DELIMITER = ".";

export function detectMailFolderDelimiter(paths: readonly string[]): string {
  if (paths.some((path) => path.includes("."))) return ".";
  if (paths.some((path) => path.includes("/"))) return "/";
  return DEFAULT_DELIMITER;
}

export function getMailFolderParentPath(path: string, delimiter: string): string | null {
  const index = path.lastIndexOf(delimiter);
  if (index <= 0) return null;
  return path.slice(0, index);
}

export function getMailFolderAncestorPaths(path: string, delimiter: string): string[] {
  const ancestors: string[] = [];
  let current = getMailFolderParentPath(path, delimiter);
  while (current != null) {
    ancestors.unshift(current);
    current = getMailFolderParentPath(current, delimiter);
  }
  return ancestors;
}

export function joinMailFolderPath(parentPath: string, name: string, delimiter: string): string {
  const trimmedParent = parentPath.trim();
  const trimmedName = name.trim();
  if (trimmedParent.length === 0) return trimmedName;
  if (trimmedName.length === 0) return trimmedParent;
  return `${trimmedParent}${delimiter}${trimmedName}`;
}

function sortFolderSiblings(items: MailFolder[]): MailFolder[] {
  return [...items].sort(compareMailFolders);
}

function buildChildrenMap(
  folders: readonly MailFolder[],
  delimiter: string,
): Map<string | null, MailFolder[]> {
  const paths = new Set(folders.map((folder) => folder.path));
  const children = new Map<string | null, MailFolder[]>();

  const addChild = (parent: string | null, folder: MailFolder) => {
    const list = children.get(parent) ?? [];
    list.push(folder);
    children.set(parent, list);
  };

  for (const folder of folders) {
    const parent = getMailFolderParentPath(folder.path, delimiter);
    if (parent != null && paths.has(parent)) {
      addChild(parent, folder);
    } else {
      addChild(null, folder);
    }
  }

  return children;
}

function walkVisibleRows(
  folder: MailFolder,
  depth: number,
  childrenMap: Map<string | null, MailFolder[]>,
  expandedPaths: ReadonlySet<string>,
  rows: MailFolderTreeRow[],
): void {
  const childFolders = childrenMap.get(folder.path) ?? [];
  const hasChildren = childFolders.length > 0;
  rows.push({ folder, depth, hasChildren });
  if (!hasChildren || !expandedPaths.has(folder.path)) return;
  for (const child of sortFolderSiblings(childFolders)) {
    walkVisibleRows(child, depth + 1, childrenMap, expandedPaths, rows);
  }
}

export function buildVisibleMailFolderRows(
  folders: readonly MailFolder[],
  delimiter: string,
  expandedPaths: ReadonlySet<string>,
): MailFolderTreeRow[] {
  if (folders.length === 0) return [];
  const childrenMap = buildChildrenMap(folders, delimiter);
  const roots = sortFolderSiblings(childrenMap.get(null) ?? []);
  const rows: MailFolderTreeRow[] = [];
  for (const root of roots) {
    walkVisibleRows(root, 0, childrenMap, expandedPaths, rows);
  }
  return rows;
}

export function resolveMailFolderExpandedPaths(
  current: ReadonlySet<string>,
  selectedFolder: string | null,
  delimiter: string,
): Set<string> {
  const next = new Set(current);
  if (selectedFolder != null) {
    for (const ancestor of getMailFolderAncestorPaths(selectedFolder, delimiter)) {
      next.add(ancestor);
    }
  }
  return next;
}

/** Expands ancestors of selection and every folder that has visible children. */
export function resolveMailFolderExpandedPathsForList(
  folders: readonly MailFolder[],
  current: ReadonlySet<string>,
  selectedFolder: string | null,
  delimiter: string,
): Set<string> {
  const next = resolveMailFolderExpandedPaths(current, selectedFolder, delimiter);
  const paths = new Set(folders.map((folder) => folder.path));
  for (const folder of folders) {
    const parent = getMailFolderParentPath(folder.path, delimiter);
    if (parent != null && paths.has(parent)) {
      next.add(parent);
    }
  }
  return next;
}

export function toggleMailFolderExpandedPath(
  current: ReadonlySet<string>,
  path: string,
): Set<string> {
  const next = new Set(current);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  return next;
}
