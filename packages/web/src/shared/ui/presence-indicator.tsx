/**
 * PresenceIndicator — online/idle/offline dot, or a deactivated-account block badge.
 *
 * Sizes: sm (8px), md (10px), lg (12px) for dots; block icon scales with the same breakpoint.
 * Colors: green (active), yellow (idle), gray (offline).
 * Active state has a subtle pulse animation.
 */
import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "./icon";
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

const HEADER_COLOR_MAP: Record<NonNullable<PresenceVisual>, string> = {
  active: "bg-indicator-green",
  idle: "bg-indicator-orange",
  offline: "bg-text-muted",
};

const BLOCK_ICON_PX = { sm: 12, md: 14, lg: 14 } as const;

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
  status,
  deactivated = false,
  size = "md",
  className = "",
  withBorder = true,
  tone = "default",
  pulse,
}) => {
  if (deactivated) {
    const ringClass =
      tone === "header"
        ? "rounded-full bg-card-bg ring-2 ring-border-subtle"
        : "rounded-full bg-card-bg ring-2 ring-bg";
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${ringClass} ${className}`.trim()}
        role="status"
        aria-label={t("dm.partnerBlocked")}
      >
        <Icon name="block" size={BLOCK_ICON_PX[size]} className="text-text-muted" />
      </span>
    );
  }

  if (!status) return null;

  const sizeClass = SIZE_MAP[size];
  const colorClass = (tone === "header" ? HEADER_COLOR_MAP : COLOR_MAP)[status];
  const borderClass = withBorder ? "ring-2 ring-bg" : "";
  const shouldPulse = pulse ?? tone === "default";
  const pulseClass = shouldPulse && status === "active" ? "animate-pulse" : "";

  let ariaLabel: string;
  if (status === "active") {
    ariaLabel = t("presence.online");
  } else if (status === "idle") {
    ariaLabel = t("presence.away");
  } else {
    ariaLabel = t("presence.offline");
  }

  return (
    <span
      className={`inline-block shrink-0 rounded-full ${sizeClass} ${colorClass} ${borderClass} ${pulseClass} ${className}`}
      role="status"
      aria-label={ariaLabel}
      data-presence={status}
    />
  );
};
