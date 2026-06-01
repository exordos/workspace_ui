import React from "react";
import { t } from "~/i18n/i18n";
import { Spinner } from "~/shared/ui/spinner.ui";
import type {
  FloatingLoadingOverlayPosition,
  FloatingLoadingOverlayProps,
} from "./floating-loading-overlay.types";

const ROOT_BASE_CLASS = "pointer-events-none absolute z-float flex";
const ROOT_POSITION_CLASS: Record<FloatingLoadingOverlayPosition, string> = {
  "top-left": "top-2 left-2",
  "top-center": "inset-x-0 top-2 justify-center",
  "top-right": "top-2 right-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-center": "inset-x-0 bottom-2 justify-center",
  "bottom-right": "bottom-2 right-2",
  "left-center": "inset-y-0 left-2 items-center",
  "right-center": "inset-y-0 right-2 items-center",
};
const CHIP_CLASS =
  "flex items-center gap-2 rounded-full border border-border-subtle bg-bg-elevated/95 px-2.5 py-1 text-xs text-text-muted shadow-sm";
export const FloatingLoadingOverlay: React.FC<FloatingLoadingOverlayProps> = ({
  visible,
  label = t("app.loading"),
  position = "top-center",
  className = "",
}) => {
  if (!visible) return null;

  return (
    <div className={`${ROOT_BASE_CLASS} ${ROOT_POSITION_CLASS[position]} ${className}`.trim()}>
      <div role="status" aria-live="polite" className={CHIP_CLASS}>
        <Spinner size="sm" />
        <span>{label}</span>
      </div>
    </div>
  );
};
