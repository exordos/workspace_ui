/**
 * Escape navigation in messenger: blur composer, then return to inbox from an open chat.
 */

import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";
import { isMessengerChatPathname } from "./layout-sync-chat-context.lib";

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

export function isInboxMessengerPathname(pathname: string): boolean {
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  return scopedPathname === "/inbox";
}

export type LayoutEscapeKeyDownAction = "none" | "navigate-inbox";

export function resolveLayoutEscapeKeyDown(options: {
  key: string;
  defaultPrevented: boolean;
  pathname: string;
  composerFocused: boolean;
  modalOpen: boolean;
}): LayoutEscapeKeyDownAction {
  if (options.key !== "Escape") return "none";
  if (options.defaultPrevented) return "none";
  if (options.modalOpen) return "none";
  if (options.composerFocused) return "none";
  if (!isMessengerChatPathname(options.pathname)) return "none";
  if (isInboxMessengerPathname(options.pathname)) return "none";
  return "navigate-inbox";
}
