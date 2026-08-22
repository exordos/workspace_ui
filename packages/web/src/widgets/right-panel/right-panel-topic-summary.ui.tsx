import { useState } from "react";
import type { WorkspaceRightPanelTopicSummaryView } from "~/entities/messenger/messenger-right-panel.lib";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";

interface RightPanelTopicSummaryProps {
  readonly summary: WorkspaceRightPanelTopicSummaryView;
  readonly onOpenSettings?: () => void;
}

export function RightPanelTopicSummary({ summary, onOpenSettings }: RightPanelTopicSummaryProps) {
  const [expanded, setExpanded] = useState(summary.text != null);
  const contentId = `workspace-topic-summary-${summary.topicUuid}`;

  return (
    <section aria-labelledby={`${contentId}-heading`}>
      <div className="flex h-6 w-full items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-text-primary">
          <span id={`${contentId}-heading`} className="truncate text-sm font-medium">
            {t("workspaceMessenger.topicSummary.title")}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-xs text-text-secondary">
            (AI ✨)
          </span>
        </div>
        {onOpenSettings != null ? (
          <button
            type="button"
            aria-label={t("workspaceMessenger.topicSummary.openSettings")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={onOpenSettings}
          >
            <Icon name="settings" size={16} />
          </button>
        ) : null}
        <button
          type="button"
          aria-controls={contentId}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? t("workspaceMessenger.topicSummary.collapse")
              : t("workspaceMessenger.topicSummary.expand")
          }
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => setExpanded((current) => !current)}
        >
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} />
        </button>
      </div>

      {expanded ? (
        <div
          id={contentId}
          data-testid="topic-summary-content"
          className="mt-3 max-h-[218px] overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated px-2 py-2"
        >
          {summary.text != null ? (
            <p className="whitespace-pre-wrap text-xs leading-5 text-text-primary">
              {summary.text}
            </p>
          ) : (
            <p className="text-xs leading-5 text-text-muted">
              {summary.enabled
                ? t("workspaceMessenger.topicSummary.pending")
                : t("workspaceMessenger.topicSummary.disabledEmpty")}
            </p>
          )}
          {summary.text != null && summary.hasNewMessages === true ? (
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              {t("workspaceMessenger.topicSummary.hasNewMessages")}
            </p>
          ) : null}
          {!summary.enabled ? (
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              {t("workspaceMessenger.topicSummary.disabled")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
