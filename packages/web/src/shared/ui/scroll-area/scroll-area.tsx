import React from "react";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import type { ScrollAreaProps } from "./scroll-area.types";

const AXIS_CLASSES = {
  x: "min-w-0 overflow-x-auto overflow-y-hidden",
  y: "overflow-y-auto",
  both: "min-w-0 overflow-auto",
};

export const ScrollArea: React.FC<ScrollAreaProps> = ({
  children,
  className = "",
  as: Tag = "div",
  axis = "y",
  scrollbar = "visible",
  horizontalWheel = true,
  ...rest
}) => {
  const attachScrollArea = React.useCallback(
    (element: HTMLElement | null) => {
      if (element == null || axis !== "x" || !horizontalWheel) return;

      const handleWheel = (event: WheelEvent) => {
        if (
          event.defaultPrevented ||
          !event.cancelable ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey ||
          event.deltaX !== 0 ||
          !Number.isFinite(event.deltaY) ||
          event.deltaY === 0
        )
          return;

        const maxScroll = element.scrollWidth - element.clientWidth;
        if (maxScroll <= 0) return;

        const styles = getComputedStyle(element);
        let delta = event.deltaY;
        if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
          delta *= Number.parseFloat(styles.lineHeight) || 16;
        } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
          delta *= element.clientWidth;
        }

        const direction = styles.direction === "rtl" ? -1 : 1;
        const previous = element.scrollLeft;
        const next = Math.min(maxScroll, Math.max(0, previous * direction + delta));
        element.scrollLeft = next * direction;
        if (element.scrollLeft !== previous) event.preventDefault();
      };

      // A non-passive listener lets the outer container scroll when this area reaches an edge.
      element.addEventListener("wheel", handleWheel, { passive: false });
      return () => element.removeEventListener("wheel", handleWheel);
    },
    [axis, horizontalWheel],
  );

  return (
    <Tag
      ref={attachScrollArea}
      className={`min-h-0 ${AXIS_CLASSES[axis]} ${scrollbar === "hidden" ? "scrollbar-none" : SCROLL_AREA_CLASS} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
};
