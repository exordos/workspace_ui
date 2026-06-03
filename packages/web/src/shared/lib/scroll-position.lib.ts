/** Programmatic list scroll-to-bottom (instant auto-scroll vs smooth user-triggered). */
export type ScrollToBottomBehavior = "instant" | "smooth";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function resolveScrollBehavior(behavior: ScrollToBottomBehavior): ScrollToBottomBehavior {
  if (behavior === "smooth" && prefersReducedMotion()) {
    return "instant";
  }

  return behavior;
}

/** Default `instant` for auto-scroll; pass `smooth` only for explicit "scroll down" actions. */
export function scrollToBottom(
  el: HTMLElement | null,
  behavior: ScrollToBottomBehavior = "instant",
): void {
  if (!el) return;

  el.scrollTo({
    top: el.scrollHeight,
    behavior: resolveScrollBehavior(behavior),
  });
}
