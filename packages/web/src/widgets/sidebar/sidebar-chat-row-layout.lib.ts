/** Shared flex layout for sidebar DM/stream chat rows (normal density). */

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
 * Shell for an expanded stream + its topics.
 * Rounded + overflow-hidden clips the straight left rail at the corners —
 * the bar itself is not rounded; the invisible group container cuts it.
 */
export function sidebarStreamGroupClass(expanded: boolean): string {
  return expanded ? "flex items-stretch overflow-hidden rounded-lg" : "";
}

/**
 * Unified 3px accent rail (Figma review: one strip binds channel + topics).
 * Width is design-critical (mock is exactly 3px), not the 4px spacing grid.
 * Keep square ends — parent overflow + radius provides the curved tips.
 */
export const SIDEBAR_STREAM_GROUP_RAIL_CLASS = "w-[3px] shrink-0 self-stretch bg-sidebar-sender";

/**
 * Topic row shell — same card radius/padding rhythm as stream rows, without avatar.
 * Left padding aligns text under the channel title (Figma: 38px). Content stays 2 lines.
 * Title: 14/20 medium; preview stays on the shared SidebarMessagePreview (12/20 regular).
 */
export function sidebarTopicRowLinkClass(compact: boolean): string {
  return compact
    ? "flex w-full min-w-0 items-stretch gap-2 rounded-md py-1.5 pl-9 pr-2 transition-colors"
    : "flex w-full min-w-0 items-stretch gap-3 rounded-lg py-2 pl-[38px] pr-2 transition-colors";
}

/** Topic title — Figma channel topic: Inter Medium 14 / line-height 20. */
export const SIDEBAR_TOPIC_TITLE_CLASS = "truncate text-sm font-medium leading-5 text-text-primary";

/**
 * Quick “+ New topic” row (Figma 119:1558): 12px / regular / leading 20 / text-secondary.
 * Not font-medium — Medium at this size reads heavier than the mock.
 */
export function sidebarNewTopicButtonClass(compact: boolean): string {
  return compact
    ? "flex w-full min-w-0 items-center rounded-md py-1.5 pl-9 pr-2 text-left text-xs font-normal leading-5 text-text-secondary transition-colors hover:bg-sidebar-hover"
    : "flex w-full min-w-0 items-center rounded-lg py-2 pl-[38px] pr-2 text-left text-xs font-normal leading-5 text-text-secondary transition-colors hover:bg-sidebar-hover";
}

/**
 * “Show more topics” row (Figma 4997:25702 / parent 4997:25701).
 * Same left inset as topic title/preview (38px). Label hugs left; chevron stays on the trailing edge
 * (space-between) — do not put flex-1 + pl on the label or it reads as centered in the row.
 * Fill is card-bg-active (#4B4B4B in orange-warm dark), matching the mock strip.
 * No own radius — the stream group shell (`overflow-hidden rounded-lg`) clips the bottom corners
 * so this strip reads as part of the channel block, not a separate card.
 */
export function sidebarTopicShowMoreButtonClass(compact: boolean): string {
  return compact
    ? "flex w-full min-w-0 items-center justify-between bg-card-bg-active py-1.5 pl-9 pr-2 text-left text-sm font-medium leading-5 text-text-primary transition-opacity hover:opacity-90"
    : "flex w-full min-w-0 items-center justify-between bg-card-bg-active py-2 pl-[38px] pr-2 text-left text-sm font-medium leading-5 text-text-primary transition-opacity hover:opacity-90";
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
