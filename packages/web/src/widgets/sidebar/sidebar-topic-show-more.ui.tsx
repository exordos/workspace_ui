import React, { useMemo } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { sidebarTopicShowMoreButtonClass } from "./sidebar-chat-row-layout.lib";

export interface SidebarTopicShowMoreButtonProps {
  /** Full topic list is expanded. */
  expanded: boolean;
  /** How many topics are currently hidden (for the parenthetical label). */
  hiddenCount: number;
  onToggle: () => void;
  /** Match topic-row density when the sidebar is compact. */
  compact?: boolean;
}

export const SidebarTopicShowMoreButton = React.memo<SidebarTopicShowMoreButtonProps>(
  function SidebarTopicShowMoreButton({ expanded, hiddenCount, onToggle, compact = false }) {
    const label = useMemo(() => {
      if (expanded) {
        return t("channel.hideExtraTopics");
      }
      if (hiddenCount > 0) {
        return t("channel.showMoreTopicsWithCount", { count: hiddenCount });
      }
      return t("channel.showMoreTopics");
    }, [expanded, hiddenCount]);

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
        {/* Hug content on the left — padding lives on the button (same 38px as topic cards). */}
        <span className="min-w-0 truncate">{label}</span>
        {/* Figma Arrow-b: instance height 16, viewBox 20 — Icon size={16} matches the shell. */}
        {expanded ? (
          <Icon name="chevron-up" size={16} className="ml-2 shrink-0 text-text-primary" />
        ) : (
          <Icon name="chevron-down" size={16} className="ml-2 shrink-0 text-text-primary" />
        )}
      </button>
    );
  },
);
