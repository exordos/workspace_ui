export const WORKSPACE_MESSAGE_UUID_ATTRIBUTE = "data-message-uuid";
export const WORKSPACE_MESSAGE_UUID_SELECTOR = `[${WORKSPACE_MESSAGE_UUID_ATTRIBUTE}]`;
export const WORKSPACE_MESSAGE_RENDER_KEY_ATTRIBUTE = "data-message-render-key";
export const WORKSPACE_MESSAGE_RENDER_KEY_SELECTOR = `[${WORKSPACE_MESSAGE_RENDER_KEY_ATTRIBUTE}]`;

export interface WorkspaceScrollSnapshot {
  scrollTop: number;
  scrollHeight: number;
}

export interface WorkspaceScrollAnchor {
  messageKey: string;
  offsetTop: number;
}

function findWorkspaceMessageNodeByAttribute(
  root: HTMLElement,
  attribute: string,
  messageKey: string,
): HTMLElement | null {
  for (const node of root.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    if (node.getAttribute(attribute) === messageKey) {
      return node;
    }
  }

  return null;
}

export function findWorkspaceMessageNode(
  root: HTMLElement,
  messageKey: string,
): HTMLElement | null {
  return findWorkspaceMessageNodeByAttribute(root, WORKSPACE_MESSAGE_UUID_ATTRIBUTE, messageKey);
}

function resolveVisibleWorkspaceMessageAnchorByAttribute(
  root: HTMLElement,
  attribute: string,
  selector: string,
): WorkspaceScrollAnchor | null {
  const rootRect = root.getBoundingClientRect();

  for (const node of root.querySelectorAll<HTMLElement>(selector)) {
    const messageKey = node.getAttribute(attribute);

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

export function resolveVisibleWorkspaceMessageAnchor(
  root: HTMLElement,
): WorkspaceScrollAnchor | null {
  return resolveVisibleWorkspaceMessageAnchorByAttribute(
    root,
    WORKSPACE_MESSAGE_UUID_ATTRIBUTE,
    WORKSPACE_MESSAGE_UUID_SELECTOR,
  );
}

export function resolveVisibleWorkspaceMessageRenderAnchor(
  root: HTMLElement,
): WorkspaceScrollAnchor | null {
  return resolveVisibleWorkspaceMessageAnchorByAttribute(
    root,
    WORKSPACE_MESSAGE_RENDER_KEY_ATTRIBUTE,
    WORKSPACE_MESSAGE_RENDER_KEY_SELECTOR,
  );
}

function computeWorkspaceScrollTopFromAnchorByAttribute(
  root: HTMLElement,
  anchor: WorkspaceScrollAnchor,
  attribute: string,
): number | null {
  const node = findWorkspaceMessageNodeByAttribute(root, attribute, anchor.messageKey);

  if (node == null) {
    return null;
  }

  const rootRect = root.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const nextScrollTop = root.scrollTop + (nodeRect.top - rootRect.top - anchor.offsetTop);

  return Math.max(0, nextScrollTop);
}

export function computeWorkspaceScrollTopFromAnchor(
  root: HTMLElement,
  anchor: WorkspaceScrollAnchor,
): number | null {
  return computeWorkspaceScrollTopFromAnchorByAttribute(
    root,
    anchor,
    WORKSPACE_MESSAGE_UUID_ATTRIBUTE,
  );
}

export function computeWorkspaceScrollTopFromRenderAnchor(
  root: HTMLElement,
  anchor: WorkspaceScrollAnchor,
): number | null {
  return computeWorkspaceScrollTopFromAnchorByAttribute(
    root,
    anchor,
    WORKSPACE_MESSAGE_RENDER_KEY_ATTRIBUTE,
  );
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
