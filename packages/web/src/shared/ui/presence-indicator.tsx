/**
 * PresenceIndicator — colored dot showing user online/idle/offline status.
 *
 * Sizes: sm (8px), md (10px), lg (12px).
 * Colors: green (active), yellow (idle), gray (offline).
 * Active state has a subtle pulse animation.
 */
import React from "react";
import { t } from "~/i18n/i18n";
import type { PresenceIndicatorProps, PresenceVisual } from "./presence-indicator.types";

export type { PresenceVisual } from "./presence-indicator.types";

const SIZE_MAP = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
} as const;

const COLOR_MAP: Record<NonNullable<PresenceVisual>, string> = {
  active: "bg-call-green",
  idle: "bg-indicator-yellow",
  offline: "bg-text-muted",
};

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
  status,
  size = "md",
  className = "",
  withBorder = true,
}) => {
  if (!status) return null;

  const sizeClass = SIZE_MAP[size];
  const colorClass = COLOR_MAP[status];
  const borderClass = withBorder ? "ring-2 ring-bg" : "";
  const pulseClass = status === "active" ? "animate-pulse" : "";

  return (
    <span
      className={`inline-block shrink-0 rounded-full ${sizeClass} ${colorClass} ${borderClass} ${pulseClass} ${className}`}
      role="status"
      aria-label={
        status === "active"
          ? t("presence.online")
          : status === "idle"
            ? t("presence.away")
            : t("presence.offline")
      }
      data-presence={status}
    />
  );
};
