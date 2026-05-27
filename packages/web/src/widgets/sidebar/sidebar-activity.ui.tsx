import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useDraftStore } from "~/entities/draft/draft.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { extractOrgRouteFromPathname, withCurrentOrgRoute } from "~/shared/lib/org-route";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { MY_ACTIVITY } from "./sidebar.lib";
import type { SidebarActivityProps } from "./sidebar-activity.types";

const compactRowClass =
  "relative flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-sidebar-hover hover:text-text-primary";
const compactRowActiveClass = "border border-border-subtle bg-card-bg-active text-text-primary";
const compactBadgeClass = "absolute -right-1 -top-1";
const expandedRowBaseClass =
  "group flex w-full items-center gap-3 rounded-xl bg-bg-elevated/60 px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-card-bg";
const expandedRowCompactClass =
  "group flex w-full items-center gap-2 rounded-lg bg-bg-elevated/50 px-2.5 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-card-bg";
const expandedRowActiveClass = "bg-card-bg";
const expandedIconChipClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-accent";
const expandedIconChipCompactClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-accent";
const expandedLabelClass = "min-w-0 flex-1 truncate text-base font-medium";
const expandedLabelCompactClass = "min-w-0 flex-1 truncate text-sm font-medium";

function getCompactActivityIconSize(key: string): number {
  return key === "favorites" || key === "feed" ? 16 : 18;
}

function getExpandedActivityIconSize(key: string): number {
  return key === "favorites" || key === "feed" ? 18 : 20;
}

export const SidebarActivity: React.FC<SidebarActivityProps> = ({ open, onToggle }) => {
  const { pathname } = useLocation();
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const inboxCount = useChatListStore((s) => s.sidebarStreamsUnread + s.sidebarDmsUnread);
  const mentionsCount = useChatListStore((s) => s.mentionsUnreadCount);
  const activityListId = "sidebar-activity-list";
  const draftsCount = useDraftStore((s) => s.nonEmptyDraftCount);
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
  const favoritesCount = useActivityStore((s) => s.starredSummary.count);
  const favoritesError = useActivityStore((s) => s.starredSummary.error);
  const isPrivateNotesActive = currentUserId != null && scopedPathname === `/dm/${currentUserId}`;
  const expandedListClass = isCompactDensity ? "mt-2 space-y-1" : "mt-2 space-y-1.5";
  const expandedRowClass = isCompactDensity ? expandedRowCompactClass : expandedRowBaseClass;
  const expandedIconClass = isCompactDensity ? expandedIconChipCompactClass : expandedIconChipClass;
  const expandedLabel = isCompactDensity ? expandedLabelCompactClass : expandedLabelClass;

  return (
    <div className="px-3 pb-2 pt-0">
      {open && (
        <button
          type="button"
          onClick={onToggle}
          className="hover:bg-sidebar-hover/60 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-base font-semibold text-text-primary transition-colors"
          aria-expanded={open}
          aria-controls={activityListId}
        >
          {t("nav.activity")}
          <span className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg hover:text-text-primary">
            <Icon name="chevron-up" size={14} className="text-current" />
          </span>
        </button>
      )}
      {!open && (
        <ul
          id={activityListId}
          className="mt-1 flex flex-nowrap items-center gap-0.5"
          aria-label={t("nav.activity")}
        >
          {currentUserId != null && (
            <li>
              <Link
                to={withCurrentOrgRoute(`/dm/${currentUserId}`)}
                aria-label={t("activity.home")}
                aria-current={isPrivateNotesActive ? "page" : undefined}
                className={`${compactRowClass} ${
                  isPrivateNotesActive ? compactRowActiveClass : ""
                }`}
              >
                <Icon name="accountCircle" size={18} className="shrink-0 text-current" />
              </Link>
            </li>
          )}
          {MY_ACTIVITY.map((item) => {
            const route = "route" in item ? item.route : undefined;
            const isActive = route !== undefined && scopedPathname === route;
            const label = t(item.labelKey);
            return (
              <li key={`compact-${item.key}`}>
                {route ? (
                  <Link
                    to={withCurrentOrgRoute(route)}
                    aria-label={label}
                    aria-current={isActive ? "page" : undefined}
                    className={`${compactRowClass} ${isActive ? compactRowActiveClass : ""}`}
                  >
                    <Icon
                      name={item.icon}
                      size={getCompactActivityIconSize(item.key)}
                      className="shrink-0 text-current"
                    />
                    {item.key === "inbox" && inboxCount > 0 && (
                      <span className={compactBadgeClass}>
                        <Badge count={inboxCount} variant="unread" className="opacity-70" />
                      </span>
                    )}
                    {item.key === "mentions" && mentionsCount > 0 && (
                      <span className={compactBadgeClass}>
                        <Badge count={mentionsCount} variant="unread" className="opacity-70" />
                      </span>
                    )}
                    {item.key === "drafts" && draftsCount > 0 && (
                      <span className={compactBadgeClass}>
                        <Badge count={draftsCount} variant="muted" className="opacity-70" />
                      </span>
                    )}
                    {item.key === "favorites" && favoritesError == null && favoritesCount > 0 && (
                      <span className={compactBadgeClass}>
                        <Badge count={favoritesCount} variant="muted" className="opacity-70" />
                      </span>
                    )}
                  </Link>
                ) : (
                  <button type="button" aria-label={label} className={compactRowClass}>
                    <Icon name={item.icon} size={18} className="shrink-0 text-current" />
                  </button>
                )}
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={false}
              aria-label={t("nav.activity")}
              className={compactRowClass}
            >
              <Icon name="chevron-down" size={14} className="text-current" />
            </button>
          </li>
        </ul>
      )}
      {open && (
        <ul id={activityListId} className={expandedListClass}>
          {currentUserId != null && (
            <li>
              <Link
                to={withCurrentOrgRoute(`/dm/${currentUserId}`)}
                className={`${expandedRowClass} ${
                  scopedPathname === `/dm/${currentUserId}` ? expandedRowActiveClass : ""
                }`}
                aria-current={scopedPathname === `/dm/${currentUserId}` ? "page" : undefined}
              >
                <span
                  className={`${expandedIconClass} bg-accent`}
                  data-testid="activity-icon-bg-home"
                >
                  <Icon name="accountCircle" size={20} className="shrink-0 text-on-accent" />
                </span>
                <span className={expandedLabel}>{t("activity.home")}</span>
              </Link>
            </li>
          )}
          {MY_ACTIVITY.map((item) => {
            const route = "route" in item ? item.route : undefined;
            const isActive = route !== undefined && scopedPathname === route;
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
                {item.key === "inbox" && inboxCount > 0 && (
                  <span className="shrink-0">
                    <Badge count={inboxCount} variant="unread" />
                  </span>
                )}
                {item.key === "mentions" && mentionsCount > 0 && (
                  <span className="shrink-0">
                    <Badge count={mentionsCount} variant="unread" />
                  </span>
                )}
                {item.key === "drafts" && draftsCount > 0 && (
                  <span className="shrink-0">
                    <Badge count={draftsCount} variant="muted" />
                  </span>
                )}
                {item.key === "favorites" && favoritesError == null && favoritesCount > 0 && (
                  <span className="shrink-0">
                    <Badge count={favoritesCount} variant="muted" />
                  </span>
                )}
              </>
            );
            return (
              <li key={item.key}>
                {route ? (
                  <Link
                    to={withCurrentOrgRoute(route)}
                    className={`${expandedRowClass} ${isActive ? expandedRowActiveClass : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {content}
                  </Link>
                ) : (
                  <button type="button" className={expandedRowClass}>
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
