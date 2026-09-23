import { useCallback, useEffect, useRef } from "react";
import type { DragEvent, RefObject } from "react";

const WORKSPACE_INLINE_IMAGE_DRAG_TYPE = "application/x-workspace-inline-image";
const TEXT_LAYOUT_PROPERTIES = [
  "direction",
  "font-family",
  "font-feature-settings",
  "font-kerning",
  "font-size",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-weight",
  "letter-spacing",
  "line-height",
  "overflow-wrap",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "tab-size",
  "text-align",
  "text-indent",
  "text-transform",
  "white-space",
  "word-break",
  "word-spacing",
] as const;

interface ActiveDropCaret {
  caret: HTMLDivElement;
  mirror: HTMLDivElement;
  pointerX: number;
  pointerY: number;
  textarea: HTMLTextAreaElement;
}

function hasInlineImageDrag(dataTransfer: DataTransfer): boolean {
  try {
    return Array.from(dataTransfer.types).includes(WORKSPACE_INLINE_IMAGE_DRAG_TYPE);
  } catch {
    return false;
  }
}

function createDropCaretElements(textarea: HTMLTextAreaElement): ActiveDropCaret {
  const document = textarea.ownerDocument;
  const mirror = document.createElement("div");
  mirror.dataset.composerDropCaretMirror = "";
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "fixed",
    boxSizing: "border-box",
    margin: "0",
    border: "0",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
  });

  const caret = document.createElement("div");
  caret.dataset.composerDropCaret = "";
  caret.setAttribute("aria-hidden", "true");
  Object.assign(caret.style, {
    position: "fixed",
    width: "1px",
    pointerEvents: "none",
    zIndex: "2147483647",
  });

  document.body.append(mirror, caret);
  return { caret, mirror, pointerX: 0, pointerY: 0, textarea };
}

function syncMirror(active: ActiveDropCaret): CSSStyleDeclaration {
  const { mirror, textarea } = active;
  const styles = textarea.ownerDocument.defaultView?.getComputedStyle(textarea);
  if (styles == null) return mirror.style;

  for (const property of TEXT_LAYOUT_PROPERTIES) {
    mirror.style.setProperty(property, styles.getPropertyValue(property));
  }

  const bounds = textarea.getBoundingClientRect();
  Object.assign(mirror.style, {
    left: `${bounds.left + textarea.clientLeft}px`,
    top: `${bounds.top + textarea.clientTop}px`,
    width: `${textarea.clientWidth}px`,
    height: `${textarea.clientHeight}px`,
  });
  mirror.textContent = `${textarea.value}\u200b`;
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;
  return styles;
}

function measureDropCaret(active: ActiveDropCaret): DOMRect | null {
  const { mirror, pointerX, pointerY, textarea } = active;
  const document = textarea.ownerDocument;
  mirror.style.pointerEvents = "auto";
  try {
    const position = document.caretPositionFromPoint?.(pointerX, pointerY);
    if (position != null && mirror.contains(position.offsetNode)) {
      return position.getClientRect();
    }

    const caretRangeFromPoint = Reflect.get(document, "caretRangeFromPoint") as
      | ((x: number, y: number) => Range | null)
      | undefined;
    const range = caretRangeFromPoint?.call(document, pointerX, pointerY);
    if (range == null || !mirror.contains(range.startContainer)) return null;
    return range.getBoundingClientRect();
  } finally {
    mirror.style.pointerEvents = "none";
  }
}

export function useMessageComposerInlineImageDropCaret(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
) {
  const activeRef = useRef<ActiveDropCaret | null>(null);

  const clear = useCallback(() => {
    activeRef.current?.caret.remove();
    activeRef.current?.mirror.remove();
    activeRef.current = null;
  }, []);

  const show = useCallback(
    (textarea: HTMLTextAreaElement, pointerX: number, pointerY: number) => {
      if (activeRef.current?.textarea !== textarea) {
        clear();
        activeRef.current = createDropCaretElements(textarea);
      }

      const active = activeRef.current;
      if (active == null) return;
      active.pointerX = pointerX;
      active.pointerY = pointerY;
      const textareaStyles = syncMirror(active);
      const caretBounds = measureDropCaret(active);
      if (caretBounds == null || caretBounds.height <= 0) {
        active.caret.style.display = "none";
        return;
      }

      const textareaBounds = textarea.getBoundingClientRect();
      const visibleTop = textareaBounds.top + textarea.clientTop;
      const visibleBottom = visibleTop + textarea.clientHeight;
      const top = Math.max(caretBounds.top, visibleTop);
      const bottom = Math.min(caretBounds.bottom, visibleBottom);
      if (bottom <= top) {
        active.caret.style.display = "none";
        return;
      }

      const caretColor =
        textareaStyles.caretColor && textareaStyles.caretColor !== "auto"
          ? textareaStyles.caretColor
          : textareaStyles.color;
      Object.assign(active.caret.style, {
        display: "block",
        left: `${caretBounds.left}px`,
        top: `${top}px`,
        height: `${bottom - top}px`,
        backgroundColor: caretColor,
      });
    },
    [clear],
  );

  useEffect(() => {
    const document = textareaRef.current?.ownerDocument;
    if (document == null) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    document.addEventListener("dragend", clear, true);
    document.addEventListener("drop", clear, true);
    document.addEventListener("keydown", handleEscape, true);
    document.defaultView?.addEventListener("blur", clear);
    return () => {
      clear();
      document.removeEventListener("dragend", clear, true);
      document.removeEventListener("drop", clear, true);
      document.removeEventListener("keydown", handleEscape, true);
      document.defaultView?.removeEventListener("blur", clear);
    };
  }, [clear, textareaRef]);

  return {
    onDragOver: (event: DragEvent<HTMLTextAreaElement>) => {
      if (!hasInlineImageDrag(event.dataTransfer)) return;
      show(event.currentTarget, event.clientX, event.clientY);
    },
    onDragLeave: clear,
    onDrop: clear,
    onScroll: () => {
      const active = activeRef.current;
      if (active != null) show(active.textarea, active.pointerX, active.pointerY);
    },
  };
}
