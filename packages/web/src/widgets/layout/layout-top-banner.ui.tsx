import React from "react";
import { t } from "~/i18n/i18n";
import { isElectron, isElectronDarwin } from "~/shared/lib/electron";
import { ELECTRON_MAC_TITLEBAR_STRIP_CLASS } from "~/shared/lib/electron-title-bar.lib";
import { Icon } from "~/shared/ui/icon";
import type { LayoutTopBannerItem, LayoutTopBannerSeverity } from "./layout-top-banner.types";

interface LayoutTopBannerProps {
  item: LayoutTopBannerItem | null;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  collapsedTriggerRef?: React.RefObject<HTMLButtonElement | null>;
  collapseButtonRef?: React.RefObject<HTMLButtonElement | null>;
  primaryActionRef?: React.RefObject<HTMLButtonElement | null>;
  secondaryActionRef?: React.RefObject<HTMLButtonElement | null>;
}

function resolveStripClassName(severity: LayoutTopBannerSeverity): string {
  return severity === "critical" ? "bg-notice-base" : "bg-accent";
}

function resolveExpandedClassName(severity: LayoutTopBannerSeverity): string {
  if (severity === "critical") {
    return "border-notice-base/50 bg-bg-elevated text-text-primary";
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
  onExpand,
  onCollapse,
  collapsedTriggerRef,
  collapseButtonRef,
  primaryActionRef,
  secondaryActionRef,
}) {
  const electronChrome = isElectron();
  const macElectronChrome = isElectronDarwin();

  if (item == null) {
    return null;
  }

  const stripClassName = resolveStripClassName(item.severity);
  const expandedClassName = resolveExpandedClassName(item.severity);
  const liveRegionProps = resolveLiveRegionProps(item.severity);
  const title = item.title ?? item.message;
  const contentInsetClassName = electronChrome ? "px-8 sm:px-10" : "px-4 sm:px-6";
  const macTitlebarStripClassName =
    expanded || !macElectronChrome
      ? `electron-drag pointer-events-none ${ELECTRON_MAC_TITLEBAR_STRIP_CLASS}`
      : `electron-drag pointer-events-none ${ELECTRON_MAC_TITLEBAR_STRIP_CLASS} ${stripClassName}`;

  return (
    <div
      data-testid="layout-top-banner-host"
      className="pointer-events-none absolute inset-x-0 top-0 z-overlay"
    >
      {macElectronChrome ? (
        <div
          data-testid="layout-top-banner-mac-titlebar-strip"
          className={macTitlebarStripClassName}
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
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !item.canCollapse) {
              return;
            }
            event.preventDefault();
            onCollapse();
          }}
        >
          <div className="mx-auto flex w-full max-w-main-workspace items-start gap-3">
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold leading-snug sm:text-base">{title}</p>
              {item.description != null ? (
                <p className="mt-1 text-xs text-text-muted sm:text-sm">{item.description}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {item.onSecondaryAction != null && item.secondaryActionLabel != null ? (
                <button
                  ref={secondaryActionRef}
                  type="button"
                  onClick={item.onSecondaryAction}
                  disabled={item.secondaryActionDisabled}
                  className="rounded-lg border border-border-subtle bg-card-bg px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-50"
                >
                  {item.secondaryActionLabel}
                </button>
              ) : null}
              {item.onPrimaryAction != null && item.primaryActionLabel != null ? (
                <button
                  ref={primaryActionRef}
                  type="button"
                  onClick={item.onPrimaryAction}
                  disabled={item.primaryActionDisabled}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-50"
                >
                  {item.primaryActionLabel}
                </button>
              ) : null}
              {item.canCollapse ? (
                <button
                  ref={collapseButtonRef}
                  type="button"
                  aria-label={t("a11y.hideTopBanner")}
                  onClick={onCollapse}
                  className="inline-flex h-7 w-7 items-center justify-center text-text-primary transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                >
                  <Icon name="chevron-up" size={16} className="text-current" />
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
          aria-label={t("a11y.showTopBanner")}
          onClick={onExpand}
          className="group pointer-events-auto block w-full cursor-pointer pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          <span
            aria-hidden
            className={`block h-1.5 w-full opacity-95 transition-[height,opacity] duration-150 group-hover:h-2.5 group-hover:opacity-100 group-focus-visible:h-2.5 group-focus-visible:opacity-100 ${stripClassName}`}
          />
          <span className="sr-only">{title}</span>
        </button>
      )}
    </div>
  );
});
