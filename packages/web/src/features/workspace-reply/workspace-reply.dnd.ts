import type { DropTargetRecord } from "@atlaskit/pragmatic-drag-and-drop/types";

export const WORKSPACE_REPLY_TAB_DND_TYPE = "workspace-reply-tab" as const;
export const WORKSPACE_REPLY_TAB_LIST_TARGET_ID = "__workspace-reply-tab-list__";

export type WorkspaceReplyTabDragData = Record<string | symbol, unknown> & {
  type: typeof WORKSPACE_REPLY_TAB_DND_TYPE;
  tabId: string;
};

export function getWorkspaceReplyTabDragData(tabId: string): WorkspaceReplyTabDragData {
  return { type: WORKSPACE_REPLY_TAB_DND_TYPE, tabId };
}

export function isWorkspaceReplyTabDragData(
  data: Record<string | symbol, unknown>,
): data is WorkspaceReplyTabDragData {
  return data.type === WORKSPACE_REPLY_TAB_DND_TYPE && typeof data.tabId === "string";
}

interface TabWithId {
  id: string;
}

interface WorkspaceReplyTabDropIndexArgs {
  tabs: readonly TabWithId[];
  tabElements: ReadonlyMap<string, HTMLElement>;
  dropTargets: readonly Pick<DropTargetRecord, "data" | "element">[];
  clientX: number;
}

function insertionIndexForElement(element: Element, tabIndex: number, clientX: number): number {
  const rectangle = element.getBoundingClientRect();
  return clientX < rectangle.left + rectangle.width / 2 ? tabIndex : tabIndex + 1;
}

function insertionIndexForList(
  tabs: readonly TabWithId[],
  tabElements: ReadonlyMap<string, HTMLElement>,
  clientX: number,
): number {
  for (const [index, tab] of tabs.entries()) {
    const element = tabElements.get(tab.id);
    if (element == null) continue;

    const rectangle = element.getBoundingClientRect();
    if (clientX < rectangle.left + rectangle.width / 2) return index;
  }

  return tabs.length;
}

/**
 * Returns an insertion position in the coordinates that exist before removing the dragged tab.
 */
export function getWorkspaceReplyTabDropIndex({
  tabs,
  tabElements,
  dropTargets,
  clientX,
}: WorkspaceReplyTabDropIndexArgs): number | null {
  const target = dropTargets.find((record) => isWorkspaceReplyTabDragData(record.data));
  if (target == null) return null;

  if (target.data.tabId === WORKSPACE_REPLY_TAB_LIST_TARGET_ID) {
    return insertionIndexForList(tabs, tabElements, clientX);
  }

  const tabIndex = tabs.findIndex((tab) => tab.id === target.data.tabId);
  if (tabIndex === -1) return null;

  return insertionIndexForElement(target.element, tabIndex, clientX);
}
