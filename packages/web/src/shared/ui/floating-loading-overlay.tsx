import React from "react";
import { t } from "~/i18n/i18n";
import type { FloatingLoadingOverlayProps } from "./floating-loading-overlay.types";

const ROOT_CLASS = "pointer-events-none absolute inset-x-0 top-2 z-float flex justify-center";
const CHIP_CLASS =
  "flex items-center gap-2 rounded-full border border-border-subtle bg-bg-elevated/95 px-2.5 py-1 text-xs text-text-muted shadow-sm";
const SPINNER_CLASS =
  "h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-subtle border-t-accent";

export const FloatingLoadingOverlay: React.FC<FloatingLoadingOverlayProps> = ({
  visible,
  label = t("app.loading"),
  className = "",
}) => {
  if (!visible) return null;

  return (
    <div className={`${ROOT_CLASS} ${className}`}>
      <div role="status" aria-live="polite" className={CHIP_CLASS}>
        <span aria-hidden className={SPINNER_CLASS} />
        <span>{label}</span>
      </div>
    </div>
  );
};
