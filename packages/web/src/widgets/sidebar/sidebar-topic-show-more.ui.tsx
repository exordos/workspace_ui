import React, { useMemo } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import {
  SIDEBAR_TOPIC_BAR_SPACER_CLASS,
  sidebarTopicShowMoreButtonClass,
} from "./sidebar-chat-row-layout.lib";
import type { SidebarTopicToggleAction } from "./sidebar-topic-collapse.lib";

export interface SidebarTopicShowMoreButtonProps {
  action: SidebarTopicToggleAction;
  /** Some topics beyond the initial collapsed slice are visible. */
  expanded: boolean;
  /** How many topics the next reveal action will show. */
  hiddenCount: number;
  onToggle: () => void;
  /** Match topic-row density when the sidebar is compact. */
  compact?: boolean;
}

export const SidebarTopicShowMoreButton = React.memo<SidebarTopicShowMoreButtonProps>(
  function SidebarTopicShowMoreButton({
    action,
    expanded,
    hiddenCount,
    onToggle,
    compact = false,
  }) {
    const label = useMemo(() => {
      if (action === "collapse") {
        return t("channel.hideExtraTopics");
      }
      if (action === "showCompleted") {
        return hiddenCount > 0
          ? t("channel.showCompletedTopicsWithCount", { count: hiddenCount })
          : t("channel.showCompletedTopics");
      }
      if (hiddenCount > 0) {
        return t("channel.showMoreTopicsWithCount", { count: hiddenCount });
      }
      return t("channel.showMoreTopics");
    }, [action, hiddenCount]);

    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        className={sidebarTopicShowMoreButtonClass(compact)}
        aria-expanded={expanded}
        aria-label={label}
      >
        {/* Same bar gutter as topic rows; the button itself uses a tighter left inset. */}
        <span className={`flex min-w-0 flex-1 items-center ${compact ? "gap-2" : "gap-3"}`}>
          <span aria-hidden className={SIDEBAR_TOPIC_BAR_SPACER_CLASS} />
          <span className="min-w-0 truncate">{label}</span>
        </span>
        {/* Figma Arrow-b: instance height 16, viewBox 20 — Icon size={16} matches the shell. */}
        {action === "collapse" ? (
          <Icon name="chevron-up" size={16} className="shrink-0 text-text-primary" />
        ) : (
          <Icon name="chevron-down" size={16} className="shrink-0 text-text-primary" />
        )}
      </button>
    );
  },
);
