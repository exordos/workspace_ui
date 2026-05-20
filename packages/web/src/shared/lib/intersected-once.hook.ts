/**
 * Fires once when an element enters the scroll viewport (with margin).
 * Used to defer network work (link previews, protected uploads) until near-visible.
 */
import { useEffect, useState, type RefObject } from "react";

/** Preload slightly before the message row enters the feed viewport. */
export const MESSAGE_LIST_IO_ROOT_MARGIN = "200px 0px";

export interface UseIntersectedOnceOptions {
  rootSelector?: string;
  rootMargin?: string;
}

/**
 * Returns true after `elementRef` has intersected the scroll root at least once.
 * Falls back to true when IO is unavailable or the scroll root is missing.
 */
export function useIntersectedOnce(
  elementRef: RefObject<HTMLElement | null>,
  options?: UseIntersectedOnceOptions,
): boolean {
  const rootSelector = options?.rootSelector ?? '[role="feed"]';
  const rootMargin = options?.rootMargin ?? MESSAGE_LIST_IO_ROOT_MARGIN;
  const [intersected, setIntersected] = useState(false);

  useEffect(() => {
    if (intersected) return;

    const element = elementRef.current;
    if (element == null) return;

    const scrollRoot = element.closest<HTMLElement>(rootSelector);
    if (
      scrollRoot == null ||
      typeof IntersectionObserver === "undefined" ||
      typeof IntersectionObserver !== "function"
    ) {
      setIntersected(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setIntersected(true);
          observer.disconnect();
          return;
        }
      },
      { root: scrollRoot, rootMargin, threshold: 0 },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [elementRef, intersected, rootSelector, rootMargin]);

  return intersected;
}
