/**
 * Escape navigation in messenger: return to inbox from an open chat unless focus is in a
 * form control (input, textarea, select, contenteditable) or a modal is open.
 */

import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";

export const COMPOSER_FOCUS_ZONE_SELECTOR = '[data-focus-zone="composer"]';

export function isModalShortcutContextOpen(): boolean {
  return document.querySelector("[data-shortcut-context='modal']") != null;
}

export function isComposerTextareaFocused(
  activeElement: Element | null = document.activeElement,
): boolean {
  if (!(activeElement instanceof HTMLTextAreaElement)) return false;
  return activeElement.closest(COMPOSER_FOCUS_ZONE_SELECTOR) != null;
}

/** True when focus is in an input, textarea, select, or contenteditable element. */
export function isInteractiveElementFocused(
  activeElement: Element | null = document.activeElement,
): boolean {
  if (activeElement == null) return false;
  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (activeElement instanceof HTMLElement) {
    if (activeElement.isContentEditable) return true;
    const mode = activeElement.contentEditable;
    if (mode === "true" || mode === "plaintext-only") return true;
    const attr = activeElement.getAttribute("contenteditable");
    return attr != null && attr !== "false" && attr !== "off";
  }
  return false;
}

export function isInboxMessengerPathname(pathname: string): boolean {
  const workspaceRoute = parseWorkspaceMessengerRoute(pathname);
  return workspaceRoute?.kind === "inbox";
}

export function isMessengerChatPathname(pathname: string): boolean {
  const workspaceRoute = parseWorkspaceMessengerRoute(pathname);
  return (
    workspaceRoute?.kind === "stream" ||
    workspaceRoute?.kind === "topic" ||
    workspaceRoute?.kind === "message"
  );
}

export type LayoutEscapeKeyDownAction = "none" | "navigate-inbox";

export function resolveLayoutEscapeKeyDown(options: {
  key: string;
  defaultPrevented: boolean;
  pathname: string;
  interactiveElementFocused: boolean;
  modalOpen: boolean;
}): LayoutEscapeKeyDownAction {
  if (options.key !== "Escape") return "none";
  if (options.defaultPrevented) return "none";
  if (options.modalOpen) return "none";
  if (options.interactiveElementFocused) return "none";
  const workspaceRoute = parseWorkspaceMessengerRoute(options.pathname);
  const isWorkspaceChat =
    workspaceRoute?.kind === "stream" ||
    workspaceRoute?.kind === "topic" ||
    workspaceRoute?.kind === "message";
  if (!isWorkspaceChat && !isMessengerChatPathname(options.pathname)) return "none";
  if (isInboxMessengerPathname(options.pathname)) return "none";
  return "navigate-inbox";
}
