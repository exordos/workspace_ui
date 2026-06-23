import React from "react";
import { t } from "~/i18n/i18n";
import { isElectron, isElectronDarwin } from "~/shared/lib/electron";
import { ELECTRON_MAC_TITLEBAR_STRIP_CLASS } from "~/shared/lib/electron-title-bar.lib";
import { Icon } from "~/shared/ui/icon";
import type { LayoutTopBannerItem, LayoutTopBannerSeverity } from "./layout-top-banner.types";

interface LayoutTopBannerProps {
  item: LayoutTopBannerItem | null;
  expanded: boolean;
  persistentExpanded: boolean;
  onExpand: () => void;
  onCollapsedFocus?: () => void;
  onCollapse: () => void;
  onTogglePersistentExpanded: () => void;
  onPreviewLeave?: () => void;
  collapsedTriggerRef?: React.RefObject<HTMLButtonElement | null>;
  collapseButtonRef?: React.RefObject<HTMLButtonElement | null>;
  primaryActionRef?: React.RefObject<HTMLButtonElement | null>;
}

function resolveStripClassName(severity: LayoutTopBannerSeverity): string {
  return severity === "critical" ? "bg-notice-base" : "bg-accent";
}

function resolveExpandedClassName(severity: LayoutTopBannerSeverity): string {
  if (severity === "critical") {
    return "border-notice-base/50 bg-bg-elevated text-notice-base";
  }
  return "border-accent/40 bg-bg-elevated text-text-primary";
}

function resolveLiveRegionProps(severity: LayoutTopBannerSeverity): {
  role: "alert" | "status";
  ariaLive: "assertive" | "polite";
} {
  if (severity === "critical") {
    return { role: "alert", ariaLive: "assertive" };
  }
  return { role: "status", ariaLive: "polite" };
}

export const LayoutTopBanner = React.memo<LayoutTopBannerProps>(function LayoutTopBanner({
  item,
  expanded,
  persistentExpanded,
  onExpand,
  onCollapsedFocus,
  onCollapse,
  onTogglePersistentExpanded,
  onPreviewLeave,
  collapsedTriggerRef,
  collapseButtonRef,
  primaryActionRef,
}) {
  const electronChrome = isElectron();
  const macElectronChrome = isElectronDarwin();

  if (item == null) {
    return null;
  }

  const stripClassName = resolveStripClassName(item.severity);
  const expandedClassName = resolveExpandedClassName(item.severity);
  const liveRegionProps = resolveLiveRegionProps(item.severity);
  const contentInsetClassName = macElectronChrome
    ? "pl-24 pr-6 sm:pl-28 sm:pr-8"
    : electronChrome
      ? "px-8 sm:px-10"
      : "px-4 sm:px-6";

  return (
    <div
      data-testid="layout-top-banner-host"
      className="pointer-events-none absolute inset-x-0 top-0 z-overlay"
    >
      {macElectronChrome ? (
        <div
          className={`electron-drag pointer-events-none ${ELECTRON_MAC_TITLEBAR_STRIP_CLASS}`}
          aria-hidden
        />
      ) : null}
      {expanded ? (
        <section
          data-testid="layout-top-banner-expanded"
          className={`pointer-events-auto border-b py-3 shadow-lg ${expandedClassName} ${contentInsetClassName}`}
          role={liveRegionProps.role}
          aria-live={liveRegionProps.ariaLive}
          aria-atomic="true"
          onMouseLeave={() => {
            if (persistentExpanded) {
              return;
            }
            onPreviewLeave?.();
          }}
          onBlur={(event) => {
            if (persistentExpanded) {
              return;
            }
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
              return;
            }
            onPreviewLeave?.();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !item.canCollapse) {
              return;
            }
            event.preventDefault();
            onCollapse();
          }}
        >
          <div className="mx-auto flex w-full max-w-main-workspace items-center gap-3">
            <p className="min-w-0 flex-1 text-center text-sm font-semibold leading-snug sm:text-base">
              {item.message}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {item.onPrimaryAction != null && item.primaryActionLabel != null ? (
                <button
                  ref={primaryActionRef}
                  type="button"
                  onClick={item.onPrimaryAction}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                >
                  {item.primaryActionLabel}
                </button>
              ) : null}
              {item.canCollapse ? (
                <button
                  ref={collapseButtonRef}
                  type="button"
                  aria-label={
                    persistentExpanded
                      ? t("a11y.hideConnectionStatus")
                      : t("a11y.keepConnectionStatusExpanded")
                  }
                  onClick={onTogglePersistentExpanded}
                  className="inline-flex h-7 w-7 items-center justify-center text-text-primary transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                >
                  <Icon
                    name={persistentExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    className="text-current"
                  />
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <button
          ref={collapsedTriggerRef}
          data-testid="layout-top-banner-collapsed"
          type="button"
          aria-label={t("a11y.showConnectionStatus")}
          onMouseEnter={onExpand}
          onFocus={onCollapsedFocus ?? onExpand}
          onClick={onExpand}
          className="pointer-events-auto block w-full pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          <span aria-hidden className={`block h-1.5 w-full ${stripClassName}`} />
          <span className="sr-only">{item.message}</span>
        </button>
      )}
    </div>
  );
});
