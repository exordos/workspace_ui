import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactElement,
  ReactNode,
} from "react";

interface AppTooltipProps {
  children: ReactElement<{ "aria-describedby"?: string }>;
  content: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  size?: "default" | "compact";
  textTone?: "default" | "primary";
  closeDelay?: number;
  className?: string;
  wrapperClassName?: string;
}

const VIEWPORT_MARGIN = 12;
const TRIGGER_GAP = 8;
const DEFAULT_CLOSE_DELAY = 120;

/** Wrap a single focusable trigger; tooltip content should not contain controls. */
export function AppTooltip({
  children,
  content,
  side = "bottom",
  align = "end",
  size = "default",
  textTone = "default",
  closeDelay = DEFAULT_CLOSE_DELAY,
  className = "",
  wrapperClassName = "",
}: Readonly<AppTooltipProps>) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const show = () => {
    cancelClose();
    setOpen(true);
  };

  const closeIfInactive = () => {
    if (!hoveredRef.current && !focusedRef.current) {
      setOpen(false);
      setPosition(null);
    }
  };

  const scheduleClose = () => {
    cancelClose();
    if (closeDelay <= 0) {
      closeIfInactive();
      return;
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      closeIfInactive();
    }, closeDelay);
  };

  const scrollWithKeyboard = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    const panel = panelRef.current;
    if (
      !open ||
      !focusedRef.current ||
      !panel ||
      panel.scrollHeight <= panel.clientHeight ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;

    const maxScroll = panel.scrollHeight - panel.clientHeight;
    let nextScroll = panel.scrollTop;
    switch (event.key) {
      case "ArrowDown":
        nextScroll += 40;
        break;
      case "ArrowUp":
        nextScroll -= 40;
        break;
      case "PageDown":
        nextScroll += panel.clientHeight;
        break;
      case "PageUp":
        nextScroll -= panel.clientHeight;
        break;
      case "Home":
        nextScroll = 0;
        break;
      case "End":
        nextScroll = maxScroll;
        break;
      default:
        return;
    }
    // Read clipped content without moving focus away from the trigger.
    panel.scrollTop = Math.max(0, Math.min(nextScroll, maxScroll));
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => () => cancelClose(), []);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!trigger || !panel) return;

      const bottomSpace = window.innerHeight - trigger.bottom - TRIGGER_GAP - VIEWPORT_MARGIN;
      const topSpace = trigger.top - TRIGGER_GAP - VIEWPORT_MARGIN;
      const desiredHeight = Math.max(panel.height, panelRef.current?.scrollHeight ?? 0);
      const useBottom =
        side === "bottom"
          ? bottomSpace >= desiredHeight || bottomSpace >= topSpace
          : !(topSpace >= desiredHeight || topSpace >= bottomSpace);
      const maxHeight = Math.max(0, useBottom ? bottomSpace : topSpace);
      const height = Math.min(desiredHeight, maxHeight);
      let alignedLeft = trigger.left;
      if (align === "end") alignedLeft = trigger.right - panel.width;
      if (align === "center") alignedLeft = trigger.left + (trigger.width - panel.width) / 2;
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(alignedLeft, window.innerWidth - panel.width - VIEWPORT_MARGIN),
      );
      const top = useBottom ? trigger.bottom + TRIGGER_GAP : trigger.top - TRIGGER_GAP - height;
      setPosition({ left, top: Math.max(VIEWPORT_MARGIN, top), maxHeight });
    };

    updatePosition();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (triggerRef.current) observer?.observe(triggerRef.current);
    if (panelRef.current) observer?.observe(panelRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      cancelClose();
      setOpen(false);
      setPosition(null);
    };
    document.addEventListener("keydown", dismissOnEscape);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open, side, align, size]);

  const describedBy = [children.props["aria-describedby"], open ? id : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <span
        ref={triggerRef}
        role="presentation"
        className={`inline-flex shrink-0 ${wrapperClassName}`.trim()}
        onKeyDown={scrollWithKeyboard}
        onPointerEnter={() => {
          hoveredRef.current = true;
          show();
        }}
        onPointerLeave={() => {
          hoveredRef.current = false;
          scheduleClose();
        }}
        onFocus={() => {
          focusedRef.current = true;
          show();
        }}
        onBlur={() => {
          focusedRef.current = false;
          scheduleClose();
        }}
      >
        {cloneElement(children, { "aria-describedby": describedBy || undefined })}
      </span>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={id}
              role="tooltip"
              tabIndex={-1}
              className={`fixed z-toast overflow-y-auto rounded-xl border border-border-subtle bg-bg-elevated text-sm leading-relaxed shadow-xl ${
                size === "compact" ? "w-max break-words px-2 py-1" : "w-80 px-4 py-3"
              } ${textTone === "primary" ? "text-text-primary" : "text-text-secondary"} ${className}`.trim()}
              style={{
                maxWidth: "calc(100vw - 24px)",
                visibility: position ? "visible" : "hidden",
                ...position,
              }}
              onPointerEnter={() => {
                hoveredRef.current = true;
                cancelClose();
              }}
              onPointerLeave={() => {
                hoveredRef.current = false;
                scheduleClose();
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
