/** Shared flex layout for sidebar DM/stream chat rows (normal density). */

import { TOPIC_BAR_FALLBACK_COLOR } from "./sidebar.lib";

export function sidebarChatRowLinkClass(compact: boolean, groupName?: string): string {
  const group = groupName != null ? `group/${groupName} ` : "";
  return compact
    ? `${group}flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors`
    : `${group}flex items-stretch gap-3 rounded-lg px-2.5 py-2.5 transition-colors`;
}

export function sidebarChatRowBodyClass(compact: boolean): string {
  return compact ? "min-w-0 flex-1" : "flex min-w-0 flex-1 flex-col justify-between";
}

/**
 * Expanded channel + topics shell (Figma group chat/channel open).
 * Card/background base (`card-bg`) on Surface chrome (`bg-elevated`).
 * Expansion must not look “selected” — active route uses `sidebarRowClass`.
 */
export function sidebarStreamGroupClass(expanded: boolean): string {
  return expanded ? "overflow-hidden rounded-lg bg-card-bg" : "";
}

/**
 * Last-message preview link inside a stream card.
 * Hover uses the card underlay (`card-bg`), not `sidebar-hover` — the parent row
 * already paints that, so a nested same-token hover would look inert.
 */
export const SIDEBAR_STREAM_PREVIEW_LINK_CLASS =
  "-ml-1.5 block min-w-0 rounded-md py-0.5 pl-1.5 pr-2 transition-colors hover:bg-card-bg focus-visible:bg-card-bg focus-visible:outline-none";

/**
 * Topic row shell.
 * Common left inset (38px) from the card edge, then flex: color bar + gap + title/preview.
 * The bar sits with the text block, not flush on the card edge.
 */
export function sidebarTopicRowLinkClass(compact: boolean): string {
  return compact
    ? "flex w-full min-w-0 items-stretch gap-2 rounded-md py-1.5 pl-9 pr-2 transition-colors"
    : "flex w-full min-w-0 items-stretch gap-3 rounded-lg py-2 pl-[38px] pr-2 transition-colors";
}

/**
 * 3px topic accent bar in the leading flex column (Figma topic Line).
 * Always reserve the column so default topics keep the same title alignment.
 */
export const SIDEBAR_TOPIC_BAR_CLASS = "w-[3px] shrink-0 self-stretch rounded-full";

/** Invisible twin of SIDEBAR_TOPIC_BAR_CLASS — keeps show-more aligned with topic title columns. */
export const SIDEBAR_TOPIC_BAR_SPACER_CLASS = "w-[3px] shrink-0 self-stretch";

/** Topic title — Figma channel topic: Inter Medium 14 / line-height 20. */
export const SIDEBAR_TOPIC_TITLE_CLASS = "truncate text-sm font-medium leading-5 text-text-primary";

/**
 * Ensure topic labels show a leading `#` like stream rows (`#engineering`).
 * Does not double-prefix when the backend name already starts with `#`.
 */
export function formatSidebarTopicTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) return trimmed;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/**
 * Topic accent bar color. Every topic gets a strip — no general/default exception.
 * Prefer the API RGB int (`color`); otherwise a theme-neutral gray.
 */
export function resolveSidebarTopicBarColor(input: { color?: number | null }): string {
  const color = input.color;
  if (color != null && Number.isInteger(color) && color >= 0 && color <= 0xffffff) {
    return `#${color.toString(16).padStart(6, "0")}`;
  }
  return TOPIC_BAR_FALLBACK_COLOR;
}

/**
 * “Show more topics” row (Figma 4997:25702 / parent 4997:25701).
 * Same leading inset + bar gutter as topic rows so the label lines up with titles.
 * No own fill — inherits the group card bg. No own radius — group shell clips corners.
 */
export function sidebarTopicShowMoreButtonClass(compact: boolean): string {
  return compact
    ? "flex w-full min-w-0 items-center justify-between gap-2 py-1.5 pl-9 pr-2 text-left text-sm font-medium leading-5 text-text-primary transition-opacity hover:opacity-90"
    : "flex w-full min-w-0 items-center justify-between gap-3 py-2 pl-[38px] pr-2 text-left text-sm font-medium leading-5 text-text-primary transition-opacity hover:opacity-90";
}

/** List gap between topic cards under an expanded stream (Figma: 4px). */
export const SIDEBAR_TOPIC_LIST_CLASS = "mt-0.5 space-y-1";

/**
 * Only the active route card is highlighted — never “expanded”.
 * A stream may stay open with topics visible while another chat is selected;
 * glowing every open stream makes the current location ambiguous.
 */
export function isWorkspaceSidebarStreamHighlighted(input: {
  streamUuid: string;
  activeStreamUuid: string | null;
  activeTopicUuid: string | null;
}): boolean {
  return input.activeStreamUuid === input.streamUuid && input.activeTopicUuid == null;
}
