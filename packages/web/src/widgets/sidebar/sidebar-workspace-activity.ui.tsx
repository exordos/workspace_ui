import React from "react";
import type { MessengerSidebarActivityCounts } from "~/entities/messenger/messenger-sidebar.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { SidebarActivityView } from "./sidebar-activity-view.ui";
import type { SidebarActivityProps } from "./sidebar-activity.types";

export interface WorkspaceSidebarActivityProps extends SidebarActivityProps {
  counts: MessengerSidebarActivityCounts;
}

export const WorkspaceSidebarActivity: React.FC<WorkspaceSidebarActivityProps> = ({
  open,
  onToggle,
  counts,
}) => {
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");

  return (
    <SidebarActivityView
      open={open}
      onToggle={onToggle}
      counts={{
        inbox: counts.inboxCount,
        mentions: counts.mentionsCount,
        drafts: null,
        favorites: null,
      }}
      disabledItems={{
        mentions: t("workspaceMessenger.mentionsUnsupported"),
        drafts: t("workspaceMessenger.draftsUnsupported"),
        reactions: t("workspaceMessenger.reactionsUnsupported"),
        feed: t("workspaceMessenger.feedUnsupported"),
      }}
      showPrivateNotes
      privateNotesDisabledReason={t("workspaceMessenger.privateNotesUnsupported")}
      isCompactDensity={isCompactDensity}
    />
  );
};
