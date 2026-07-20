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
  favorites: number | null;
}

export type SidebarActivityDisabledItems = Partial<Record<SidebarActivityItemKey, string>>;

export interface SidebarActivityViewProps {
  open: boolean;
  onToggle: () => void;
  counts: SidebarActivityCounts;
  disabledItems?: SidebarActivityDisabledItems;
  showPrivateNotes: boolean;
  privateNotesDisabledReason?: string;
  isCompactDensity: boolean;
  favoritesError?: string | null;
}

const compactRowClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-sidebar-hover hover:text-text-primary";
const compactRowActiveClass = "border border-border-subtle bg-card-bg-active text-text-primary";
const compactBadgeClass = "pointer-events-none absolute right-0 top-0";
const compactListItemClass = "relative h-8 w-8 shrink-0";
/** Compact shell: icons scroll horizontally; chevron stays pinned outside the scroll viewport. */
const compactRowShellClass = "mt-1 flex min-w-0 w-full items-center gap-0.5";
const compactIconsScrollClass = "min-w-0 flex-1 overflow-x-auto scrollbar-none";
const compactIconsListClass = "flex w-max flex-nowrap items-center gap-0.5";
const expandedRowBaseClass =
  "group flex w-full items-center gap-2 rounded-lg bg-bg-elevated/60 px-2.5 py-2 text-left text-sm text-text-primary transition-colors hover:bg-card-bg";
const expandedRowCompactClass =
  "group flex w-full items-center gap-1.5 rounded-lg bg-bg-elevated/50 px-2 py-1 text-left text-sm text-text-primary transition-colors hover:bg-card-bg";
const expandedRowActiveClass = "bg-card-bg";
const expandedIconChipClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-accent";
const expandedIconChipCompactClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-accent";
const expandedLabelClass = "min-w-0 flex-1 truncate text-sm font-medium";
const expandedLabelCompactClass = "min-w-0 flex-1 truncate text-sm font-medium";

function getCompactActivityIconSize(key: string): number {
  return key === "favorites" || key === "feed" ? 16 : 18;
}

function getExpandedActivityIconSize(key: string): number {
  return key === "favorites" || key === "feed" ? 16 : 18;
}

function activityFilterForKey(key: SidebarActivityItemKey): string | null {
  switch (key) {
    case "mentions":
    case "drafts":
    case "reactions":
      return key;
    case "favorites":
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
    case "favorites":
      return counts.favorites;
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
  showPrivateNotes,
  privateNotesDisabledReason,
  isCompactDensity,
  favoritesError = null,
}) => {
  const { pathname } = useLocation();
  const workspaceRoute = React.useMemo(() => parseWorkspaceMessengerRoute(pathname), [pathname]);
  const workspaceOrgId = workspaceRoute?.orgId ?? null;
  const workspaceProjectId = workspaceRoute?.projectId ?? null;
  const activityListId = "sidebar-activity-list";
  const isPrivateNotesActive = false;
  const expandedListClass = "mt-2 space-y-1";
  const expandedRowClass = isCompactDensity ? expandedRowCompactClass : expandedRowBaseClass;
  const expandedIconClass = isCompactDensity ? expandedIconChipCompactClass : expandedIconChipClass;
  const expandedLabel = isCompactDensity ? expandedLabelCompactClass : expandedLabelClass;
  const inboxRoute =
    workspaceOrgId != null && workspaceProjectId != null
      ? workspaceInboxRoute(workspaceOrgId, workspaceProjectId)
      : "/";
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
    <div className="min-w-0 px-3 pb-2 pt-0">
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
            <Icon name="chevron-up" size={14} className="text-current" />
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
              {showPrivateNotes && (
                <li className={compactListItemClass}>
                  {privateNotesDisabledReason == null ? (
                    <Link
                      to={inboxRoute}
                      aria-label={t("activity.home")}
                      aria-current={isPrivateNotesActive ? "page" : undefined}
                      className={`${compactRowClass} ${
                        isPrivateNotesActive ? compactRowActiveClass : ""
                      }`}
                    >
                      <Icon name="accountCircle" size={18} className="shrink-0 text-current" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      aria-label={t("activity.home")}
                      aria-disabled="true"
                      title={privateNotesDisabledReason}
                      className={`${compactRowClass} opacity-60`}
                    >
                      <Icon name="accountCircle" size={18} className="shrink-0 text-current" />
                    </button>
                  )}
                </li>
              )}
              {VISIBLE_MY_ACTIVITY.map((item) => {
                const route = resolveActivityRoute(item.key);
                const disabledReason = disabledItems[item.key];
                const isActive = disabledReason == null && isActivityRouteActive(item.key);
                const label = t(item.labelKey);
                const count = countForActivityKey(item.key, counts);
                const canShowCount =
                  count != null &&
                  count > 0 &&
                  (item.key !== "favorites" || favoritesError == null);
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
                            name={item.icon}
                            size={getCompactActivityIconSize(item.key)}
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
                            name={item.icon}
                            size={getCompactActivityIconSize(item.key)}
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
            <Icon name="chevron-down" size={14} className="text-current" />
          </button>
        </div>
      )}
      {open && (
        <ul id={activityListId} className={expandedListClass}>
          {showPrivateNotes && (
            <li>
              {privateNotesDisabledReason == null ? (
                <Link
                  to={inboxRoute}
                  className={`${expandedRowClass} ${
                    isPrivateNotesActive ? expandedRowActiveClass : ""
                  }`}
                  aria-current={isPrivateNotesActive ? "page" : undefined}
                >
                  <span
                    className={`${expandedIconClass} bg-accent`}
                    data-testid="activity-icon-bg-home"
                  >
                    <Icon name="accountCircle" size={18} className="shrink-0 text-on-accent" />
                  </span>
                  <span className={expandedLabel}>{t("activity.home")}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  className={`${expandedRowClass} opacity-70`}
                  aria-disabled="true"
                  title={privateNotesDisabledReason}
                >
                  <span
                    className={`${expandedIconClass} bg-accent`}
                    data-testid="activity-icon-bg-home"
                  >
                    <Icon name="accountCircle" size={18} className="shrink-0 text-on-accent" />
                  </span>
                  <span className={expandedLabel}>{t("activity.home")}</span>
                </button>
              )}
            </li>
          )}
          {VISIBLE_MY_ACTIVITY.map((item) => {
            const route = resolveActivityRoute(item.key);
            const disabledReason = disabledItems[item.key];
            const isActive = disabledReason == null && isActivityRouteActive(item.key);
            const count = countForActivityKey(item.key, counts);
            const canShowCount =
              count != null && count > 0 && (item.key !== "favorites" || favoritesError == null);
            const content = (
              <>
                <span
                  className={`${expandedIconClass} ${item.iconBgClass}`}
                  data-testid={`activity-icon-bg-${item.key}`}
                >
                  <Icon
                    name={item.icon}
                    size={getExpandedActivityIconSize(item.key)}
                    className="shrink-0 text-on-accent"
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
