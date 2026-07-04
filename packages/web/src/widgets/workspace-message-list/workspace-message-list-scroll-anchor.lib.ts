export const WORKSPACE_MESSAGE_UUID_ATTRIBUTE = "data-message-uuid";
export const WORKSPACE_MESSAGE_UUID_SELECTOR = `[${WORKSPACE_MESSAGE_UUID_ATTRIBUTE}]`;

export interface WorkspaceScrollSnapshot {
  scrollTop: number;
  scrollHeight: number;
}

export interface WorkspaceScrollAnchor {
  messageKey: string;
  offsetTop: number;
}

export function findWorkspaceMessageNode(
  root: HTMLElement,
  messageKey: string,
): HTMLElement | null {
  for (const node of root.querySelectorAll<HTMLElement>(WORKSPACE_MESSAGE_UUID_SELECTOR)) {
    if (node.getAttribute(WORKSPACE_MESSAGE_UUID_ATTRIBUTE) === messageKey) {
      return node;
    }
  }

  return null;
}

export function resolveVisibleWorkspaceMessageAnchor(
  root: HTMLElement,
): WorkspaceScrollAnchor | null {
  const rootRect = root.getBoundingClientRect();

  for (const node of root.querySelectorAll<HTMLElement>(WORKSPACE_MESSAGE_UUID_SELECTOR)) {
    const messageKey = node.getAttribute(WORKSPACE_MESSAGE_UUID_ATTRIBUTE);

    if (messageKey == null || messageKey.length === 0) {
      continue;
    }

    const rect = node.getBoundingClientRect();

    if (rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) {
      continue;
    }

    return {
      messageKey,
      offsetTop: rect.top - rootRect.top,
    };
  }

  return null;
}

export function computeWorkspaceScrollTopFromAnchor(
  root: HTMLElement,
  anchor: WorkspaceScrollAnchor,
): number | null {
  const node = findWorkspaceMessageNode(root, anchor.messageKey);

  if (node == null) {
    return null;
  }

  const rootRect = root.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const nextScrollTop = root.scrollTop + (nodeRect.top - rootRect.top - anchor.offsetTop);

  return Math.max(0, nextScrollTop);
}

export function computeWorkspaceScrollTopAfterPrepend(
  previous: WorkspaceScrollSnapshot,
  nextScrollHeight: number,
): number {
  const nextScrollTop = nextScrollHeight - previous.scrollHeight + previous.scrollTop;

  return Math.max(0, nextScrollTop);
}

export function isWorkspaceScrollAtBottom(root: HTMLElement, threshold: number): boolean {
  return root.scrollHeight - root.scrollTop - root.clientHeight <= threshold;
}
