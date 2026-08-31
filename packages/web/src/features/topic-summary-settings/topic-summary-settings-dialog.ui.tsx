import React, { useCallback } from "react";
import type { MessengerTopic } from "~/entities/messenger/messenger.types";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useTranslation } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog.ui";
import { EndpointsSettingsSection } from "./topic-summary-endpoints-section.ui";
import { useTopicSummaryEndpoints } from "./topic-summary-endpoints.hook";
import { GatesSettingsSection } from "./topic-summary-gates-section.ui";
import { useTopicSummarySettings } from "./topic-summary-settings.hook";
import { TopicSettingsSection } from "./topic-summary-topic-section.ui";
import type { TopicSummaryPermission } from "./topic-summary-settings.types";

export interface TopicSummarySettingsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly runtimeContext: WorkspaceRuntimeContext | null;
  readonly topic: MessengerTopic | null;
  readonly topicPermission: TopicSummaryPermission;
  readonly gatesPermission: TopicSummaryPermission;
  readonly endpointsPermission: TopicSummaryPermission;
  readonly getRuntimeContext?: WorkspaceRuntimeContextGetter;
}

export const TopicSummarySettingsDialog = React.memo(function TopicSummarySettingsDialog({
  open,
  onOpenChange,
  runtimeContext,
  topic,
  topicPermission,
  gatesPermission,
  endpointsPermission,
  getRuntimeContext,
}: TopicSummarySettingsDialogProps) {
  const { t } = useTranslation();
  const showTopic = topicPermission === "allowed" && topic != null;
  const showGates = gatesPermission === "allowed";
  const showEndpoints = endpointsPermission === "allowed";
  const settingsVm = useTopicSummarySettings({
    open: open && (showTopic || showGates),
    runtimeContext,
    topic,
    topicPermission,
    gatesPermission,
    loadGatesOnOpen: showGates,
    getRuntimeContext,
  });
  const endpointsVm = useTopicSummaryEndpoints({
    open: open && showEndpoints,
    runtimeContext,
    permission: endpointsPermission,
    getRuntimeContext,
  });
  const sectionCount = Number(showTopic) + Number(showGates) + Number(showEndpoints);
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && sectionCount === 0) return;
      onOpenChange(nextOpen);
    },
    [onOpenChange, sectionCount],
  );

  if (sectionCount === 0) return null;

  return (
    <AppDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t("topicSummarySettings.title")}
      description={t("topicSummarySettings.description")}
      maxWidthClassName="max-w-3xl"
      positionClassName="top-1/2 -translate-y-1/2"
      scrollBody
    >
      <div className="space-y-4">
        {showTopic ? <TopicSettingsSection vm={settingsVm} /> : null}
        {showTopic && (showGates || showEndpoints) ? (
          <div className="flex items-center gap-3 px-1 pt-1" aria-hidden="true">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t("topicSummarySettings.sharedLabel")}
            </span>
            <span className="h-px flex-1 bg-border-subtle" />
          </div>
        ) : null}
        {showGates ? <GatesSettingsSection vm={settingsVm} /> : null}
        {showEndpoints ? <EndpointsSettingsSection vm={endpointsVm} /> : null}
      </div>
    </AppDialog>
  );
});
