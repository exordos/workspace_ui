/**
 * Shared chrome for notice bars above or inside the chat composer.
 *
 * Used by chat-page inline alerts, delete confirm bar, and composer edit preface.
 */

/**
 * Horizontal inset matching the composer input shell (`p-2` around the write card).
 * Reply chrome, clear-reply, and alert strips share this so edges line up with the input card.
 */
export const CHAT_BOTTOM_COMPOSER_CONTENT_INSET_X = "px-2";

export const CHAT_BOTTOM_NOTICE_BAR_BASE = "flex flex-shrink-0 items-center bg-composer-outer";

/** Outer shell only: rounding/border live here; inner strip owns padding (matches reply chrome). */
export const CHAT_BOTTOM_NOTICE_BAR_SHELL =
  "flex flex-shrink-0 flex-col overflow-hidden bg-composer-outer";

/**
 * Composer reply chrome wrapper: same solid surface as the composer (`bg-composer-outer`).
 * No bottom border — reply block flows into the input row as one surface.
 */
export const CHAT_BOTTOM_NOTICE_REPLY_CHROME_CLASS_NAME = "bg-composer-outer";

/**
 * Inner strip matching composer reply preface:
 * solid composer surface + shared px-2 so dismiss sits at the same inset as clear-reply.
 */
export const CHAT_BOTTOM_NOTICE_PREFACE_STRIP_CLASS_NAME = `relative flex w-full min-w-0 items-start gap-2 bg-composer-outer ${CHAT_BOTTOM_COMPOSER_CONTENT_INSET_X} py-2`;

/** Shared X dismiss control (inline alerts + composer clear-reply). */
export const CHAT_BOTTOM_NOTICE_DISMISS_BUTTON_CLASS_NAME =
  "shrink-0 rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary";

export const CHAT_BOTTOM_NOTICE_BAR_ROUND = {
  all: "rounded-xl",
  top: "rounded-t-xl",
  bottom: "rounded-b-xl",
  none: "rounded-none",
} as const;

export type ChatBottomNoticeBarRound = keyof typeof CHAT_BOTTOM_NOTICE_BAR_ROUND;

export type ChatBottomNoticeTone = "neutral" | "danger" | "warning" | "info";

const CHAT_BOTTOM_NOTICE_MARKER_CLASS_NAME: Record<ChatBottomNoticeTone, string> = {
  neutral: "bg-text-muted",
  danger: "bg-danger",
  warning: "bg-indicator-yellow",
  info: "bg-accent",
};

const CHAT_BOTTOM_NOTICE_ACTION_CLASS_NAME: Record<ChatBottomNoticeTone, string> = {
  neutral: "border-border-subtle text-text-primary hover:bg-bg-elevated",
  danger: "border-danger bg-danger/10 text-danger hover:bg-danger/20",
  warning:
    "border-indicator-yellow bg-indicator-yellow/10 text-text-primary hover:bg-indicator-yellow/20",
  info: "border-accent bg-accent/10 text-text-primary hover:bg-accent/20",
};

/** Shared geometry for notice-bar action buttons (selection + delete confirm). */
export const CHAT_BOTTOM_NOTICE_ACTION_BUTTON_BASE =
  "rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50";

export function chatBottomNoticeMarkerClassName(tone: ChatBottomNoticeTone): string {
  return CHAT_BOTTOM_NOTICE_MARKER_CLASS_NAME[tone];
}

export function chatBottomNoticeActionClassName(tone: ChatBottomNoticeTone): string {
  return CHAT_BOTTOM_NOTICE_ACTION_CLASS_NAME[tone];
}

/** Tone + shared button chrome used by selection and delete-confirm bars. */
export function chatBottomNoticeActionButtonClassName(
  tone: ChatBottomNoticeTone,
  { transparent = false }: { transparent?: boolean } = {},
): string {
  return [
    CHAT_BOTTOM_NOTICE_ACTION_BUTTON_BASE,
    transparent ? "bg-transparent" : null,
    chatBottomNoticeActionClassName(tone),
  ]
    .filter(Boolean)
    .join(" ");
}

export function chatBottomNoticeBarClassName({
  joinedAbove = false,
  joinedBelow = false,
  gap = "2",
  paddingX = "composer",
  paddingY = "compact",
  shellOnly = false,
  className = "",
}: {
  joinedAbove?: boolean;
  joinedBelow?: boolean;
  gap?: "2" | "3";
  paddingX?: "composer" | "wide";
  paddingY?: "compact" | "alert";
  /** When true, only outer surface + round/border — content uses preface strip. */
  shellOnly?: boolean;
  className?: string;
}): string {
  const round: ChatBottomNoticeBarRound = joinedAbove
    ? joinedBelow
      ? "none"
      : "bottom"
    : joinedBelow
      ? "top"
      : "all";

  return [
    shellOnly ? CHAT_BOTTOM_NOTICE_BAR_SHELL : CHAT_BOTTOM_NOTICE_BAR_BASE,
    !shellOnly && (gap === "3" ? "gap-3" : "gap-2"),
    !shellOnly && (paddingX === "wide" ? "px-6" : CHAT_BOTTOM_COMPOSER_CONTENT_INSET_X),
    !shellOnly && (paddingY === "alert" ? "py-2.5" : "py-1.5"),
    CHAT_BOTTOM_NOTICE_BAR_ROUND[round],
    joinedAbove || joinedBelow ? "border-b border-border-subtle" : "border border-border-subtle",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
