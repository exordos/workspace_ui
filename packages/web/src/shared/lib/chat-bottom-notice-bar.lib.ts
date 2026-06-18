/**
 * Shared chrome for notice bars above or inside the chat composer.
 *
 * Used by chat-page inline alerts, delete confirm bar, and composer edit preface.
 */

export const CHAT_BOTTOM_NOTICE_BAR_BASE =
  "flex flex-shrink-0 items-center border border-border-subtle bg-[color-mix(in_srgb,var(--color-notice-base)_10%,var(--color-bg))] px-4 py-2";

export const CHAT_BOTTOM_NOTICE_BAR_ROUND = {
  all: "rounded-xl",
  top: "rounded-t-xl",
  bottom: "rounded-b-xl",
} as const;

export type ChatBottomNoticeBarRound = keyof typeof CHAT_BOTTOM_NOTICE_BAR_ROUND;

export function chatBottomNoticeBarClassName({
  round = "all",
  divided = false,
  gap = "2",
  className = "",
}: {
  round?: ChatBottomNoticeBarRound;
  divided?: boolean;
  gap?: "2" | "3";
  className?: string;
}): string {
  return [
    CHAT_BOTTOM_NOTICE_BAR_BASE,
    gap === "3" ? "gap-3" : "gap-2",
    CHAT_BOTTOM_NOTICE_BAR_ROUND[round],
    divided ? "border-t-0" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
