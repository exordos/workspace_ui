/**
 * PresenceIndicator — online/idle/offline dot, or a deactivated-account block badge.
 *
 * Sizes: xs (6px), sm (8px), md (10px), lg (12px) for dots.
 * Colors: green (active), orange (idle), gray (offline).
 *
 * The dot is static. It renders once per roster row, per message author and per
 * mention candidate, so an infinite animation on it keeps the compositor busy for
 * as long as the app is open — see `docs/POWER_BUDGET.md`.
 */
import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "./icon";
import type { PresenceIndicatorProps, PresenceVisual } from "./presence-indicator.types";

export type { PresenceVisual } from "./presence-indicator.types";

const SIZE_MAP = {
  xs: "h-1.5 w-1.5",
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
} as const;

const COLOR_MAP: Record<NonNullable<PresenceVisual>, string> = {
  active: "bg-indicator-green",
  idle: "bg-indicator-orange",
  offline: "bg-text-muted",
};

const BLOCK_ICON_PX = { xs: 12, sm: 12, md: 14, lg: 14 } as const;

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
  status,
  deactivated = false,
  size = "md",
  className = "",
  withBorder = true,
}) => {
  if (deactivated) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-card-bg ring-2 ring-bg ${className}`.trim()}
        role="status"
        aria-label={t("dm.partnerBlocked")}
      >
        <Icon name="block" size={BLOCK_ICON_PX[size]} className="text-text-muted" />
      </span>
    );
  }

  if (!status) return null;

  const sizeClass = SIZE_MAP[size];
  const colorClass = COLOR_MAP[status];
  let borderClass = "";
  if (withBorder) {
    borderClass = size === "xs" ? "ring-1 ring-bg" : "ring-2 ring-bg";
  }

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
      className={`inline-block shrink-0 rounded-full ${sizeClass} ${colorClass} ${borderClass} ${className}`}
      role="status"
      aria-label={ariaLabel}
      data-presence={status}
    />
  );
};
