import React, { useRef } from "react";
import { useDismissOnOutsideAndEscape } from "~/shared/lib/use-dismiss-on-outside-escape.hook";
import type { AnchoredPopoverProps } from "./anchored-popover.types";

const DEFAULT_PANEL_CLASS =
  "pointer-events-auto fixed z-modal overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl";

export const AnchoredPopover: React.FC<AnchoredPopoverProps> = ({
  open,
  onClose,
  panelStyle,
  panelClassName = "",
  ariaLabel,
  children,
  testId,
  backdropTestId,
}) => {
  const shellRef = useRef<HTMLDivElement>(null);

  useDismissOnOutsideAndEscape({
    enabled: open,
    containerRef: shellRef,
    onDismiss: onClose,
  });

  if (!open) return null;

  return (
    <div ref={shellRef} className="pointer-events-none fixed inset-0 z-dropdown">
      <div
        className="pointer-events-auto fixed inset-0"
        aria-hidden
        data-testid={backdropTestId}
        onClick={onClose}
      />
      <div
        className={`${DEFAULT_PANEL_CLASS} ${panelClassName}`.trim()}
        style={panelStyle}
        role="dialog"
        aria-label={ariaLabel}
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
};
