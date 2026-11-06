import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "~/i18n/i18n";
import { computeFloatingPickerPosition } from "~/shared/lib/floating-panel-position.lib";
import { AnchoredPopover } from "~/shared/ui/anchored-popover";
import { DateTimePicker } from "~/shared/ui/date-time-picker";
import type { CSSProperties } from "react";

const PANEL_WIDTH = 371;
const PANEL_FALLBACK_HEIGHT = 490;

function resolvePanelStyle(anchor: HTMLElement, height: number): CSSProperties {
  if (typeof window === "undefined") return {};
  const { left, top, width } = computeFloatingPickerPosition({
    anchorRect: anchor.getBoundingClientRect(),
    pickerWidth: PANEL_WIDTH,
    pickerHeight: height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
  return { left, top, width };
}

export interface WorkspaceMessageTimeViewProps {
  /** Normalized UTC instant stored by the rendered time chip. */
  utc: string;
  anchor: HTMLElement;
  onClose: () => void;
}

/** Read-only view of the instant stored in a message time chip. */
export function WorkspaceMessageTimeView({
  utc,
  anchor,
  onClose,
}: Readonly<WorkspaceMessageTimeViewProps>) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState(() => resolvePanelStyle(anchor, PANEL_FALLBACK_HEIGHT));
  useLayoutEffect(() => {
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });
    const update = () =>
      setStyle(resolvePanelStyle(anchor, panel?.offsetHeight ?? PANEL_FALLBACK_HEIGHT));
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (panel != null) observer?.observe(panel);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor]);

  const date = new Date(utc);
  if (!Number.isFinite(date.getTime())) return null;

  return createPortal(
    <AnchoredPopover
      open
      onClose={() => {
        onClose();
        anchor.focus({ preventScroll: true });
      }}
      panelStyle={{ ...style, maxHeight: "calc(100dvh - 16px)", overflowY: "auto" }}
      ariaLabel={t("dateTimePicker.label")}
    >
      <div ref={panelRef} tabIndex={-1}>
        <DateTimePicker
          readOnly
          value={date}
          onValueChange={() => undefined}
          showSeconds={date.getSeconds() !== 0 || date.getMilliseconds() !== 0}
          className="!w-full"
          datePickerProps={{ className: "!rounded-none !border-0" }}
          timePickerProps={{ className: "!rounded-none !border-x-0 !border-b-0" }}
        />
      </div>
    </AnchoredPopover>,
    document.body,
  );
}
