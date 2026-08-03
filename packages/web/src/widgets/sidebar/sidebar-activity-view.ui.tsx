import React from "react";
import { Link, useLocation } from "react-router-dom";
import { t } from "~/i18n/i18n";
import {
  parseWorkspaceMessengerRoute,
  workspaceActivityRoute,
  workspaceFeedRoute,
  workspaceInboxRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { type MY_ACTIVITY, VISIBLE_MY_ACTIVITY } from "./sidebar.lib";

type SidebarActivityItemKey = (typeof MY_ACTIVITY)[number]["key"];

export interface SidebarActivityCounts {
  inbox: number | null;
  mentions: number | null;
  drafts: number | null;
  markedMessages: number | null;
}

export type SidebarActivityDisabledItems = Partial<Record<SidebarActivityItemKey, string>>;

export interface SidebarActivityViewProps {
  open: boolean;
  onToggle: () => void;
  counts: SidebarActivityCounts;
  disabledItems?: SidebarActivityDisabledItems;
  isCompactDensity: boolean;
  markedMessagesError?: string | null;
}

// Figma activity rail: 28×28 hit target, ~21px glyph (Exordos Core Frame 2087327346).
const compactRowClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-sidebar-hover hover:text-text-primary";
const compactRowActiveClass = "border border-border-subtle bg-card-bg-active text-text-primary";
const compactBadgeClass = "pointer-events-none absolute right-0 top-0";
const compactListItemClass = "relative h-7 w-7 shrink-0";
/** Compact shell: icons scroll horizontally; chevron stays pinned outside the scroll viewport. */
// gap-2.5 (10px): compact activity icon / chevron spacing from design review
const compactRowShellClass = "mt-1 flex min-w-0 w-full items-center gap-2.5";
const compactIconsScrollClass = "min-w-0 flex-1 overflow-x-auto scrollbar-none";
const compactIconsListClass = "flex w-max flex-nowrap items-center gap-2.5";
/**
 * Glyph size inside the 28px compact hit target.
 * Keep inset (~5px) so cropped/solid glyphs are not flush with the button edge.
 */
const COMPACT_ACTIVITY_ICON_SIZE_FALLBACK = 18;
const COMPACT_ACTIVITY_CHEVRON_SIZE = 16;
// Figma card: padding 8, gap 12, radius 8. Idle Card/base; hover → card-bg-active.
const expandedRowBaseClass =
  "group flex w-full items-center gap-3 rounded-lg bg-card-bg p-2 text-left text-sm text-text-primary transition-colors hover:bg-card-bg-active";
const expandedRowCompactClass =
  "group flex w-full items-center gap-2 rounded-lg bg-card-bg px-2 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-card-bg-active";
// Keep active on the elevated fill so the selected card stays visible after the swap.
const expandedRowActiveClass = "bg-bg-elevated/60";
// Figma icon circle is 30×30; glyphs stay white on colored chips in every theme.
const expandedIconChipClass =
  "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-white";
const expandedIconChipCompactClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white";
const expandedLabelClass = "min-w-0 flex-1 truncate text-sm font-normal";
const expandedLabelCompactClass = "min-w-0 flex-1 truncate text-sm font-normal";
/** Glyph frame inside the 30px chip matches Figma 24×24 icon slots. */
const EXPANDED_ACTIVITY_ICON_SIZE = 24;

function activityFilterForKey(key: SidebarActivityItemKey): string | null {
  switch (key) {
    case "mentions":
    case "drafts":
    case "reactions":
      return key;
    case "favorites":
      return "favorites";
    case "markedMessages":
      return "starred";
    case "inbox":
    case "feed":
      return null;
  }
}

function countForActivityKey(
  key: SidebarActivityItemKey,
  counts: SidebarActivityCounts,
): number | null {
  switch (key) {
    case "inbox":
      return counts.inbox;
    case "mentions":
      return counts.mentions;
    case "drafts":
      return counts.drafts;
    case "markedMessages":
      return counts.markedMessages;
    case "favorites":
    case "feed":
    case "reactions":
      return null;
  }
}

function badgeVariantForActivityKey(key: SidebarActivityItemKey): "muted" | "unread" {
  return key === "inbox" || key === "mentions" ? "unread" : "muted";
}

export const SidebarActivityView: React.FC<SidebarActivityViewProps> = ({
  open,
  onToggle,
  counts,
  disabledItems = {},
  isCompactDensity,
  markedMessagesError = null,
}) => {
  const { pathname } = useLocation();
  const workspaceRoute = React.useMemo(() => parseWorkspaceMessengerRoute(pathname), [pathname]);
  const workspaceOrgId = workspaceRoute?.orgId ?? null;
  const workspaceProjectId = workspaceRoute?.projectId ?? null;
  const activityListId = "sidebar-activity-list";
  const expandedListClass = "mt-2 space-y-1";
  const expandedRowClass = isCompactDensity ? expandedRowCompactClass : expandedRowBaseClass;
  const expandedIconClass = isCompactDensity ? expandedIconChipCompactClass : expandedIconChipClass;
  const expandedLabel = isCompactDensity ? expandedLabelCompactClass : expandedLabelClass;
  const resolveActivityRoute = React.useCallback(
    (key: SidebarActivityItemKey): string => {
      if (workspaceOrgId == null || workspaceProjectId == null) {
        return "/";
      }
      if (key === "inbox") {
        return workspaceInboxRoute(workspaceOrgId, workspaceProjectId);
      }
      if (key === "feed") {
        return workspaceFeedRoute(workspaceOrgId, workspaceProjectId);
      }
      const filter = activityFilterForKey(key);
      if (filter != null) {
        return workspaceActivityRoute({
          orgId: workspaceOrgId,
          projectId: workspaceProjectId,
          filter,
        });
      }
      return "/";
    },
    [workspaceOrgId, workspaceProjectId],
  );
  const isActivityRouteActive = React.useCallback(
    (key: SidebarActivityItemKey): boolean => {
      if (workspaceRoute != null) {
        if (key === "inbox") return workspaceRoute.kind === "inbox";
        if (key === "feed") return workspaceRoute.kind === "feed";
        const filter = activityFilterForKey(key);
        return (
          filter != null && workspaceRoute.kind === "activity" && workspaceRoute.filter === filter
        );
      }
      return false;
    },
    [workspaceRoute],
  );

  return (
    <div className="min-w-0 px-2 pb-2 pt-0">
      {open && (
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-base font-semibold text-text-primary"
          aria-expanded={open}
          aria-controls={activityListId}
        >
          {t("nav.activity")}
          <span className="rounded-md p-1 text-text-muted">
            <Icon name="chevron-up" size={COMPACT_ACTIVITY_CHEVRON_SIZE} className="text-current" />
          </span>
        </button>
      )}
      {!open && (
        <div className={compactRowShellClass}>
          <div className={compactIconsScrollClass} data-testid="sidebar-activity-compact-scroll">
            <ul
              id={activityListId}
              className={compactIconsListClass}
              aria-label={t("nav.activity")}
            >
              {VISIBLE_MY_ACTIVITY.map((item) => {
                const route = resolveActivityRoute(item.key);
                const disabledReason = disabledItems[item.key];
                const isActive = disabledReason == null && isActivityRouteActive(item.key);
                const label = t(item.labelKey);
                const count = countForActivityKey(item.key, counts);
                const canShowCount =
                  count != null &&
                  count > 0 &&
                  (item.key !== "markedMessages" || markedMessagesError == null);
                return (
                  <li
                    key={`compact-${item.key}`}
                    className={`${compactListItemClass} ${canShowCount ? "z-sticky" : ""}`}
                  >
                    {disabledReason == null ? (
                      <>
                        <Link
                          to={route}
                          aria-label={label}
                          aria-current={isActive ? "page" : undefined}
                          className={`${compactRowClass} ${isActive ? compactRowActiveClass : ""}`}
                        >
                          <Icon
                            name={item.compactIcon}
                            size={item.compactIconSize ?? COMPACT_ACTIVITY_ICON_SIZE_FALLBACK}
                            className="shrink-0 text-current"
                          />
                        </Link>
                        {canShowCount && count != null && (
                          <span className={compactBadgeClass}>
                            <Badge
                              count={count}
                              variant={badgeVariantForActivityKey(item.key)}
                              size="sm"
                              textTone="primary"
                            />
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={label}
                          aria-disabled={disabledReason != null}
                          title={disabledReason}
                          className={`${compactRowClass} ${disabledReason != null ? "opacity-60" : ""}`}
                        >
                          <Icon
                            name={item.compactIcon}
                            size={item.compactIconSize ?? COMPACT_ACTIVITY_ICON_SIZE_FALLBACK}
                            className="shrink-0 text-current"
                          />
                        </button>
                        {canShowCount && count != null && (
                          <span className={compactBadgeClass}>
                            <Badge
                              count={count}
                              variant={badgeVariantForActivityKey(item.key)}
                              size="sm"
                              textTone="primary"
                            />
                          </span>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={false}
            aria-label={t("nav.activity")}
            className={compactRowClass}
            data-testid="sidebar-activity-compact-toggle"
          >
            <Icon
              name="chevron-down"
              size={COMPACT_ACTIVITY_CHEVRON_SIZE}
              className="text-current"
            />
          </button>
        </div>
      )}
      {open && (
        <ul id={activityListId} className={expandedListClass}>
          {VISIBLE_MY_ACTIVITY.map((item) => {
            const route = resolveActivityRoute(item.key);
            const disabledReason = disabledItems[item.key];
            const isActive = disabledReason == null && isActivityRouteActive(item.key);
            const count = countForActivityKey(item.key, counts);
            const canShowCount =
              count != null &&
              count > 0 &&
              (item.key !== "markedMessages" || markedMessagesError == null);
            const content = (
              <>
                <span
                  className={`${expandedIconClass} ${item.iconBgClass}`}
                  data-testid={`activity-icon-bg-${item.key}`}
                >
                  <Icon
                    name={item.icon}
                    size={EXPANDED_ACTIVITY_ICON_SIZE}
                    className="text-white"
                  />
                </span>
                <span className={expandedLabel}>{t(item.labelKey)}</span>
                {canShowCount && count != null && (
                  <span className="shrink-0">
                    <Badge count={count} variant={badgeVariantForActivityKey(item.key)} />
                  </span>
                )}
              </>
            );
            return (
              <li key={item.key}>
                {disabledReason == null ? (
                  <Link
                    to={route}
                    className={`${expandedRowClass} ${isActive ? expandedRowActiveClass : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={`${expandedRowClass} ${disabledReason != null ? "opacity-70" : ""}`}
                    aria-disabled={disabledReason != null}
                    title={disabledReason}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
