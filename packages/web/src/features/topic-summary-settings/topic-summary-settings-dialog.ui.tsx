import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { MessengerTopic } from "~/entities/messenger/messenger.types";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useTranslation } from "~/i18n/i18n";
import {
  APP_DIALOG_CONTENT_BASE_CLASS,
  AppDialogShell,
  DialogCloseIconButton,
} from "~/shared/ui/app-dialog.ui";
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
  readonly channelName?: string | null;
  readonly topicPermission: TopicSummaryPermission;
  readonly gatesPermission: TopicSummaryPermission;
  readonly endpointsPermission: TopicSummaryPermission;
  readonly getRuntimeContext?: WorkspaceRuntimeContextGetter;
}

type TopicSummarySettingsTab = "topic" | "gates" | "endpoints";

const TAB_LABEL_KEYS: Record<TopicSummarySettingsTab, string> = {
  topic: "topicSummarySettings.topic.title",
  gates: "topicSummarySettings.gates.title",
  endpoints: "topicSummarySettings.endpoints.title",
};

function dialogHeightClass(tab: TopicSummarySettingsTab): string {
  if (tab === "topic") return "h-[min(42.5rem,92vh)]";
  if (tab === "gates") return "h-[min(37.5rem,92vh)]";
  return "h-[min(47.5rem,92vh)]";
}

export const TopicSummarySettingsDialog = React.memo(function TopicSummarySettingsDialog({
  open,
  onOpenChange,
  runtimeContext,
  topic,
  channelName,
  topicPermission,
  gatesPermission,
  endpointsPermission,
  getRuntimeContext,
}: TopicSummarySettingsDialogProps) {
  const { t } = useTranslation();
  const normalizedChannelName = channelName?.trim();
  const showTopic = topicPermission === "allowed" && topic != null;
  const showGates = gatesPermission === "allowed";
  const showEndpoints = endpointsPermission === "allowed";
  const visibleTabs = useMemo(() => {
    const tabs: TopicSummarySettingsTab[] = [];
    if (showTopic) tabs.push("topic");
    if (showGates) tabs.push("gates");
    if (showEndpoints) tabs.push("endpoints");
    return tabs;
  }, [showEndpoints, showGates, showTopic]);
  const [activeTab, setActiveTab] = useState<TopicSummarySettingsTab>(visibleTabs[0] ?? "topic");
  const tabsId = useId();
  const tabRefs = useRef(new Map<TopicSummarySettingsTab, HTMLButtonElement>());
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
  useEffect(() => {
    if (!visibleTabs.includes(activeTab) && visibleTabs[0] != null) {
      setActiveTab(visibleTabs[0]);
    }
  }, [activeTab, visibleTabs]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && sectionCount === 0) return;
      onOpenChange(nextOpen);
    },
    [onOpenChange, sectionCount],
  );
  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, tab: TopicSummarySettingsTab) => {
      const currentIndex = visibleTabs.indexOf(tab);
      if (currentIndex < 0) return;
      let nextIndex: number | null = null;
      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % visibleTabs.length;
      if (event.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
      }
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = visibleTabs.length - 1;
      if (nextIndex == null) return;
      event.preventDefault();
      const nextTab = visibleTabs[nextIndex];
      if (nextTab == null) return;
      setActiveTab(nextTab);
      tabRefs.current.get(nextTab)?.focus();
    },
    [visibleTabs],
  );

  if (sectionCount === 0) return null;

  const contentClassName = `${APP_DIALOG_CONTENT_BASE_CLASS} top-1/2 flex ${dialogHeightClass(activeTab)} w-[calc(100%-2rem)] max-w-[70rem] -translate-y-1/2 flex-col overflow-hidden p-0`;

  return (
    <AppDialogShell open={open} onOpenChange={handleOpenChange} contentClassName={contentClassName}>
      <div className="flex h-[5.5rem] shrink-0 items-start justify-between gap-4 px-8 pt-6">
        <div className="min-w-0">
          <Dialog.Title className="text-xl font-semibold leading-7 text-text-primary">
            {t("topicSummarySettings.title")}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[13px] leading-5 text-text-muted">
            {topic != null
              ? `# ${topic.name}${normalizedChannelName ? ` · ${normalizedChannelName}` : ""}`
              : t("topicSummarySettings.description")}
          </Dialog.Description>
        </div>
        <DialogCloseIconButton />
      </div>

      <div
        className="flex h-[3.25rem] shrink-0 gap-1 border-b border-border-subtle px-8"
        role="tablist"
        aria-label={t("topicSummarySettings.title")}
      >
        {visibleTabs.map((tab) => {
          const selected = activeTab === tab;
          return (
            <button
              key={tab}
              ref={(node) => {
                if (node == null) tabRefs.current.delete(tab);
                else tabRefs.current.set(tab, node);
              }}
              type="button"
              role="tab"
              id={`${tabsId}-${tab}-tab`}
              aria-controls={`${tabsId}-${tab}-panel`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                selected
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-muted hover:text-text-primary"
              }`}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, tab)}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-bg-elevated">
        <div
          role="tabpanel"
          id={`${tabsId}-${activeTab}-panel`}
          aria-labelledby={`${tabsId}-${activeTab}-tab`}
          className="h-full min-h-0"
        >
          {activeTab === "topic" && showTopic ? <TopicSettingsSection vm={settingsVm} /> : null}
          {activeTab === "gates" && showGates ? <GatesSettingsSection vm={settingsVm} /> : null}
          {activeTab === "endpoints" && showEndpoints ? (
            <EndpointsSettingsSection vm={endpointsVm} />
          ) : null}
        </div>
      </div>
    </AppDialogShell>
  );
});
