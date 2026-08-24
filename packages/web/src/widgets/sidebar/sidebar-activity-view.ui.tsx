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

/**
 * Compact My Activity rail (Figma 14484:31210).
 * Activity cards share leftover width (`flex-1`); the chevron keeps a fixed 32px slot.
 * Idle/active fills are mutually exclusive so Tailwind does not fight `bg-card-bg`.
 *
 * Figma icon nodes are 24×24 Material frames with optical padding. Our compact SVGs
 * are cropped tight, so rendering them at 24px looks larger than the mockup.
 * `compactIconSize` (18–20) restores that inset inside the 4px-padded card.
 */
const compactRowShellClass = "mt-1 flex min-w-0 w-full items-center gap-2";
const compactIconsListClass = "flex min-w-0 w-full flex-1 items-center gap-2";
const compactListItemClass = "relative min-w-0 flex-1";
const compactBadgeClass = "pointer-events-none absolute right-0 top-0";
const compactButtonBaseClass =
  "flex h-8 items-center justify-center rounded-lg p-1 transition-colors";
// Activity items are actions, so their glyphs stay bright.
const compactActionIdleClass = "bg-card-bg text-icon-active hover:bg-card-bg-active";
const compactActionCurrentClass = "bg-card-bg-active text-icon-active";
// The chevron is not an action and stays muted.
const compactChevronClass =
  "bg-card-bg text-text-muted hover:bg-card-bg-active hover:text-text-primary";
const COMPACT_ACTIVITY_CHEVRON_SIZE = 16;

function compactButtonClass(options: {
  stretch: boolean;
  active?: boolean;
  mutedIcon?: boolean;
}): string {
  const widthClass = options.stretch ? "min-w-0 w-full" : "w-8 shrink-0";
  const toneClass = options.mutedIcon
    ? compactChevronClass
    : options.active
      ? compactActionCurrentClass
      : compactActionIdleClass;
  return `${compactButtonBaseClass} ${toneClass} ${widthClass}`;
}

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

interface CompactActivityItemProps {
  item: (typeof VISIBLE_MY_ACTIVITY)[number];
  route: string;
  isActive: boolean;
  disabledReason?: string;
  label: string;
  count: number | null;
  canShowCount: boolean;
}

const CompactActivityItem = React.memo<CompactActivityItemProps>(function CompactActivityItem({
  item,
  route,
  isActive,
  disabledReason,
  label,
  count,
  canShowCount,
}) {
  const icon = (
    <Icon name={item.compactIcon} size={item.compactIconSize} className="shrink-0 text-current" />
  );
  const badge =
    canShowCount && count != null ? (
      <span className={compactBadgeClass}>
        <Badge
          count={count}
          variant={badgeVariantForActivityKey(item.key)}
          size="sm"
          textTone="primary"
        />
      </span>
    ) : null;

  return (
    <li className={`${compactListItemClass} ${canShowCount ? "z-sticky" : ""}`}>
      {disabledReason == null ? (
        <>
          <Link
            to={route}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            data-icon-tone="active"
            className={compactButtonClass({ stretch: true, active: isActive })}
          >
            {icon}
          </Link>
          {badge}
        </>
      ) : (
        <>
          <button
            type="button"
            aria-label={label}
            aria-disabled
            title={disabledReason}
            className={`${compactButtonClass({ stretch: true })} opacity-60`}
          >
            {icon}
          </button>
          {badge}
        </>
      )}
    </li>
  );
});

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
          <ul id={activityListId} className={compactIconsListClass} aria-label={t("nav.activity")}>
            {VISIBLE_MY_ACTIVITY.map((item) => {
              const route = resolveActivityRoute(item.key);
              const disabledReason = disabledItems[item.key];
              const isActive = disabledReason == null && isActivityRouteActive(item.key);
              const count = countForActivityKey(item.key, counts);
              const canShowCount =
                count != null &&
                count > 0 &&
                (item.key !== "markedMessages" || markedMessagesError == null);
              return (
                <CompactActivityItem
                  key={`compact-${item.key}`}
                  item={item}
                  route={route}
                  isActive={isActive}
                  disabledReason={disabledReason}
                  label={t(item.labelKey)}
                  count={count}
                  canShowCount={canShowCount}
                />
              );
            })}
          </ul>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={false}
            aria-label={t("nav.activity")}
            className={compactButtonClass({ stretch: false, mutedIcon: true })}
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
