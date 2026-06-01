import { useEffect } from "react";
import type { RefObject } from "react";

export interface UseDismissOnOutsideAndEscapeOptions {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}

/**
 * Closes floating UI on mousedown outside `containerRef` or Escape.
 * Pair with a full-screen anchored popover shell so backdrop clicks stay inside the ref.
 */
export function useDismissOnOutsideAndEscape({
  enabled,
  containerRef,
  onDismiss,
}: UseDismissOnOutsideAndEscapeOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      onDismiss();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onDismiss();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [containerRef, enabled, onDismiss]);
}
